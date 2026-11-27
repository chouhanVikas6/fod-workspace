import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import mapboxgl from "mapbox-gl";
import { invoke } from "@tauri-apps/api/core";
import { RootState, AppDispatch } from "@/store";
import { updateSelectedFod } from "@/store/actions/SelectedFod";
import { setSideBarVisibility } from "@/store/slices/selectedFod-slice";

const THUMBNAIL_MIN_ZOOM = 20;
const MAX_THUMBNAIL_MARKERS = 60;
const thumbCache = new Map<string, string>();
const MAX_THUMB_CACHE = 300;

const STATUS_BORDER_COLOR: Record<string, string> = {
  CLEARED: "#22c55e",
  ACCEPTED: "#ef4444",
  REJECTED: "#64748b",
  NEW: "#f59e0b",
};

interface ThumbnailMarkerEntry {
  marker: mapboxgl.Marker;
  el: HTMLDivElement;
  card: HTMLDivElement;
  statusDot: HTMLSpanElement;
  status: string;
  lon: number;
  lat: number;
}

function getFodLocation(fod: any): { lat: number; lon: number } | null {
  if (!fod) return null;
  if (fod._loc && typeof fod._loc.lat === 'number' && typeof fod._loc.lon === 'number') {
    if (Number.isFinite(fod._loc.lat) && Number.isFinite(fod._loc.lon)) {
      return { lat: fod._loc.lat, lon: fod._loc.lon };
    }
  }
  // Try fod.location if it exists
  if (fod.location && typeof fod.location === 'object' && typeof fod.location.lat === 'number' && typeof fod.location.lon === 'number') {
    if (Number.isFinite(fod.location.lat) && Number.isFinite(fod.location.lon)) {
      return { lat: fod.location.lat, lon: fod.location.lon };
    }
  }
  // Try stringified fod.location
  if (typeof fod.location === 'string') {
    try {
      const parsed = JSON.parse(fod.location);
      if (parsed && typeof parsed.lat === 'number' && typeof parsed.lon === 'number' && Number.isFinite(parsed.lat) && Number.isFinite(parsed.lon)) {
        return { lat: parsed.lat, lon: parsed.lon };
      }
    } catch {}
  }
  // Try FodPoint if it is a stringified object or array
  if (typeof fod.FodPoint === 'string') {
    try {
      const parsed = JSON.parse(fod.FodPoint);
      if (parsed && typeof parsed.lat === 'number' && typeof parsed.lon === 'number' && Number.isFinite(parsed.lat) && Number.isFinite(parsed.lon)) {
        return { lat: parsed.lat, lon: parsed.lon };
      }
    } catch {}
  }
  // Try FodPoint if it is an object
  if (fod.FodPoint && typeof fod.FodPoint === 'object' && typeof fod.FodPoint.lat === 'number' && typeof fod.FodPoint.lon === 'number') {
    if (Number.isFinite(fod.FodPoint.lat) && Number.isFinite(fod.FodPoint.lon)) {
      return { lat: fod.FodPoint.lat, lon: fod.FodPoint.lon };
    }
  }
  return null;
}

const FodMarkers = ({
  map,
  fods: propFods = null,
  onSelectFod = null,
}: {
  map: any;
  fods?: any[] | null;
  onSelectFod?: ((fod: any) => void) | null;
  selectedFod?: any;
  selectedGroupId?: any;
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const reduxFods = useSelector((state: RootState) => state.FodReducer.fods);
  const storeMissionNumber = useSelector((state: RootState) => state.MissionState?.missionNumber);
  const selectedQueue = useSelector((state: RootState) => state.MapReducer.selectedQueue);
  // When an explicit fods list is passed (mission explore), plot all of them;
  // otherwise plot the live queue filtered by the map's selected status set.
  const fods = propFods || reduxFods;
  const fodsToRender = useMemo(() => {
    if (propFods) return propFods;
    return reduxFods.filter((fod) => {
      if(!['ACCEPTED','NEW','CLEARED'].includes(fod.groupStatus) && selectedQueue.includes('REJECTED')){
        return true;
      }
      return selectedQueue.includes(fod.groupStatus)
    });
  }, [propFods, reduxFods, selectedQueue]);

  // Pick the biggest FOD in each group as the group representative & thumbnail source
  const groupRepresentatives = useMemo(() => {
    const byGroup = new Map<string | number, { fod: any; loc: { lat: number; lon: number } }>();
    for (let i = 0; i < fodsToRender.length; i++) {
      const fod = fodsToRender[i];
      const loc = getFodLocation(fod);
      if (!loc) continue;
      const key = fod.groupId ?? fod.id;
      if (key === undefined || key === null) continue;

      const existing = byGroup.get(key);
      const fodSize = Number(fod.size) || 0;
      const existingSize = existing ? Number(existing.fod.size) || 0 : -1;
      if (!existing || fodSize > existingSize) {
        byGroup.set(key, { fod, loc });
      }
    }
    return Array.from(byGroup.values());
  }, [fodsToRender]);

  const fodGeoJson = useMemo(() => ({
    type: "FeatureCollection",
    features: groupRepresentatives.map(({ fod, loc }) => ({
      type: "Feature",
      properties: {
        featureKey: String(fod.groupId ?? fod.id),
        groupId: fod.groupId,
        FodId: fod.id,
        FodPoint: fod.FodPoint,
        status: fod.groupStatus,
      },
      geometry: {
        type: "Point",
        coordinates: [loc.lon, loc.lat],
      },
    })),
  }), [groupRepresentatives]);
  // Keep the click handler (registered once on style load) pointed at the
  // current fod list without re-registering.
  const fodsRef = useRef(fods);
  fodsRef.current = fods;
  // Same deal for the selection callback — mission explore passes its own
  // handler so map clicks drive its group panel instead of the live sidebar.
  const onSelectFodRef = useRef(onSelectFod);
  onSelectFodRef.current = onSelectFod;
  const sourceId = "fodMarkers";
  const clusterLayerId = "clusters";
  const clusterCountLayerId = "cluster-count";
  const unclusteredHaloLayerId = "unclustered-point-halo";
  const unclusteredLayerId = "unclustered-point";
  const initialized = useRef(false);
  const thumbnailMarkersRef = useRef<Map<string, ThumbnailMarkerEntry>>(new Map());
  const loadedThumbKeysRef = useRef<Set<string>>(new Set());

  const updateDotLayerFilter = useCallback(() => {
    const m = map.current;
    if (!m) return;
    const loadedKeys = Array.from(loadedThumbKeysRef.current);
    const filter: any =
      loadedKeys.length === 0
        ? ["!", ["has", "point_count"]]
        : [
            "all",
            ["!", ["has", "point_count"]],
            ["!", ["in", ["get", "featureKey"], ["literal", loadedKeys]]],
          ];
    try {
      if (m.getLayer(unclusteredHaloLayerId)) {
        m.setFilter(unclusteredHaloLayerId, filter);
      }
      if (m.getLayer(unclusteredLayerId)) {
        m.setFilter(unclusteredLayerId, filter);
      }
    } catch {
      // Ignore if map style is mid-reload
    }
  }, [map]);

  const clearThumbnailMarkers = useCallback(() => {
    thumbnailMarkersRef.current.forEach(({ marker }) => marker.remove());
    thumbnailMarkersRef.current.clear();
    if (loadedThumbKeysRef.current.size > 0) {
      loadedThumbKeysRef.current.clear();
      updateDotLayerFilter();
    }
  }, [updateDotLayerFilter]);

  const syncThumbnailMarkers = useCallback(() => {
    const m = map.current;
    if (!m) return;

    const currentZoom = m.getZoom();
    if (currentZoom < THUMBNAIL_MIN_ZOOM) {
      clearThumbnailMarkers();
      return;
    }

    const bounds = m.getBounds();
    const visibleGroups: Array<{ key: string; fod: any; loc: { lat: number; lon: number } }> = [];

    for (let i = 0; i < groupRepresentatives.length; i++) {
      const { fod, loc } = groupRepresentatives[i];
      if (!bounds || bounds.contains([loc.lon, loc.lat])) {
        const key = String(fod.groupId ?? fod.id);
        visibleGroups.push({ key, fod, loc });
        if (visibleGroups.length >= MAX_THUMBNAIL_MARKERS) break;
      }
    }

    const nextKeys = new Set(visibleGroups.map((g) => g.key));
    let loadedSetChanged = false;
    // Remove markers no longer in viewport
    thumbnailMarkersRef.current.forEach((entry, key) => {
      if (!nextKeys.has(key)) {
        entry.marker.remove();
        thumbnailMarkersRef.current.delete(key);
        if (loadedThumbKeysRef.current.delete(key)) {
          loadedSetChanged = true;
        }
      }
    });

    for (const { key, fod, loc } of visibleGroups) {
      const borderColor = STATUS_BORDER_COLOR[fod.groupStatus] || STATUS_BORDER_COLOR.NEW;
      const existing = thumbnailMarkersRef.current.get(key);
      if (existing) {
        if (existing.lon !== loc.lon || existing.lat !== loc.lat) {
          existing.marker.setLngLat([loc.lon, loc.lat]);
          existing.lon = loc.lon;
          existing.lat = loc.lat;
        }
        if (existing.status !== fod.groupStatus) {
          existing.status = fod.groupStatus;
          existing.card.style.borderColor = borderColor;
          existing.statusDot.style.background = borderColor;
        }
        continue;
      }

      const resolvedMissionId = fod.missionId ?? fod.mission_id ?? storeMissionNumber;
      const inlineFrame =
        fod.frame && String(fod.frame).startsWith("data:")
          ? String(fod.frame)
          : null;
      const relPath =
        resolvedMissionId && fod.groupId !== undefined && fod.id !== undefined
          ? `${resolvedMissionId}/${fod.groupId}/${fod.id}.jpg`
          : null;

      if (!inlineFrame && !relPath) continue;

      // IMPORTANT: Never set `position: relative` or `transform` on the Mapbox marker root `el`;
      // Mapbox positions `.mapboxgl-marker` using `position: absolute; top: 0; left: 0; transform: translate(...)`.
      const el = document.createElement("div");
      el.className = "fod-group-thumb-marker";
      el.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 52px;
        height: 52px;
        border-radius: 10px;
        cursor: pointer;
        pointer-events: auto;
        display: none;
        z-index: 2;
      `;

      const card = document.createElement("div");
      card.style.cssText = `
        position: relative;
        width: 100%;
        height: 100%;
        border-radius: 10px;
        overflow: hidden;
        border: 2.5px solid ${borderColor};
        background: #0f172a;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.55), 0 0 0 1.5px rgba(255, 255, 255, 0.85);
        transition: transform 140ms ease, box-shadow 140ms ease;
      `;

      const img = document.createElement("img");
      img.alt = `FOD #${fod.groupId}`;
      img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
      img.onload = () => {
        if (!thumbnailMarkersRef.current.has(key)) return;
        el.style.display = "block";
        if (!loadedThumbKeysRef.current.has(key)) {
          loadedThumbKeysRef.current.add(key);
          updateDotLayerFilter();
        }
      };
      img.onerror = () => {
        el.style.display = "none";
        if (loadedThumbKeysRef.current.delete(key)) {
          updateDotLayerFilter();
        }
      };

      const badge = document.createElement("div");
      badge.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        background: rgba(15, 23, 42, 0.82);
        backdrop-filter: blur(2px);
        color: #f8fafc;
        font-size: 9px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-weight: 700;
        line-height: 14px;
        padding: 1px 3px;
      `;

      const statusDot = document.createElement("span");
      statusDot.style.cssText = `
        width: 5px;
        height: 5px;
        border-radius: 9999px;
        background: ${borderColor};
        flex-shrink: 0;
      `;

      const labelText = document.createElement("span");
      labelText.textContent = `#${fod.groupId}`;

      badge.appendChild(statusDot);
      badge.appendChild(labelText);
      card.appendChild(img);
      card.appendChild(badge);
      el.appendChild(card);

      el.addEventListener("mouseenter", () => {
        card.style.transform = "scale(1.12)";
        card.style.boxShadow =
          "0 8px 22px rgba(0, 0, 0, 0.65), 0 0 0 2px rgba(255, 255, 255, 0.95)";
        el.style.zIndex = "10";
      });
      el.addEventListener("mouseleave", () => {
        card.style.transform = "scale(1)";
        card.style.boxShadow =
          "0 4px 14px rgba(0, 0, 0, 0.55), 0 0 0 1.5px rgba(255, 255, 255, 0.85)";
        el.style.zIndex = "2";
      });

      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (onSelectFodRef.current) {
          onSelectFodRef.current(fod);
          return;
        }
        dispatch(setSideBarVisibility(true));
        dispatch(updateSelectedFod(fod) as any);
      });

      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([loc.lon, loc.lat])
        .addTo(m);
      thumbnailMarkersRef.current.set(key, {
        marker,
        el,
        card,
        statusDot,
        status: fod.groupStatus,
        lon: loc.lon,
        lat: loc.lat,
      });

      const initialUrl = inlineFrame || (relPath ? thumbCache.get(relPath) : undefined);
      if (initialUrl) {
        img.src = initialUrl;
      } else if (relPath) {
        invoke<string | null>("get_fod_image", { path: relPath })
          .then((dataUrl) => {
            if (!dataUrl || !thumbnailMarkersRef.current.has(key)) return;
            if (thumbCache.size >= MAX_THUMB_CACHE) {
              const oldest = thumbCache.keys().next().value;
              if (oldest) thumbCache.delete(oldest);
            }
            thumbCache.set(relPath, dataUrl);
            img.src = dataUrl;
          })
          .catch(() => {});
      }
    }

    if (loadedSetChanged) {
      updateDotLayerFilter();
    }
  }, [map, groupRepresentatives, storeMissionNumber, dispatch, clearThumbnailMarkers, updateDotLayerFilter]);

  useEffect(() => {
    if (!map.current) return;

    const onStyleLoad = () => {
      if (!map.current.getSource(sourceId)) {
        map.current.addSource(sourceId, {
          type: "geojson",
          data: fodGeoJson,
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50
        });
        // Cluster circles
        map.current.addLayer({
          id: clusterLayerId,
          type: "circle",
          source: sourceId,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": [
              "step",
              ["get", "point_count"],
              "#0ea5e9", 25,
              "#3b82f6", 100,
              "#2563eb"
            ],
            "circle-radius": [
              "step",
              ["get", "point_count"],
              18, 25,
              24, 100,
              30
            ],
            "circle-opacity": 0.92,
            "circle-stroke-width": 2.5,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-opacity": 0.95
          }
        });
        // Cluster count labels
        map.current.addLayer({
          id: clusterCountLayerId,
          type: "symbol",
          source: sourceId,
          filter: ["has", "point_count"],
          layout: {
            "text-field": "{point_count_abbreviated}",
            "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
            "text-size": 12
          },
          paint: {
            "text-color": "#ffffff"
          }
        });
        // Unclustered FOD outer glow halo for crisp contrast on satellite imagery
        map.current.addLayer({
          id: unclusteredHaloLayerId,
          type: "circle",
          source: sourceId,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": [
              "match",
              ["get", "status"],
              "CLEARED", "#22c55e",
              "ACCEPTED", "#ef4444",
              "REJECTED", "#64748b",
              "#f59e0b"
            ],
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              14, 9,
              18, 13,
              20, 16
            ],
            "circle-opacity": 0.3,
            "circle-blur": 0.45
          }
        });
        // Unclustered FOD core dot with crisp white ring
        map.current.addLayer({
          id: unclusteredLayerId,
          type: "circle",
          source: sourceId,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": [
              "match",
              ["get", "status"],
              "CLEARED", "#22c55e",
              "ACCEPTED", "#ef4444",
              "REJECTED", "#64748b",
              "#f59e0b"
            ],
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              14, 5,
              18, 7,
              20, 8.5
            ],
            "circle-stroke-width": 2.2,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-opacity": 0.95
          }
        });
        // Cluster click: zoom in
        // map.current.on("click", clusterLayerId, (e) => {
        //   const features = map.current.queryRenderedFeatures(e.point, { layers: [clusterLayerId] });
        //   const clusterId = features[0].properties.cluster_id;
        //   map.current.getSource(sourceId).getClusterExpansionZoom(clusterId, (err, zoom) => {
        //     if (err) return;
        //     map.current.easeTo({
        //       center: features[0].geometry.coordinates,
        //       zoom: zoom
        //     });
        //   });
        // });
        // Unclustered point click: select FOD
        const handleClick = (e) => {
          const feature = e.features[0];
          const id = feature.properties.FodId;
          const groupId = feature.properties.groupId;
          const fod = fodsRef.current.find(f => (String(f.id) === String(id)||String(f.groupId) === String(groupId)));
          console.log("id",id)
          console.log("groupId",groupId)
          console.log("fod",fod)
          if (fod) {
            if (onSelectFodRef.current) {
              onSelectFodRef.current(fod);
              return;
            }
            dispatch(setSideBarVisibility(true));
            dispatch(updateSelectedFod(fod) as any);
          }
        };
        map.current.off("click", unclusteredLayerId, handleClick);
        map.current.on("click", unclusteredLayerId, handleClick);
        
        // Change mouse cursor on hover
        map.current.on("mouseenter", clusterLayerId, () => {
          map.current.getCanvas().style.cursor = "pointer";
        });
        map.current.on("mouseleave", clusterLayerId, () => {
          map.current.getCanvas().style.cursor = "";
        });
        map.current.on("mouseenter", unclusteredLayerId, () => {
          map.current.getCanvas().style.cursor = "pointer";
        });
        map.current.on("mouseleave", unclusteredLayerId, () => {
          map.current.getCanvas().style.cursor = "";
        });
        initialized.current = true;
        updateDotLayerFilter();
      }
    };

    if (map.current.isStyleLoaded()) {
      onStyleLoad();
    } else {
      // Cover the case where 'style.load' already fired before this component
      // mounted (e.g. the explore map, whose parent sets up the map first).
      // onStyleLoad is idempotent (guards on getSource + initialized), so
      // registering multiple triggers is safe.
      map.current.once('style.load', onStyleLoad);
      map.current.once('idle', onStyleLoad);
    }

    return () => {
      if (map.current) {
        map.current.off('style.load', onStyleLoad);
        map.current.off('idle', onStyleLoad);
        if (map.current.getLayer(clusterLayerId)) map.current.removeLayer(clusterLayerId);
        if (map.current.getLayer(clusterCountLayerId)) map.current.removeLayer(clusterCountLayerId);
        if (map.current.getLayer(unclusteredHaloLayerId)) map.current.removeLayer(unclusteredHaloLayerId);
        if (map.current.getLayer(unclusteredLayerId)) map.current.removeLayer(unclusteredLayerId);
        if (map.current.getSource(sourceId)) map.current.removeSource(sourceId);
      }
      initialized.current = false;
    };
  }, [map, map.current]);

  // Data update: Debounce source data update so rapid streaming updates don't lock Mapbox worker
  useEffect(() => {
    if (!map.current) return;
    const timer = setTimeout(() => {
      try {
        const source = map.current?.getSource(sourceId);
        if (source) {
          source.setData(fodGeoJson);
        }
      } catch (err) {
        console.error("Failed to update mapbox fodMarkers source:", err);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [fodGeoJson]);

  // Show biggest-FOD group thumbnails when zoomed in very close (zoom >= THUMBNAIL_MIN_ZOOM)
  const syncThumbnailsRef = useRef(syncThumbnailMarkers);
  syncThumbnailsRef.current = syncThumbnailMarkers;

  useEffect(() => {
    syncThumbnailMarkers();
  }, [syncThumbnailMarkers]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;

    let wasAboveThreshold = m.getZoom() >= THUMBNAIL_MIN_ZOOM;
    const handleZoom = () => {
      const isAboveThreshold = m.getZoom() >= THUMBNAIL_MIN_ZOOM;
      if (isAboveThreshold !== wasAboveThreshold) {
        wasAboveThreshold = isAboveThreshold;
        syncThumbnailsRef.current();
      }
    };
    const handleViewChange = () => {
      wasAboveThreshold = m.getZoom() >= THUMBNAIL_MIN_ZOOM;
      syncThumbnailsRef.current();
    };
    m.on("zoom", handleZoom);
    m.on("zoomend", handleViewChange);
    m.on("moveend", handleViewChange);

    return () => {
      m.off("zoom", handleZoom);
      m.off("zoomend", handleViewChange);
      m.off("moveend", handleViewChange);
      clearThumbnailMarkers();
    };
  }, [map, clearThumbnailMarkers]);

  return null;
};

export default FodMarkers;

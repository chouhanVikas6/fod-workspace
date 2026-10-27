import { useEffect, useMemo, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "@/store";
import { updateSelectedFod } from "@/store/actions/SelectedFod";
import { setSideBarVisibility } from "@/store/slices/selectedFod-slice";
import { AppDispatch } from "@/store";

function getFodLocation(fod: any): { lat: number; lon: number } | null {
  // Try fod.location if it exists
  if (fod.location && typeof fod.location === 'object' && typeof fod.location.lat === 'number' && typeof fod.location.lon === 'number') {
    return fod.location;
  }
  // Try FodPoint if it is a stringified object or array
  if (typeof fod.FodPoint === 'string') {
    try {
      const parsed = JSON.parse(fod.FodPoint);
      if (parsed && typeof parsed.lat === 'number' && typeof parsed.lon === 'number') {
        return parsed;
      }
    } catch {}
  }
  // Try FodPoint if it is an object
  if (fod.FodPoint && typeof fod.FodPoint === 'object' && typeof fod.FodPoint.lat === 'number' && typeof fod.FodPoint.lon === 'number') {
    return fod.FodPoint;
  }
  return null;
}

const FodMarkers = ({ map, fods: propFods = null, onSelectFod = null }: { map: any; fods?: any[] | null; onSelectFod?: ((fod: any) => void) | null }) => {
  const dispatch = useDispatch<AppDispatch>();
  const reduxFods = useSelector((state: RootState) => state.FodReducer.fods);
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
  const fodGeoJson = useMemo(() => ({
    type: "FeatureCollection",
    features: fodsToRender
      .map(fod => {
        const loc = getFodLocation(fod);
        if (!loc) return null;
        return {
          type: "Feature",
          properties: {
            groupId: fod.groupId,
            FodId: fod.id,
            FodPoint: fod.FodPoint,
            status: fod.groupStatus,
          },
          geometry: {
            type: "Point",
            coordinates: [loc.lon, loc.lat]
          }
        };
      })
      .filter(Boolean)
  }), [fodsToRender]);
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
  const unclusteredLayerId = "unclustered-point";
  const initialized = useRef(false);

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
            "circle-color": "#51bbd6",
            "circle-radius": [
              "step",
              ["get", "point_count"],
              20, 100,
              30, 750,
              40
            ]
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
          }
        });
        // Unclustered FODs
        map.current.addLayer({
          id: unclusteredLayerId,
          type: "circle",
          source: sourceId,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": [
              "match",
              ["get", "status"],
              "CLEARED", "#00ff00",
              "ACCEPTED", "#ff0000",
              "REJECTED", "#888888",
              "#ffff00" // default
            ],
            "circle-radius": 7
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
        if (map.current.getLayer(unclusteredLayerId)) map.current.removeLayer(unclusteredLayerId);
        if (map.current.getSource(sourceId)) map.current.removeSource(sourceId);
      }
      initialized.current = false;
    };
  }, [map, map.current]);

  // Data update: Only update source data when fods change
  useEffect(() => {
    if (!map.current) return;
    const source = map.current.getSource(sourceId);
    if (source) {
      source.setData(fodGeoJson);
    }
  }, [fodGeoJson]);

  return null;
};

export default FodMarkers;

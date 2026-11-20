import type { GeoPoint } from '../../store';

export type ToolMode = 'select' | 'boundary' | 'draw' | 'waypoint';

export type MapLayerStyle = 'hybrid' | 'satellite' | 'offline' | 'street' | 'tactical';

export type InspectorTab = 'boundary' | 'pathways' | 'drive';

export interface VehicleDisplayState {
  lat: number;
  lon: number;
  heading: number;
  speedKmh: number;
  activePathIndex: number | null;
  activePathName: string | null;
  progressPct: number;
  distanceM: number;
  totalLengthM: number;
  lapCount: number;
  isPreview: boolean;
}

export interface MapCanvasHandle {
  fitAll: () => void;
  fitBoundary: () => void;
  flyToPoint: (pt: GeoPoint, zoom?: number) => void;
  finishDraft: () => void;
  undoDraft: () => void;
  cancelDraft: () => void;
  redrawTiles: () => void;
}

export interface DraftStatus {
  kind: 'draw' | 'waypoint' | null;
  pointCount: number;
  lengthM: number;
  lastBearingDeg: number | null;
  lastSegmentM: number | null;
}

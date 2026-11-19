import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface SimulatorConfig {
  grpc_endpoint: string;
  throughput_hz: number;
  batch_size: number;
  total_target_count: number | null;
  mission_id: number;
  sysid: string;
  auto_react: boolean;
  device_count: number;
}

export interface CameraConfig {
  cam_id: string;
  enabled: boolean;
  connected: boolean;
  paused: boolean;
  intr_fps: number;
  vg_fps: number;
  ms_fps: number;
  lateral_offset_m: number;
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export type PathKind = 'auto_sweep' | 'waypoint' | 'freehand';
export type PathMode = 'auto_sweep' | 'custom_sequence';
export type LoopMode = 'loop' | 'ping_pong' | 'once';

export interface Pathway {
  id: string;
  name: string;
  kind: PathKind;
  points: GeoPoint[];
  enabled: boolean;
  reversed: boolean;
  speed_kmh: number | null;
  color: string | null;
}

export interface HumanDriveConfig {
  enabled: boolean;
  corner_smoothness: number;
  lateral_weave_m: number;
  speed_variance_pct: number;
  smooth_curves: boolean;
}

export interface CompiledSegmentPreview {
  pathway_id: string;
  pathway_name: string;
  pathway_index: number;
  is_transit: boolean;
  color: string | null;
  points: GeoPoint[];
  length_m: number;
}

export interface CompiledRoutePreview {
  segments: CompiledSegmentPreview[];
  total_length_m: number;
  estimated_duration_secs: number;
  boundary_area_m2: number;
  boundary_perimeter_m: number;
  auto_sweep_lanes: GeoPoint[][];
}

export interface LocalTilesInfo {
  available: boolean;
  base_url: string;
  min_zoom: number;
  max_zoom: number;
}

export interface LocationConfig {
  boundary_points: GeoPoint[];
  enforce_boundary: boolean;
  vehicle_speed_kmh: number;
  sweep_passes: number;
  lane_width_m: number;
  sweep_angle_deg: number | null;
  reverse_sweep: boolean;
  serpentine_sweep: boolean;
  path_mode: PathMode;
  pathways: Pathway[];
  connect_pathways: boolean;
  loop_mode: LoopMode;
  human_drive: HumanDriveConfig;
}

export interface HealthConfig {
  cpu_pct: number;
  mem_pct: number;
  disk_pct: number;
  temp_c: number;
  gnss_fix: string;
  gnss_sd: number;
  voltage: number;
  ping_latency_ms: number;
}

export interface RandomizationConfig {
  min_size_cm: number;
  max_size_cm: number;
  min_confidence: number;
  max_confidence: number;
  weight_metallic: number;
  weight_non_metallic: number;
  weight_organic: number;
  weight_rock: number;
  cluster_probability: number;
}

export interface CustomPayloadConfig {
  use_custom: boolean;
  custom_class?: string | null;
  corrupt_image: boolean;
  force_invalid_coords: boolean;
  duplicate_uuid?: string | null;
  extra_metadata: string;
}

export interface DeviceStreamStatus {
  device_id: string;
  node_name: string;
  connected: boolean;
  sent: number;
  accepted: number;
  rejected: number;
  duplicate: number;
}

const LOCATION_STORAGE_KEY = 'fod_sim_location_v2';

export interface SimulatorTelemetry {
  running: boolean;
  paused: boolean;
  total_sent: number;
  total_accepted: number;
  total_rejected: number;
  total_duplicate: number;
  current_hz: number;
  current_lat: number;
  current_lon: number;
  current_heading: number;
  current_speed_kmh: number;
  active_camera_count: number;
  last_status: string;
  uptime_secs: number;
  connected_devices: number;
  devices: DeviceStreamStatus[];
  active_path_index: number | null;
  active_path_name: string | null;
  route_progress_pct: number;
  route_distance_m: number;
  total_route_length_m: number;
  lap_count: number;
}

export interface CommandLogEntry {
  id: string;
  timestamp: number;
  raw_command: string;
  command_type: string;
  target_cam: string | null;
  mission_id: number | null;
  status: string;
  auto_reacted: boolean;
}

export interface ImageFolderItem {
  path: string;
  filename: string;
  size_bytes: number;
  thumbnail_base64: string;
}

export interface FullStateResponse {
  config: SimulatorConfig;
  cameras: CameraConfig[];
  location: LocationConfig;
  health: HealthConfig;
  random: RandomizationConfig;
  custom: CustomPayloadConfig;
  command_logs: CommandLogEntry[];
}

interface SimulatorStore {
  // State
  config: SimulatorConfig;
  cameras: CameraConfig[];
  location: LocationConfig;
  compiledRoute: CompiledRoutePreview | null;
  localTiles: LocalTilesInfo;
  health: HealthConfig;
  random: RandomizationConfig;
  custom: CustomPayloadConfig;
  telemetry: SimulatorTelemetry;
  commandLogs: CommandLogEntry[];
  folderImages: ImageFolderItem[];
  currentFolderPath: string;
  activeTab: 'throughput' | 'cameras' | 'health' | 'location' | 'images' | 'custom';
  grpcConnected: boolean | null;
  loading: boolean;
  error: string | null;
  theme: 'dark' | 'light';

  // Actions
  toggleTheme: () => void;
  setActiveTab: (tab: 'throughput' | 'cameras' | 'health' | 'location' | 'images' | 'custom') => void;
  loadInitialState: () => Promise<void>;
  setupListeners: () => Promise<() => void>;

  // Controls
  startSimulation: () => Promise<void>;
  pauseSimulation: () => Promise<void>;
  resumeSimulation: () => Promise<void>;
  stopSimulation: () => Promise<void>;
  stepSingleFod: () => Promise<void>;
  burstFods: (count: number) => Promise<void>;
  testGrpcConnection: (endpoint: string) => Promise<boolean>;

  // Config updates
  updateConfig: (cfg: Partial<SimulatorConfig>) => Promise<void>;
  updateCamera: (camId: string, patch: Partial<CameraConfig>) => Promise<void>;
  setAllCamerasState: (enabled?: boolean, connected?: boolean, paused?: boolean) => Promise<void>;
  updateLocation: (loc: Partial<LocationConfig>) => Promise<void>;
  refreshCompiledRoute: () => Promise<void>;
  resetVehiclePosition: () => Promise<void>;
  setVehicleProgress: (progressPct: number) => Promise<void>;
  updateHealth: (h: Partial<HealthConfig>) => Promise<void>;
  updateRandom: (r: Partial<RandomizationConfig>) => Promise<void>;
  updateCustom: (c: Partial<CustomPayloadConfig>) => Promise<void>;
  scanImagesFolder: (path: string) => Promise<void>;
  injectMockCommand: (raw: string) => Promise<void>;
  clearCommandLogs: () => void;
}

export const useSimulatorStore = create<SimulatorStore>((set, get) => ({
  config: {
    grpc_endpoint: 'http://127.0.0.1:50051',
    throughput_hz: 5.0,
    batch_size: 5,
    total_target_count: 2000,
    mission_id: 1,
    sysid: 'sim-vehicle-01',
    auto_react: true,
    device_count: 1,
  },
  cameras: [],
  location: {
    boundary_points: [
      { lat: 9.9400, lon: 76.2700 },
      { lat: 9.9400, lon: 76.2800 },
      { lat: 9.9500, lon: 76.2800 },
      { lat: 9.9500, lon: 76.2700 },
    ],
    enforce_boundary: true,
    vehicle_speed_kmh: 25.0,
    sweep_passes: 3,
    lane_width_m: 10.0,
    sweep_angle_deg: null,
    reverse_sweep: false,
    serpentine_sweep: true,
    path_mode: 'auto_sweep',
    pathways: [],
    connect_pathways: true,
    loop_mode: 'loop',
    human_drive: {
      enabled: true,
      corner_smoothness: 0.7,
      lateral_weave_m: 0.35,
      speed_variance_pct: 6.0,
      smooth_curves: true,
    },
  },
  compiledRoute: null,
  localTiles: {
    available: false,
    base_url: 'http://127.0.0.1:50055/tiles',
    min_zoom: 0,
    max_zoom: 22,
  },
  health: {
    cpu_pct: 35.0,
    mem_pct: 42.0,
    disk_pct: 68.0,
    temp_c: 54.0,
    gnss_fix: 'RTK',
    gnss_sd: 0.015,
    voltage: 12.6,
    ping_latency_ms: 12,
  },
  random: {
    min_size_cm: 1.0,
    max_size_cm: 20.0,
    min_confidence: 0.80,
    max_confidence: 0.99,
    weight_metallic: 40.0,
    weight_non_metallic: 30.0,
    weight_organic: 20.0,
    weight_rock: 10.0,
    cluster_probability: 0.25,
  },
  custom: {
    use_custom: false,
    custom_class: null,
    corrupt_image: false,
    force_invalid_coords: false,
    duplicate_uuid: null,
    extra_metadata: '',
  },
  telemetry: {
    running: false,
    paused: false,
    total_sent: 0,
    total_accepted: 0,
    total_rejected: 0,
    total_duplicate: 0,
    current_hz: 5.0,
    current_lat: 9.9450,
    current_lon: 76.2750,
    current_heading: 180.0,
    current_speed_kmh: 25.0,
    active_camera_count: 26,
    last_status: 'Idle',
    uptime_secs: 0,
    connected_devices: 0,
    devices: [],
    active_path_index: null,
    active_path_name: null,
    route_progress_pct: 0,
    route_distance_m: 0,
    total_route_length_m: 0,
    lap_count: 0,
  },
  commandLogs: [],
  folderImages: [],
  currentFolderPath: '',
  activeTab: 'throughput',
  grpcConnected: null,
  loading: false,
  error: null,
  theme: typeof window !== 'undefined' && localStorage.getItem('fod_sim_theme') === 'light' ? 'light' : 'dark',

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    if (typeof window !== 'undefined') {
      localStorage.setItem('fod_sim_theme', next);
      if (next === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
    set({ theme: next });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  loadInitialState: async () => {
    try {
      set({ loading: true });
      const [full, tilesInfo] = await Promise.all([
        invoke<FullStateResponse>('get_all_state'),
        invoke<LocalTilesInfo>('get_local_tiles_info').catch(() => ({
          available: false,
          base_url: 'http://127.0.0.1:50055/tiles',
          min_zoom: 0,
          max_zoom: 22,
        })),
      ]);

      let resolvedLocation = full.location;
      let compiledRoute: CompiledRoutePreview | null = null;

      if (typeof window !== 'undefined') {
        try {
          const rawSaved = localStorage.getItem(LOCATION_STORAGE_KEY);
          if (rawSaved) {
            const parsed = JSON.parse(rawSaved);
            if (parsed && Array.isArray(parsed.boundary_points) && parsed.boundary_points.length >= 3) {
              resolvedLocation = {
                ...full.location,
                ...parsed,
                human_drive: {
                  ...full.location.human_drive,
                  ...(parsed.human_drive || {}),
                },
              };
              compiledRoute = await invoke<CompiledRoutePreview>('update_location_config', {
                location: resolvedLocation,
              });
            }
          }
        } catch (e) {
          console.warn('Failed to restore saved location config:', e);
        }
      }

      if (!compiledRoute) {
        compiledRoute = await invoke<CompiledRoutePreview>('get_compiled_route').catch(() => null);
      }

      set({
        config: full.config,
        cameras: full.cameras,
        location: resolvedLocation,
        compiledRoute,
        localTiles: tilesInfo,
        health: full.health,
        random: full.random,
        custom: full.custom,
        commandLogs: full.command_logs || [],
        loading: false,
      });
    } catch (err: unknown) {
      console.error('Failed to load initial state:', err);
      set({ loading: false, error: String(err) });
    }
  },

  setupListeners: async () => {
    const unlistenTelemetry = await listen<SimulatorTelemetry>('simulator-telemetry', (event) => {
      set({ telemetry: event.payload });
    });

    const unlistenCommands = await listen<CommandLogEntry>('command-event', async (event) => {
      set((state) => ({
        commandLogs: [event.payload, ...state.commandLogs.slice(0, 99)],
      }));
      if (event.payload.auto_reacted) {
        try {
          const full = await invoke<FullStateResponse>('get_all_state');
          set({
            cameras: full.cameras,
          });
        } catch (e) {
          console.error('Failed to reload state after command', e);
        }
      }
    });

    const unlistenQuota = await listen<number>('simulator-quota-reached', (_event) => {
      set((state) => ({
        telemetry: { ...state.telemetry, running: false, last_status: 'Quota Reached' },
      }));
    });

    return () => {
      unlistenTelemetry();
      unlistenCommands();
      unlistenQuota();
    };
  },

  startSimulation: async () => {
    try {
      set({ error: null });
      await invoke('start_simulation');
      set((state) => ({
        telemetry: { ...state.telemetry, running: true, paused: false, last_status: 'Streaming' },
      }));
    } catch (err: unknown) {
      set({ error: String(err) });
    }
  },

  pauseSimulation: async () => {
    try {
      await invoke('pause_simulation');
      set((state) => ({
        telemetry: { ...state.telemetry, paused: true, last_status: 'Paused' },
      }));
    } catch (err: unknown) {
      set({ error: String(err) });
    }
  },

  resumeSimulation: async () => {
    try {
      await invoke('resume_simulation');
      set((state) => ({
        telemetry: { ...state.telemetry, paused: false, last_status: 'Streaming' },
      }));
    } catch (err: unknown) {
      set({ error: String(err) });
    }
  },

  stopSimulation: async () => {
    try {
      await invoke('stop_simulation');
      set((state) => ({
        telemetry: { ...state.telemetry, running: false, paused: false, last_status: 'Stopped' },
      }));
    } catch (err: unknown) {
      set({ error: String(err) });
    }
  },

  stepSingleFod: async () => {
    try {
      await invoke('step_single_fod');
    } catch (err: unknown) {
      set({ error: String(err) });
    }
  },

  burstFods: async (count: number) => {
    try {
      await invoke('burst_fods', { count });
    } catch (err: unknown) {
      set({ error: String(err) });
    }
  },

  testGrpcConnection: async (endpoint: string) => {
    try {
      const ok = await invoke<boolean>('test_grpc_connection', { endpoint });
      set({ grpcConnected: ok });
      return ok;
    } catch (err: unknown) {
      set({ grpcConnected: false, error: String(err) });
      return false;
    }
  },

  updateConfig: async (patch) => {
    const updated = { ...get().config, ...patch };
    set({ config: updated });
    await invoke('update_config', { config: updated });
  },

  updateCamera: async (camId, patch) => {
    const cams = get().cameras.map((c) => (c.cam_id === camId ? { ...c, ...patch } : c));
    set({ cameras: cams });
    await invoke('update_camera_config', { cameras: cams });
  },

  setAllCamerasState: async (enabled, connected, paused) => {
    const cams = get().cameras.map((c) => ({
      ...c,
      ...(enabled !== undefined ? { enabled } : {}),
      ...(connected !== undefined ? { connected } : {}),
      ...(paused !== undefined ? { paused } : {}),
    }));
    set({ cameras: cams });
    await invoke('update_camera_config', { cameras: cams });
  },

  updateLocation: async (patch) => {
    const prev = get().location;
    const updated: LocationConfig = {
      ...prev,
      ...patch,
      human_drive: patch.human_drive
        ? { ...prev.human_drive, ...patch.human_drive }
        : prev.human_drive,
    };
    set({ location: updated });
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(updated));
      } catch {}
    }
    const preview = await invoke<CompiledRoutePreview>('update_location_config', {
      location: updated,
    });
    set({ compiledRoute: preview });
  },

  refreshCompiledRoute: async () => {
    const preview = await invoke<CompiledRoutePreview>('get_compiled_route');
    set({ compiledRoute: preview });
  },

  resetVehiclePosition: async () => {
    await invoke('reset_vehicle_position');
  },

  setVehicleProgress: async (progressPct: number) => {
    await invoke('set_vehicle_progress', { progressPct });
  },

  updateHealth: async (patch) => {
    const updated = { ...get().health, ...patch };
    set({ health: updated });
    await invoke('update_health_config', { health: updated });
  },

  updateRandom: async (patch) => {
    const updated = { ...get().random, ...patch };
    set({ random: updated });
    await invoke('update_random_config', { random: updated });
  },

  updateCustom: async (patch) => {
    const updated = { ...get().custom, ...patch };
    set({ custom: updated });
    await invoke('update_custom_config', { custom: updated });
  },

  scanImagesFolder: async (path: string) => {
    try {
      set({ loading: true, error: null });
      const items = await invoke<ImageFolderItem[]>('scan_images_folder', { folderPath: path });
      set({ folderImages: items, currentFolderPath: path, loading: false });
    } catch (err: unknown) {
      set({ loading: false, error: String(err) });
    }
  },

  injectMockCommand: async (raw: string) => {
    try {
      const entry = await invoke<CommandLogEntry>('inject_mock_command', { rawCmd: raw });
      set((state) => ({
        commandLogs: [entry, ...state.commandLogs.slice(0, 99)],
      }));
    } catch (err: unknown) {
      set({ error: String(err) });
    }
  },

  clearCommandLogs: () => {
    set({ commandLogs: [] });
  },
}));
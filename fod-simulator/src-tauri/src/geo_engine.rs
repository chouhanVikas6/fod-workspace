use crate::models::{
    CompiledRoutePreview, CompiledSegmentPreview, GeoPoint, HumanDriveConfig, LocationConfig,
    LoopMode, PathKind, PathMode,
};
use rand::Rng;

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct Waypoint {
    pub lat: f64,
    pub lon: f64,
}

#[derive(Debug, Clone)]
pub struct VehiclePosition {
    pub lat: f64,
    pub lon: f64,
    pub heading_deg: f64,
    pub speed_kmh: f64,
    pub active_path_index: Option<usize>,
    pub active_path_name: Option<String>,
    pub route_distance_m: f64,
    pub total_route_length_m: f64,
    pub route_progress_pct: f64,
}

#[derive(Debug, Clone)]
struct RouteSample {
    lat: f64,
    lon: f64,
    cum_dist_m: f64,
    bearing_deg: f64,
    curvature_rad_per_m: f64,
    speed_kmh: f64,
    pathway_index: usize,
    pathway_name: String,
    jump_from_prev: bool,
}

struct ActivePathSpec {
    id: String,
    name: String,
    index: usize,
    kind: PathKind,
    color: Option<String>,
    points: Vec<GeoPoint>,
    speed_kmh: f64,
}

pub struct GeoEngine {
    pub polygon: Vec<(f64, f64)>,
    pub enforce_boundary: bool,
    pub loop_mode: LoopMode,
    pub human_drive: HumanDriveConfig,
    pub base_speed_kmh: f64,
    samples: Vec<RouteSample>,
    total_length_m: f64,
    compiled_preview: CompiledRoutePreview,
}

impl GeoEngine {
    pub fn new(config: &LocationConfig) -> Self {
        let polygon = config.polygon();
        let enforce_boundary = config.enforce_boundary;
        let loop_mode = config.loop_mode;
        let human_drive = config.human_drive.clone();
        let base_speed_kmh = config.vehicle_speed_kmh.max(1.0);

        let auto_sweep_lanes = Self::generate_auto_sweep_lanes(config);
        let (boundary_area_m2, boundary_perimeter_m) = polygon_area_and_perimeter_m(&polygon);

        let mut active_specs: Vec<ActivePathSpec> = Vec::new();
        if config.path_mode == PathMode::CustomSequence {
            for (idx, p) in config.pathways.iter().enumerate() {
                if !p.enabled || p.points.len() < 2 {
                    continue;
                }
                let mut pts = p.points.clone();
                if p.reversed {
                    pts.reverse();
                }
                active_specs.push(ActivePathSpec {
                    id: p.id.clone(),
                    name: p.name.clone(),
                    index: idx,
                    kind: p.kind,
                    color: p.color.clone(),
                    points: pts,
                    speed_kmh: p.speed_kmh.unwrap_or(base_speed_kmh).max(1.0),
                });
            }
        }

        // Fallback gracefully to auto-sweep lanes in AutoSweep mode or when CustomSequence has no active pathways
        if active_specs.is_empty() {
            for (idx, lane) in auto_sweep_lanes.iter().enumerate() {
                if lane.len() < 2 {
                    continue;
                }
                active_specs.push(ActivePathSpec {
                    id: format!("sweep-{}", idx + 1),
                    name: format!("Sweep #{}", idx + 1),
                    index: idx,
                    kind: PathKind::AutoSweep,
                    color: None,
                    points: lane.clone(),
                    speed_kmh: base_speed_kmh,
                });
            }
        }

        let mut samples: Vec<RouteSample> = Vec::new();
        let mut preview_segments: Vec<CompiledSegmentPreview> = Vec::new();
        let mut cum_dist = 0.0_f64;
        let mut est_duration_secs = 0.0_f64;

        let smoothness = human_drive.corner_smoothness.clamp(0.0, 1.0);
        let smooth_curves = human_drive.smooth_curves;

        for (spec_pos, spec) in active_specs.iter().enumerate() {
            let processed_pts = if smooth_curves {
                match spec.kind {
                    PathKind::Freehand => smooth_freehand_points(&spec.points),
                    PathKind::Waypoint | PathKind::AutoSweep => {
                        fillet_polyline_corners(&spec.points, smoothness)
                    }
                }
            } else {
                dedupe_consecutive_points(&spec.points)
            };

            if processed_pts.len() < 2 {
                continue;
            }

            // Connect from previous path if needed
            let mut jump_entry = false;
            if let Some(prev_sample) = samples.last().cloned() {
                let first_pt = processed_pts[0];
                let gap = haversine_distance(
                    prev_sample.lat,
                    prev_sample.lon,
                    first_pt.lat,
                    first_pt.lon,
                );
                if config.connect_pathways && gap > 0.5 {
                    let transit_pts = build_transit_points(
                        GeoPoint {
                            lat: prev_sample.lat,
                            lon: prev_sample.lon,
                        },
                        first_pt,
                    );
                    let transit_len = polyline_length_m(&transit_pts);
                    let transit_speed_ms = (base_speed_kmh * 1000.0) / 3600.0;
                    est_duration_secs += transit_len / transit_speed_ms.max(0.5);

                    preview_segments.push(CompiledSegmentPreview {
                        pathway_id: format!("transit-{}-{}", spec_pos, spec.id),
                        pathway_name: format!("Transit → {}", spec.name),
                        pathway_index: spec.index,
                        is_transit: true,
                        color: None,
                        points: transit_pts.clone(),
                        length_m: transit_len,
                    });

                    // Append transit interior/end samples (skip first since it coincides with prev_sample)
                    for w in transit_pts.windows(2) {
                        let seg_len = haversine_distance(w[0].lat, w[0].lon, w[1].lat, w[1].lon);
                        if seg_len < 1e-3 {
                            continue;
                        }
                        if let Some(last) = samples.last_mut() {
                            last.bearing_deg =
                                calculate_bearing(w[0].lat, w[0].lon, w[1].lat, w[1].lon);
                        }
                        cum_dist += seg_len;
                        let b = calculate_bearing(w[0].lat, w[0].lon, w[1].lat, w[1].lon);
                        samples.push(RouteSample {
                            lat: w[1].lat,
                            lon: w[1].lon,
                            cum_dist_m: cum_dist,
                            bearing_deg: b,
                            curvature_rad_per_m: 0.0,
                            speed_kmh: base_speed_kmh,
                            pathway_index: spec.index,
                            pathway_name: format!("Transit → {}", spec.name),
                            jump_from_prev: false,
                        });
                    }
                } else if !config.connect_pathways && gap > 0.5 {
                    jump_entry = true;
                }
            }

            let seg_total_len = polyline_length_m(&processed_pts);
            let seg_speed_ms = (spec.speed_kmh * 1000.0) / 3600.0;
            est_duration_secs += seg_total_len / seg_speed_ms.max(0.5);

            preview_segments.push(CompiledSegmentPreview {
                pathway_id: spec.id.clone(),
                pathway_name: spec.name.clone(),
                pathway_index: spec.index,
                is_transit: false,
                color: spec.color.clone(),
                points: processed_pts.clone(),
                length_m: seg_total_len,
            });

            if samples.is_empty() || jump_entry {
                let first = processed_pts[0];
                let second = processed_pts[1];
                let b = calculate_bearing(first.lat, first.lon, second.lat, second.lon);
                samples.push(RouteSample {
                    lat: first.lat,
                    lon: first.lon,
                    cum_dist_m: cum_dist,
                    bearing_deg: b,
                    curvature_rad_per_m: 0.0,
                    speed_kmh: spec.speed_kmh,
                    pathway_index: spec.index,
                    pathway_name: spec.name.clone(),
                    jump_from_prev: jump_entry,
                });
            }

            for w in processed_pts.windows(2) {
                let seg_len = haversine_distance(w[0].lat, w[0].lon, w[1].lat, w[1].lon);
                if seg_len < 1e-3 {
                    continue;
                }
                let b = calculate_bearing(w[0].lat, w[0].lon, w[1].lat, w[1].lon);
                if let Some(last) = samples.last_mut() {
                    last.bearing_deg = b;
                    last.speed_kmh = spec.speed_kmh;
                    last.pathway_index = spec.index;
                    last.pathway_name = spec.name.clone();
                }
                cum_dist += seg_len;
                samples.push(RouteSample {
                    lat: w[1].lat,
                    lon: w[1].lon,
                    cum_dist_m: cum_dist,
                    bearing_deg: b,
                    curvature_rad_per_m: 0.0,
                    speed_kmh: spec.speed_kmh,
                    pathway_index: spec.index,
                    pathway_name: spec.name.clone(),
                    jump_from_prev: false,
                });
            }
        }

        // Loop closure return transit when looping & connected
        if loop_mode == LoopMode::Loop && config.connect_pathways && samples.len() >= 2 {
            let last_pt = GeoPoint {
                lat: samples.last().unwrap().lat,
                lon: samples.last().unwrap().lon,
            };
            let first_pt = GeoPoint {
                lat: samples[0].lat,
                lon: samples[0].lon,
            };
            let return_gap =
                haversine_distance(last_pt.lat, last_pt.lon, first_pt.lat, first_pt.lon);
            if return_gap > 1.0 {
                let return_pts = build_transit_points(last_pt, first_pt);
                let return_len = polyline_length_m(&return_pts);
                let transit_speed_ms = (base_speed_kmh * 1000.0) / 3600.0;
                est_duration_secs += return_len / transit_speed_ms.max(0.5);
                let first_idx = samples[0].pathway_index;

                preview_segments.push(CompiledSegmentPreview {
                    pathway_id: "transit-loop-return".to_string(),
                    pathway_name: "Return to Start".to_string(),
                    pathway_index: first_idx,
                    is_transit: true,
                    color: None,
                    points: return_pts.clone(),
                    length_m: return_len,
                });

                for w in return_pts.windows(2) {
                    let seg_len = haversine_distance(w[0].lat, w[0].lon, w[1].lat, w[1].lon);
                    if seg_len < 1e-3 {
                        continue;
                    }
                    let b = calculate_bearing(w[0].lat, w[0].lon, w[1].lat, w[1].lon);
                    if let Some(last) = samples.last_mut() {
                        last.bearing_deg = b;
                        last.speed_kmh = base_speed_kmh;
                        last.pathway_name = "Return to Start".to_string();
                    }
                    cum_dist += seg_len;
                    samples.push(RouteSample {
                        lat: w[1].lat,
                        lon: w[1].lon,
                        cum_dist_m: cum_dist,
                        bearing_deg: b,
                        curvature_rad_per_m: 0.0,
                        speed_kmh: base_speed_kmh,
                        pathway_index: first_idx,
                        pathway_name: "Return to Start".to_string(),
                        jump_from_prev: false,
                    });
                }
            }
        }

        // Compute discrete local curvature (rad/m) at each sample
        if samples.len() >= 3 {
            for i in 1..samples.len() - 1 {
                if samples[i].jump_from_prev || samples[i + 1].jump_from_prev {
                    continue;
                }
                let len_in = (samples[i].cum_dist_m - samples[i - 1].cum_dist_m).abs();
                let len_out = (samples[i + 1].cum_dist_m - samples[i].cum_dist_m).abs();
                if len_in < 0.05 || len_out < 0.05 {
                    continue;
                }
                let b_in = samples[i - 1].bearing_deg;
                let b_out = samples[i].bearing_deg;
                let delta_deg = smallest_angle_diff_deg(b_in, b_out).abs();
                let avg_len = 0.5 * (len_in + len_out);
                samples[i].curvature_rad_per_m = delta_deg.to_radians() / avg_len.max(0.5);
            }
        }

        let total_length_m = cum_dist;
        let compiled_preview = CompiledRoutePreview {
            segments: preview_segments,
            total_length_m,
            estimated_duration_secs: est_duration_secs,
            boundary_area_m2,
            boundary_perimeter_m,
            auto_sweep_lanes,
        };

        Self {
            polygon,
            enforce_boundary,
            loop_mode,
            human_drive,
            base_speed_kmh,
            samples,
            total_length_m,
            compiled_preview,
        }
    }

    pub fn compiled_preview(&self) -> CompiledRoutePreview {
        self.compiled_preview.clone()
    }

    pub fn total_length_m(&self) -> f64 {
        self.total_length_m
    }

    pub fn generate_auto_sweep_lanes(config: &LocationConfig) -> Vec<Vec<GeoPoint>> {
        let pts = &config.boundary_points;
        if pts.len() < 3 {
            return Vec::new();
        }

        let (ref_lat, ref_lon) = config.centroid();
        let enu: Vec<(f64, f64)> = pts
            .iter()
            .map(|p| to_local_m(p.lat, p.lon, ref_lat, ref_lon))
            .collect();
        let n = enu.len();

        // Sweep direction unit vector (dx, dy) in ENU
        let (dx, dy) = if let Some(deg) = config.sweep_angle_deg {
            let rad = deg.to_radians();
            (rad.sin(), rad.cos())
        } else {
            let mut best_len = -1.0_f64;
            let mut best_vec = (1.0_f64, 0.0_f64);
            for i in 0..n {
                let a = enu[i];
                let b = enu[(i + 1) % n];
                let vx = b.0 - a.0;
                let vy = b.1 - a.1;
                let len = (vx * vx + vy * vy).sqrt();
                if len > best_len && len > 1e-4 {
                    best_len = len;
                    best_vec = (vx / len, vy / len);
                }
            }
            best_vec
        };

        // Rotate vertices into (u along sweep, v perpendicular)
        let rotated: Vec<(f64, f64)> = enu
            .iter()
            .map(|&(x, y)| (x * dx + y * dy, -x * dy + y * dx))
            .collect();

        let mut v_min = f64::INFINITY;
        let mut v_max = f64::NEG_INFINITY;
        for &(_, v) in &rotated {
            if v < v_min {
                v_min = v;
            }
            if v > v_max {
                v_max = v;
            }
        }

        if (v_max - v_min) < 1e-4 {
            return Vec::new();
        }

        let passes = config.sweep_passes.clamp(1, 30) as usize;
        let mut v_lines: Vec<f64> = (0..passes)
            .map(|p| v_min + ((p as f64 + 0.5) / passes as f64) * (v_max - v_min))
            .collect();

        if config.reverse_sweep {
            v_lines.reverse();
        }

        let mut lanes: Vec<Vec<GeoPoint>> = Vec::new();

        for (lane_idx, &v_line) in v_lines.iter().enumerate() {
            let mut intersections: Vec<f64> = Vec::new();
            for e in 0..n {
                let p1 = rotated[e];
                let p2 = rotated[(e + 1) % n];
                if (p1.1 <= v_line && p2.1 > v_line) || (p2.1 <= v_line && p1.1 > v_line) {
                    let t = (v_line - p1.1) / (p2.1 - p1.1);
                    intersections.push(p1.0 + t * (p2.0 - p1.0));
                }
            }

            intersections.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

            let flip = if config.serpentine_sweep {
                (lane_idx % 2 == 1) ^ config.reverse_sweep
            } else {
                config.reverse_sweep
            };

            let mut pair_iter: Vec<(f64, f64)> = intersections
                .chunks_exact(2)
                .filter_map(|c| {
                    if (c[1] - c[0]).abs() >= 0.5 {
                        Some((c[0], c[1]))
                    } else {
                        None
                    }
                })
                .collect();

            if flip {
                pair_iter.reverse();
            }

            for (u_a, u_b) in pair_iter {
                let (u_start, u_end) = if flip { (u_b, u_a) } else { (u_a, u_b) };
                let (sx, sy) = (u_start * dx - v_line * dy, u_start * dy + v_line * dx);
                let (ex, ey) = (u_end * dx - v_line * dy, u_end * dy + v_line * dx);
                let (s_lat, s_lon) = from_local_m(sx, sy, ref_lat, ref_lon);
                let (e_lat, e_lon) = from_local_m(ex, ey, ref_lat, ref_lon);
                lanes.push(vec![
                    GeoPoint {
                        lat: s_lat,
                        lon: s_lon,
                    },
                    GeoPoint {
                        lat: e_lat,
                        lon: e_lon,
                    },
                ]);
            }
        }

        lanes
    }

    pub fn is_inside_boundary(&self, lat: f64, lon: f64) -> bool {
        if self.polygon.len() < 3 {
            return true;
        }
        is_point_in_polygon(lat, lon, &self.polygon)
    }

    pub fn clamp_to_boundary(
        &self,
        cand_lat: f64,
        cand_lon: f64,
        safe_lat: f64,
        safe_lon: f64,
    ) -> (f64, f64) {
        if !self.enforce_boundary || self.polygon.len() < 3 {
            return (cand_lat, cand_lon);
        }
        if is_point_in_polygon(cand_lat, cand_lon, &self.polygon) {
            return (cand_lat, cand_lon);
        }

        let (anchor_lat, anchor_lon) = if is_point_in_polygon(safe_lat, safe_lon, &self.polygon) {
            (safe_lat, safe_lon)
        } else {
            find_guaranteed_interior_point(&self.polygon)
        };

        clamp_inside_boundary(cand_lat, cand_lon, anchor_lat, anchor_lon, &self.polygon)
    }

    pub fn random_point_in_boundary<R: Rng + ?Sized>(&self, rng: &mut R) -> (f64, f64) {
        random_point_in_polygon(&self.polygon, rng)
    }

    pub fn sample_at_distance(
        &self,
        distance_m: f64,
        sim_time_secs: f64,
        forward: bool,
    ) -> VehiclePosition {
        if self.samples.is_empty() {
            let (lat, lon) = if let Some(&first) = self.polygon.first() {
                first
            } else {
                (9.9450, 76.2750)
            };
            return VehiclePosition {
                lat,
                lon,
                heading_deg: 0.0,
                speed_kmh: self.base_speed_kmh,
                active_path_index: None,
                active_path_name: None,
                route_distance_m: 0.0,
                total_route_length_m: 0.0,
                route_progress_pct: 0.0,
            };
        }

        if self.samples.len() == 1 || self.total_length_m <= 1e-3 {
            let s = &self.samples[0];
            return VehiclePosition {
                lat: s.lat,
                lon: s.lon,
                heading_deg: if forward {
                    s.bearing_deg
                } else {
                    (s.bearing_deg + 180.0) % 360.0
                },
                speed_kmh: s.speed_kmh,
                active_path_index: Some(s.pathway_index),
                active_path_name: Some(s.pathway_name.clone()),
                route_distance_m: 0.0,
                total_route_length_m: self.total_length_m,
                route_progress_pct: 0.0,
            };
        }

        let d = distance_m.clamp(0.0, self.total_length_m);
        let seg_idx = self.find_segment_index(d, forward);
        let s0 = &self.samples[seg_idx];
        let s1 = &self.samples[seg_idx + 1];
        let seg_len = (s1.cum_dist_m - s0.cum_dist_m).max(1e-6);
        let t = ((d - s0.cum_dist_m) / seg_len).clamp(0.0, 1.0);

        let mut lat = s0.lat + (s1.lat - s0.lat) * t;
        let mut lon = s0.lon + (s1.lon - s0.lon) * t;
        let base_bearing = if forward {
            s0.bearing_deg
        } else {
            (s0.bearing_deg + 180.0) % 360.0
        };
        let mut heading = base_bearing;
        let mut effective_speed = s0.speed_kmh;

        if self.human_drive.enabled {
            let smoothness = self.human_drive.corner_smoothness.clamp(0.0, 1.0);

            // 1. Curvature-aware corner braking over next 12m in travel direction
            let max_curv = self.max_curvature_ahead(seg_idx, d, 12.0, forward);
            let corner_factor = (1.0 / (1.0 + max_curv * 18.0 * smoothness)).clamp(0.35, 1.0);

            // 2. Smooth multi-frequency throttle micro-variation
            let var_amp = (self.human_drive.speed_variance_pct / 100.0).clamp(0.0, 0.25);
            let throttle = 1.0
                + var_amp
                    * (0.65 * (sim_time_secs * 0.45).sin()
                        + 0.35 * (sim_time_secs * 1.13 + 0.7).sin());

            effective_speed = (s0.speed_kmh * corner_factor * throttle).max(2.0);

            // 3. Smooth lookahead steering heading (stopping at any jump discontinuity)
            let lookahead_m = 2.5 + 5.0 * smoothness;
            if let Some((look_lat, look_lon)) =
                self.lookahead_point(seg_idx, d, lookahead_m, forward)
            {
                let dist_to_look = haversine_distance(lat, lon, look_lat, look_lon);
                if dist_to_look >= 0.2 {
                    heading = calculate_bearing(lat, lon, look_lat, look_lon);
                }
            }

            // 4. Subtle human lateral steering weave tapered near path endpoints
            if self.human_drive.lateral_weave_m > 0.01 && self.total_length_m > 6.0 {
                let env = (d / 3.0)
                    .min((self.total_length_m - d) / 3.0)
                    .clamp(0.0, 1.0);
                let weave_m = env
                    * self.human_drive.lateral_weave_m
                    * (0.6 * (d * 0.065).sin() + 0.4 * (d * 0.17 + 1.9).sin());
                let (w_lat, w_lon) = Self::offset_coordinate(lat, lon, heading, weave_m, 0.0);
                lat = w_lat;
                lon = w_lon;
            }
        }

        let progress_pct = if self.total_length_m > 0.0 {
            (d / self.total_length_m * 100.0).clamp(0.0, 100.0)
        } else {
            0.0
        };

        VehiclePosition {
            lat,
            lon,
            heading_deg: heading,
            speed_kmh: effective_speed,
            active_path_index: Some(s0.pathway_index),
            active_path_name: Some(s0.pathway_name.clone()),
            route_distance_m: d,
            total_route_length_m: self.total_length_m,
            route_progress_pct: progress_pct,
        }
    }

    #[allow(dead_code)]
    pub fn get_position_at_time(&self, elapsed_secs: f64) -> VehiclePosition {
        if self.total_length_m <= 1e-3 {
            return self.sample_at_distance(0.0, elapsed_secs, true);
        }
        let speed_m_s = (self.base_speed_kmh * 1000.0) / 3600.0;
        let raw = elapsed_secs.max(0.0) * speed_m_s;
        match self.loop_mode {
            LoopMode::Loop => {
                let d = raw % self.total_length_m;
                self.sample_at_distance(d, elapsed_secs, true)
            }
            LoopMode::PingPong => {
                let period = 2.0 * self.total_length_m;
                let phase = raw % period;
                if phase <= self.total_length_m {
                    self.sample_at_distance(phase, elapsed_secs, true)
                } else {
                    self.sample_at_distance(period - phase, elapsed_secs, false)
                }
            }
            LoopMode::Once => {
                let d = raw.min(self.total_length_m);
                self.sample_at_distance(d, elapsed_secs, true)
            }
        }
    }

    fn find_segment_index(&self, d: f64, forward: bool) -> usize {
        let last_seg = self.samples.len().saturating_sub(2);
        // Binary search first index where cum_dist_m >= d
        let mut lo = 0usize;
        let mut hi = self.samples.len() - 1;
        while lo < hi {
            let mid = (lo + hi) / 2;
            if self.samples[mid].cum_dist_m < d {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }

        let mut idx = if lo == 0 { 0 } else { lo - 1 }.min(last_seg);

        // Avoid returning a zero-length jump segment when a real non-jump segment sits at the same distance
        if self.samples[idx + 1].jump_from_prev {
            if forward {
                for cand in idx..=last_seg {
                    if !self.samples[cand + 1].jump_from_prev
                        && self.samples[cand].cum_dist_m <= d + 1e-9
                        && self.samples[cand + 1].cum_dist_m >= d - 1e-9
                    {
                        idx = cand;
                        break;
                    }
                }
            } else {
                for cand in (0..=idx).rev() {
                    if !self.samples[cand + 1].jump_from_prev
                        && self.samples[cand].cum_dist_m <= d + 1e-9
                        && self.samples[cand + 1].cum_dist_m >= d - 1e-9
                    {
                        idx = cand;
                        break;
                    }
                }
            }
        }

        idx
    }

    fn max_curvature_ahead(&self, seg_idx: usize, d: f64, window_m: f64, forward: bool) -> f64 {
        let mut max_c = self.samples[seg_idx]
            .curvature_rad_per_m
            .max(self.samples[seg_idx + 1].curvature_rad_per_m);

        if forward {
            let limit = d + window_m;
            for i in (seg_idx + 1)..self.samples.len() {
                if self.samples[i].jump_from_prev || self.samples[i].cum_dist_m > limit {
                    break;
                }
                if self.samples[i].curvature_rad_per_m > max_c {
                    max_c = self.samples[i].curvature_rad_per_m;
                }
            }
        } else {
            let limit = (d - window_m).max(0.0);
            for i in (0..=seg_idx).rev() {
                if self.samples[i].cum_dist_m < limit {
                    break;
                }
                if self.samples[i].curvature_rad_per_m > max_c {
                    max_c = self.samples[i].curvature_rad_per_m;
                }
                if self.samples[i].jump_from_prev {
                    break;
                }
            }
        }

        max_c
    }

    fn lookahead_point(
        &self,
        seg_idx: usize,
        d: f64,
        lookahead_m: f64,
        forward: bool,
    ) -> Option<(f64, f64)> {
        if self.samples.len() < 2 {
            return None;
        }
        if forward {
            let target_d = (d + lookahead_m).min(self.total_length_m);
            let mut cur = seg_idx;
            while cur + 1 < self.samples.len() {
                if cur > seg_idx && self.samples[cur + 1].jump_from_prev {
                    return Some((self.samples[cur].lat, self.samples[cur].lon));
                }
                let s0 = &self.samples[cur];
                let s1 = &self.samples[cur + 1];
                if s1.jump_from_prev {
                    return Some((s0.lat, s0.lon));
                }
                if s1.cum_dist_m >= target_d || cur + 1 == self.samples.len() - 1 {
                    let span = (s1.cum_dist_m - s0.cum_dist_m).max(1e-6);
                    let t = ((target_d - s0.cum_dist_m) / span).clamp(0.0, 1.0);
                    return Some((
                        s0.lat + (s1.lat - s0.lat) * t,
                        s0.lon + (s1.lon - s0.lon) * t,
                    ));
                }
                cur += 1;
            }
            let last = self.samples.last()?;
            Some((last.lat, last.lon))
        } else {
            let target_d = (d - lookahead_m).max(0.0);
            let mut cur = seg_idx;
            loop {
                let s0 = &self.samples[cur];
                let s1 = &self.samples[cur + 1];
                if s1.jump_from_prev {
                    if cur == 0 {
                        return Some((s0.lat, s0.lon));
                    }
                    cur -= 1;
                    continue;
                }
                if s0.cum_dist_m <= target_d || cur == 0 || s0.jump_from_prev {
                    let clamped_d = target_d.max(s0.cum_dist_m);
                    let span = (s1.cum_dist_m - s0.cum_dist_m).max(1e-6);
                    let t = ((clamped_d - s0.cum_dist_m) / span).clamp(0.0, 1.0);
                    return Some((
                        s0.lat + (s1.lat - s0.lat) * t,
                        s0.lon + (s1.lon - s0.lon) * t,
                    ));
                }
                cur -= 1;
            }
        }
    }

    pub fn offset_coordinate(
        lat: f64,
        lon: f64,
        heading_deg: f64,
        lateral_offset_m: f64,
        forward_offset_m: f64,
    ) -> (f64, f64) {
        let heading_rad = heading_deg.to_radians();

        // Forward vector: sin(heading), cos(heading)
        // Perpendicular (right) vector: cos(heading), -sin(heading)
        let delta_north =
            forward_offset_m * heading_rad.cos() - lateral_offset_m * heading_rad.sin();
        let delta_east =
            forward_offset_m * heading_rad.sin() + lateral_offset_m * heading_rad.cos();

        // 1 deg latitude ≈ 111,139 meters
        let lat_offset = delta_north / 111_139.0;
        let lon_offset = delta_east / (111_139.0 * lat.to_radians().cos().abs().max(0.01));

        (lat + lat_offset, lon + lon_offset)
    }
}

fn to_local_m(lat: f64, lon: f64, ref_lat: f64, ref_lon: f64) -> (f64, f64) {
    let lat_scale = 111_139.0;
    let lon_scale = 111_139.0 * ref_lat.to_radians().cos().abs().max(0.01);
    ((lon - ref_lon) * lon_scale, (lat - ref_lat) * lat_scale)
}

fn from_local_m(east_m: f64, north_m: f64, ref_lat: f64, ref_lon: f64) -> (f64, f64) {
    let lat_scale = 111_139.0;
    let lon_scale = 111_139.0 * ref_lat.to_radians().cos().abs().max(0.01);
    (ref_lat + north_m / lat_scale, ref_lon + east_m / lon_scale)
}

fn dedupe_consecutive_points(pts: &[GeoPoint]) -> Vec<GeoPoint> {
    let mut out: Vec<GeoPoint> = Vec::with_capacity(pts.len());
    for &p in pts {
        if let Some(&last) = out.last() {
            if haversine_distance(last.lat, last.lon, p.lat, p.lon) < 0.05 {
                continue;
            }
        }
        out.push(p);
    }
    out
}

fn fillet_polyline_corners(pts: &[GeoPoint], smoothness: f64) -> Vec<GeoPoint> {
    let clean = dedupe_consecutive_points(pts);
    if clean.len() < 3 || smoothness <= 0.02 {
        return clean;
    }

    let ref_lat = clean.iter().map(|p| p.lat).sum::<f64>() / clean.len() as f64;
    let ref_lon = clean.iter().map(|p| p.lon).sum::<f64>() / clean.len() as f64;
    let enu: Vec<(f64, f64)> = clean
        .iter()
        .map(|p| to_local_m(p.lat, p.lon, ref_lat, ref_lon))
        .collect();

    let mut out_enu: Vec<(f64, f64)> = Vec::with_capacity(enu.len() * 6);
    out_enu.push(enu[0]);

    let target_radius = 2.0 + 6.0 * smoothness.clamp(0.0, 1.0);
    let steps = 6usize;

    for i in 1..enu.len() - 1 {
        let prev = enu[i - 1];
        let curr = enu[i];
        let next = enu[i + 1];

        let dx_in = curr.0 - prev.0;
        let dy_in = curr.1 - prev.1;
        let d_prev = (dx_in * dx_in + dy_in * dy_in).sqrt();

        let dx_out = next.0 - curr.0;
        let dy_out = next.1 - curr.1;
        let d_next = (dx_out * dx_out + dy_out * dy_out).sqrt();

        if d_prev < 0.2 || d_next < 0.2 {
            out_enu.push(curr);
            continue;
        }

        let u_in = (dx_in / d_prev, dy_in / d_prev);
        let u_out = (dx_out / d_next, dy_out / d_next);
        let cos_theta = (u_in.0 * u_out.0 + u_in.1 * u_out.1).clamp(-1.0, 1.0);
        let angle_deg = cos_theta.acos().to_degrees();

        if angle_deg > 10.0 {
            let radius = target_radius.min(0.35 * d_prev.min(d_next));
            if radius < 0.15 {
                out_enu.push(curr);
                continue;
            }
            let a = (curr.0 - u_in.0 * radius, curr.1 - u_in.1 * radius);
            let b = (curr.0 + u_out.0 * radius, curr.1 + u_out.1 * radius);
            for s in 0..=steps {
                let t = (s as f64) / (steps as f64);
                let omt = 1.0 - t;
                let x = omt * omt * a.0 + 2.0 * omt * t * curr.0 + t * t * b.0;
                let y = omt * omt * a.1 + 2.0 * omt * t * curr.1 + t * t * b.1;
                out_enu.push((x, y));
            }
        } else {
            out_enu.push(curr);
        }
    }

    out_enu.push(*enu.last().unwrap());

    out_enu
        .into_iter()
        .map(|(x, y)| {
            let (lat, lon) = from_local_m(x, y, ref_lat, ref_lon);
            GeoPoint { lat, lon }
        })
        .collect()
}

fn smooth_freehand_points(pts: &[GeoPoint]) -> Vec<GeoPoint> {
    let clean = dedupe_consecutive_points(pts);
    if clean.len() < 3 {
        return clean;
    }

    let ref_lat = clean.iter().map(|p| p.lat).sum::<f64>() / clean.len() as f64;
    let ref_lon = clean.iter().map(|p| p.lon).sum::<f64>() / clean.len() as f64;
    let enu: Vec<(f64, f64)> = clean
        .iter()
        .map(|p| to_local_m(p.lat, p.lon, ref_lat, ref_lon))
        .collect();

    let mut out: Vec<GeoPoint> = Vec::with_capacity(enu.len());
    out.push(clean[0]);
    for i in 1..enu.len() - 1 {
        let x = 0.2 * enu[i - 1].0 + 0.6 * enu[i].0 + 0.2 * enu[i + 1].0;
        let y = 0.2 * enu[i - 1].1 + 0.6 * enu[i].1 + 0.2 * enu[i + 1].1;
        let (lat, lon) = from_local_m(x, y, ref_lat, ref_lon);
        out.push(GeoPoint { lat, lon });
    }
    out.push(*clean.last().unwrap());
    out
}

fn build_transit_points(a: GeoPoint, b: GeoPoint) -> Vec<GeoPoint> {
    vec![a, b]
}

fn polyline_length_m(pts: &[GeoPoint]) -> f64 {
    pts.windows(2)
        .map(|w| haversine_distance(w[0].lat, w[0].lon, w[1].lat, w[1].lon))
        .sum()
}

fn smallest_angle_diff_deg(a: f64, b: f64) -> f64 {
    let mut diff = (b - a + 540.0) % 360.0 - 180.0;
    if diff < -180.0 {
        diff += 360.0;
    }
    diff
}

pub fn polygon_area_and_perimeter_m(polygon: &[(f64, f64)]) -> (f64, f64) {
    if polygon.len() < 2 {
        return (0.0, 0.0);
    }
    if polygon.len() == 2 {
        let d = haversine_distance(polygon[0].0, polygon[0].1, polygon[1].0, polygon[1].1);
        return (0.0, d);
    }

    let n = polygon.len();
    let ref_lat = polygon.iter().map(|p| p.0).sum::<f64>() / n as f64;
    let ref_lon = polygon.iter().map(|p| p.1).sum::<f64>() / n as f64;
    let enu: Vec<(f64, f64)> = polygon
        .iter()
        .map(|&(lat, lon)| to_local_m(lat, lon, ref_lat, ref_lon))
        .collect();

    let mut shoelace = 0.0_f64;
    let mut perim = 0.0_f64;
    for i in 0..n {
        let next = (i + 1) % n;
        shoelace += enu[i].0 * enu[next].1 - enu[next].0 * enu[i].1;
        perim += haversine_distance(polygon[i].0, polygon[i].1, polygon[next].0, polygon[next].1);
    }
    (0.5 * shoelace.abs(), perim)
}

fn point_in_triangle_2d(p: (f64, f64), a: (f64, f64), b: (f64, f64), c: (f64, f64)) -> bool {
    let cross = |o: (f64, f64), u: (f64, f64), v: (f64, f64)| -> f64 {
        (u.0 - o.0) * (v.1 - o.1) - (u.1 - o.1) * (v.0 - o.0)
    };
    let c1 = cross(a, b, p);
    let c2 = cross(b, c, p);
    let c3 = cross(c, a, p);
    c1 >= -1e-9 && c2 >= -1e-9 && c3 >= -1e-9
}

fn triangulate_polygon_ear_clip(
    polygon: &[(f64, f64)],
) -> Vec<((f64, f64), (f64, f64), (f64, f64))> {
    if polygon.len() < 3 {
        return Vec::new();
    }

    // Deduplicate adjacent equal vertices
    let mut clean: Vec<(f64, f64)> = Vec::with_capacity(polygon.len());
    for &p in polygon {
        if let Some(&last) = clean.last() {
            if (last.0 - p.0).abs() < 1e-11 && (last.1 - p.1).abs() < 1e-11 {
                continue;
            }
        }
        clean.push(p);
    }
    if clean.len() >= 2 {
        let first = clean[0];
        let last = *clean.last().unwrap();
        if (first.0 - last.0).abs() < 1e-11 && (first.1 - last.1).abs() < 1e-11 {
            clean.pop();
        }
    }
    if clean.len() < 3 {
        return Vec::new();
    }

    let ref_lat = clean.iter().map(|p| p.0).sum::<f64>() / clean.len() as f64;
    let ref_lon = clean.iter().map(|p| p.1).sum::<f64>() / clean.len() as f64;
    let mut enu: Vec<(f64, f64)> = clean
        .iter()
        .map(|&(lat, lon)| to_local_m(lat, lon, ref_lat, ref_lon))
        .collect();

    // Ensure CCW winding
    let mut signed_area = 0.0_f64;
    for i in 0..enu.len() {
        let next = (i + 1) % enu.len();
        signed_area += enu[i].0 * enu[next].1 - enu[next].0 * enu[i].1;
    }
    if signed_area < 0.0 {
        clean.reverse();
        enu.reverse();
    }

    let mut indices: Vec<usize> = (0..clean.len()).collect();
    let mut triangles = Vec::with_capacity(clean.len().saturating_sub(2));
    let mut guard = 0usize;
    let max_iters = clean.len() * clean.len() + 8;

    while indices.len() > 3 && guard < max_iters {
        guard += 1;
        let m = indices.len();
        let mut clipped = false;

        for k in 0..m {
            let i_prev = indices[(k + m - 1) % m];
            let i_curr = indices[k];
            let i_next = indices[(k + 1) % m];

            let a = enu[i_prev];
            let b = enu[i_curr];
            let c = enu[i_next];

            let cross = (b.0 - a.0) * (c.1 - a.1) - (b.1 - a.1) * (c.0 - a.0);
            if cross <= 1e-7 {
                continue;
            }

            let mut contains_other = false;
            for &other_idx in &indices {
                if other_idx == i_prev || other_idx == i_curr || other_idx == i_next {
                    continue;
                }
                if point_in_triangle_2d(enu[other_idx], a, b, c) {
                    contains_other = true;
                    break;
                }
            }
            if contains_other {
                continue;
            }

            triangles.push((clean[i_prev], clean[i_curr], clean[i_next]));
            indices.remove(k);
            clipped = true;
            break;
        }

        if !clipped {
            return Vec::new();
        }
    }

    if indices.len() == 3 {
        triangles.push((clean[indices[0]], clean[indices[1]], clean[indices[2]]));
    }

    triangles
}

fn find_guaranteed_interior_point(polygon: &[(f64, f64)]) -> (f64, f64) {
    if polygon.is_empty() {
        return (9.9450, 76.2750);
    }
    let tris = triangulate_polygon_ear_clip(polygon);
    for (a, b, c) in tris {
        let cand = ((a.0 + b.0 + c.0) / 3.0, (a.1 + b.1 + c.1) / 3.0);
        if is_point_in_polygon(cand.0, cand.1, polygon) {
            return cand;
        }
    }

    let n = polygon.len() as f64;
    let centroid = (
        polygon.iter().map(|p| p.0).sum::<f64>() / n,
        polygon.iter().map(|p| p.1).sum::<f64>() / n,
    );
    if is_point_in_polygon(centroid.0, centroid.1, polygon) {
        return centroid;
    }

    // Grid search inside bounding box as deterministic fallback
    let min_lat = polygon.iter().map(|p| p.0).fold(f64::INFINITY, f64::min);
    let max_lat = polygon
        .iter()
        .map(|p| p.0)
        .fold(f64::NEG_INFINITY, f64::max);
    let min_lon = polygon.iter().map(|p| p.1).fold(f64::INFINITY, f64::min);
    let max_lon = polygon
        .iter()
        .map(|p| p.1)
        .fold(f64::NEG_INFINITY, f64::max);
    for r in 1..10 {
        for c in 1..10 {
            let lat = min_lat + (max_lat - min_lat) * (r as f64 / 10.0);
            let lon = min_lon + (max_lon - min_lon) * (c as f64 / 10.0);
            if is_point_in_polygon(lat, lon, polygon) {
                return (lat, lon);
            }
        }
    }

    polygon[0]
}

pub fn random_point_in_polygon<R: Rng + ?Sized>(polygon: &[(f64, f64)], rng: &mut R) -> (f64, f64) {
    if polygon.is_empty() {
        return (9.9450, 76.2750);
    }
    if polygon.len() < 3 {
        return polygon[0];
    }

    let tris = triangulate_polygon_ear_clip(polygon);
    if !tris.is_empty() {
        let areas: Vec<f64> = tris
            .iter()
            .map(|&(a, b, c)| (0.5 * ((b.1 - a.1) * (c.0 - a.0) - (c.1 - a.1) * (b.0 - a.0))).abs())
            .collect();
        let total_area: f64 = areas.iter().sum();

        if total_area > 1e-14 {
            let pick = rng.gen::<f64>() * total_area;
            let mut accum = 0.0;
            let mut chosen = tris[tris.len() - 1];
            for (tri, &area) in tris.iter().zip(areas.iter()) {
                accum += area;
                if pick <= accum {
                    chosen = *tri;
                    break;
                }
            }

            let (a, b, c) = chosen;
            let mut r1: f64 = rng.gen();
            let mut r2: f64 = rng.gen();
            if r1 + r2 > 1.0 {
                r1 = 1.0 - r1;
                r2 = 1.0 - r2;
            }
            let lat = a.0 + r1 * (b.0 - a.0) + r2 * (c.0 - a.0);
            let lon = a.1 + r1 * (b.1 - a.1) + r2 * (c.1 - a.1);
            if is_point_in_polygon(lat, lon, polygon) {
                return (lat, lon);
            }
        }
    }

    // Rejection sampling fallback (handles self-intersecting polygons)
    let min_lat = polygon.iter().map(|p| p.0).fold(f64::INFINITY, f64::min);
    let max_lat = polygon
        .iter()
        .map(|p| p.0)
        .fold(f64::NEG_INFINITY, f64::max);
    let min_lon = polygon.iter().map(|p| p.1).fold(f64::INFINITY, f64::min);
    let max_lon = polygon
        .iter()
        .map(|p| p.1)
        .fold(f64::NEG_INFINITY, f64::max);

    for _ in 0..200 {
        let lat = rng.gen_range(min_lat..=max_lat);
        let lon = rng.gen_range(min_lon..=max_lon);
        if is_point_in_polygon(lat, lon, polygon) {
            return (lat, lon);
        }
    }

    find_guaranteed_interior_point(polygon)
}

pub fn haversine_distance(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    const R: f64 = 6_371_000.0; // Earth radius in meters
    let phi1 = lat1.to_radians();
    let phi2 = lat2.to_radians();
    let delta_phi = (lat2 - lat1).to_radians();
    let delta_lambda = (lon2 - lon1).to_radians();

    let a = (delta_phi / 2.0).sin().powi(2)
        + phi1.cos() * phi2.cos() * (delta_lambda / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());

    R * c
}

pub fn calculate_bearing(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let phi1 = lat1.to_radians();
    let phi2 = lat2.to_radians();
    let delta_lambda = (lon2 - lon1).to_radians();

    let y = delta_lambda.sin() * phi2.cos();
    let x = phi1.cos() * phi2.sin() - phi1.sin() * phi2.cos() * delta_lambda.cos();
    let bearing_rad = y.atan2(x);
    let bearing_deg = bearing_rad.to_degrees();

    (bearing_deg + 360.0) % 360.0
}

pub fn is_point_in_polygon(lat: f64, lon: f64, polygon: &[(f64, f64)]) -> bool {
    let mut inside = false;
    let n = polygon.len();
    if n < 3 {
        return false;
    }
    let mut j = n - 1;
    for i in 0..n {
        let (lat_i, lon_i) = polygon[i];
        let (lat_j, lon_j) = polygon[j];

        let intersect = ((lat_i > lat) != (lat_j > lat))
            && (lon < (lon_j - lon_i) * (lat - lat_i) / (lat_j - lat_i) + lon_i);
        if intersect {
            inside = !inside;
        }
        j = i;
    }
    inside
}

pub fn clamp_inside_boundary(
    cand_lat: f64,
    cand_lon: f64,
    safe_lat: f64,
    safe_lon: f64,
    polygon: &[(f64, f64)],
) -> (f64, f64) {
    if is_point_in_polygon(cand_lat, cand_lon, polygon) {
        return (cand_lat, cand_lon);
    }
    let mut low = 0.0_f64;
    let mut high = 1.0_f64;
    for _ in 0..10 {
        let mid = (low + high) / 2.0;
        let test_lat = safe_lat + (cand_lat - safe_lat) * mid;
        let test_lon = safe_lon + (cand_lon - safe_lon) * mid;
        if is_point_in_polygon(test_lat, test_lon, polygon) {
            low = mid;
        } else {
            high = mid;
        }
    }
    let t = (low * 0.95).max(0.0);
    (
        safe_lat + (cand_lat - safe_lat) * t,
        safe_lon + (cand_lon - safe_lon) * t,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Pathway;

    fn default_box() -> Vec<GeoPoint> {
        vec![
            GeoPoint {
                lat: 9.9400,
                lon: 76.2700,
            },
            GeoPoint {
                lat: 9.9400,
                lon: 76.2800,
            },
            GeoPoint {
                lat: 9.9500,
                lon: 76.2800,
            },
            GeoPoint {
                lat: 9.9500,
                lon: 76.2700,
            },
        ]
    }

    fn l_shape_polygon() -> Vec<(f64, f64)> {
        vec![
            (9.9400, 76.2700),
            (9.9400, 76.2800),
            (9.9440, 76.2800),
            (9.9440, 76.2740),
            (9.9500, 76.2740),
            (9.9500, 76.2700),
        ]
    }

    #[test]
    fn test_bearing_cardinal_directions() {
        let b_east = calculate_bearing(10.0, 70.0, 10.0, 71.0);
        assert!(
            (b_east - 90.0).abs() < 1.0,
            "Bearing to East should be ~90 deg, got {}",
            b_east
        );

        let b_north = calculate_bearing(10.0, 70.0, 11.0, 70.0);
        assert!(
            (b_north - 0.0).abs() < 1.0,
            "Bearing to North should be ~0 deg, got {}",
            b_north
        );

        let b_south = calculate_bearing(11.0, 70.0, 10.0, 70.0);
        assert!(
            (b_south - 180.0).abs() < 1.0,
            "Bearing to South should be ~180 deg, got {}",
            b_south
        );
    }

    #[test]
    fn test_haversine_distance() {
        let dist = haversine_distance(10.0, 70.0, 11.0, 70.0);
        assert!(
            dist > 110_000.0 && dist < 112_000.0,
            "1 deg lat should be ~111km, got {}",
            dist
        );
    }

    #[test]
    fn test_polygon_point_containment() {
        let polygon = [
            (9.9400, 76.2700),
            (9.9400, 76.2800),
            (9.9500, 76.2800),
            (9.9500, 76.2700),
        ];

        assert!(is_point_in_polygon(9.9450, 76.2750, &polygon));
        assert!(!is_point_in_polygon(9.9300, 76.2750, &polygon));
        assert!(!is_point_in_polygon(9.9600, 76.2750, &polygon));
        assert!(!is_point_in_polygon(9.9450, 76.2600, &polygon));
        assert!(!is_point_in_polygon(9.9450, 76.2900, &polygon));
    }

    #[test]
    fn test_l_shape_concave_polygon_containment_clamping_and_sampling() {
        let l_poly = l_shape_polygon();
        // Inside lower wing & upper wing
        assert!(is_point_in_polygon(9.9420, 76.2780, &l_poly));
        assert!(is_point_in_polygon(9.9480, 76.2720, &l_poly));
        // Inside concave cutout (must be OUTSIDE polygon!)
        assert!(!is_point_in_polygon(9.9480, 76.2780, &l_poly));

        let (area_m2, perim_m) = polygon_area_and_perimeter_m(&l_poly);
        assert!(
            area_m2 > 500_000.0,
            "L-shape area should be realistic, got {}",
            area_m2
        );
        assert!(
            perim_m > 4_000.0,
            "L-shape perimeter should be > 4km, got {}",
            perim_m
        );

        let (clamped_lat, clamped_lon) =
            clamp_inside_boundary(9.9480, 76.2780, 9.9420, 76.2720, &l_poly);
        assert!(is_point_in_polygon(clamped_lat, clamped_lon, &l_poly));

        let mut rng = rand::thread_rng();
        for _ in 0..100 {
            let (lat, lon) = random_point_in_polygon(&l_poly, &mut rng);
            assert!(
                is_point_in_polygon(lat, lon, &l_poly),
                "Random point ({}, {}) was outside concave L-shape polygon",
                lat,
                lon
            );
        }
    }

    #[test]
    fn test_geo_engine_trajectory_interpolation() {
        let mut config = LocationConfig::default();
        config.boundary_points = default_box();
        config.vehicle_speed_kmh = 36.0;
        config.sweep_passes = 3;

        let engine = GeoEngine::new(&config);
        assert!(engine.total_length_m() > 100.0);

        let pos0 = engine.get_position_at_time(0.0);
        assert!(pos0.lat >= 9.9395 && pos0.lat <= 9.9505);
        assert!(pos0.lon >= 76.2695 && pos0.lon <= 76.2805);
        assert!(engine.is_inside_boundary(pos0.lat, pos0.lon));

        let pos10 = engine.get_position_at_time(10.0);
        assert!(pos10.lat >= 9.9390 && pos10.lat <= 9.9510);
    }

    #[test]
    fn test_auto_sweep_exact_angles_and_reverse_serpentine() {
        let mut config = LocationConfig::default();
        config.sweep_passes = 3;
        config.sweep_angle_deg = Some(90.0); // East-West lanes
        config.serpentine_sweep = false;
        config.reverse_sweep = false;

        let lanes_fwd = GeoEngine::generate_auto_sweep_lanes(&config);
        assert_eq!(lanes_fwd.len(), 3);
        for lane in &lanes_fwd {
            let b = calculate_bearing(lane[0].lat, lane[0].lon, lane[1].lat, lane[1].lon);
            assert!((b - 90.0).abs() < 2.0, "Expected ~90° East lane, got {}", b);
        }

        config.reverse_sweep = true;
        let lanes_rev = GeoEngine::generate_auto_sweep_lanes(&config);
        assert_eq!(lanes_rev.len(), 3);
        for lane in &lanes_rev {
            let b = calculate_bearing(lane[0].lat, lane[0].lon, lane[1].lat, lane[1].lon);
            assert!(
                (b - 270.0).abs() < 2.0,
                "Expected ~270° West lane, got {}",
                b
            );
        }

        // Test 0 deg Northbound & 45 deg NE
        config.sweep_angle_deg = Some(0.0);
        config.reverse_sweep = false;
        config.sweep_passes = 1;
        let lane_n = GeoEngine::generate_auto_sweep_lanes(&config);
        assert_eq!(lane_n.len(), 1);
        let b_n = calculate_bearing(
            lane_n[0][0].lat,
            lane_n[0][0].lon,
            lane_n[0][1].lat,
            lane_n[0][1].lon,
        );
        assert!(
            b_n < 2.0 || b_n > 358.0,
            "Expected ~0° North lane, got {}",
            b_n
        );

        // Single pass reverse flips direction
        config.reverse_sweep = true;
        let lane_s = GeoEngine::generate_auto_sweep_lanes(&config);
        let b_s = calculate_bearing(
            lane_s[0][0].lat,
            lane_s[0][0].lon,
            lane_s[0][1].lat,
            lane_s[0][1].lon,
        );
        assert!(
            (b_s - 180.0).abs() < 2.0,
            "Expected ~180° South lane on single pass reverse, got {}",
            b_s
        );

        config.sweep_angle_deg = Some(45.0);
        config.reverse_sweep = false;
        let lane_ne = GeoEngine::generate_auto_sweep_lanes(&config);
        assert!(!lane_ne.is_empty());
        let b_ne = calculate_bearing(
            lane_ne[0][0].lat,
            lane_ne[0][0].lon,
            lane_ne[0][1].lat,
            lane_ne[0][1].lon,
        );
        assert!(
            (b_ne - 45.0).abs() < 3.0,
            "Expected ~45° NE lane, got {}",
            b_ne
        );
    }

    #[test]
    fn test_custom_sequence_order_reverse_disabled_and_connect() {
        let mut config = LocationConfig::default();
        config.path_mode = PathMode::CustomSequence;
        config.connect_pathways = true;
        config.loop_mode = LoopMode::Once;
        config.human_drive.smooth_curves = false;
        config.human_drive.enabled = false;
        config.pathways = vec![
            Pathway {
                id: "a".into(),
                name: "Path A".into(),
                kind: PathKind::Waypoint,
                points: vec![
                    GeoPoint {
                        lat: 9.9410,
                        lon: 76.2710,
                    },
                    GeoPoint {
                        lat: 9.9410,
                        lon: 76.2730,
                    },
                ],
                enabled: true,
                reversed: false,
                speed_kmh: Some(20.0),
                color: None,
            },
            Pathway {
                id: "skip".into(),
                name: "Disabled Path".into(),
                kind: PathKind::Waypoint,
                points: vec![
                    GeoPoint {
                        lat: 9.9420,
                        lon: 76.2710,
                    },
                    GeoPoint {
                        lat: 9.9420,
                        lon: 76.2730,
                    },
                ],
                enabled: false,
                reversed: false,
                speed_kmh: None,
                color: None,
            },
            Pathway {
                id: "b".into(),
                name: "Path B".into(),
                kind: PathKind::Waypoint,
                points: vec![
                    GeoPoint {
                        lat: 9.9430,
                        lon: 76.2710,
                    },
                    GeoPoint {
                        lat: 9.9430,
                        lon: 76.2730,
                    },
                ],
                enabled: true,
                reversed: true,
                speed_kmh: Some(40.0),
                color: None,
            },
            Pathway {
                id: "c".into(),
                name: "Path C".into(),
                kind: PathKind::Freehand,
                points: vec![
                    GeoPoint {
                        lat: 9.9450,
                        lon: 76.2710,
                    },
                    GeoPoint {
                        lat: 9.9460,
                        lon: 76.2720,
                    },
                ],
                enabled: true,
                reversed: false,
                speed_kmh: None,
                color: None,
            },
        ];

        let engine_conn = GeoEngine::new(&config);
        let preview_conn = engine_conn.compiled_preview();
        let non_transit: Vec<_> = preview_conn
            .segments
            .iter()
            .filter(|s| !s.is_transit)
            .collect();
        assert_eq!(non_transit.len(), 3);
        assert_eq!(non_transit[0].pathway_name, "Path A");
        assert_eq!(non_transit[1].pathway_name, "Path B");
        assert_eq!(non_transit[2].pathway_name, "Path C");
        // Path B was reversed so its first point should be lon 76.2730
        assert!((non_transit[1].points[0].lon - 76.2730).abs() < 1e-6);
        assert!(preview_conn.segments.iter().any(|s| s.is_transit));

        // Check disconnected mode
        config.connect_pathways = false;
        let engine_disc = GeoEngine::new(&config);
        let preview_disc = engine_disc.compiled_preview();
        assert!(!preview_disc.segments.iter().any(|s| s.is_transit));
        assert!(engine_disc.total_length_m() < engine_conn.total_length_m());
    }

    #[test]
    fn test_loop_pingpong_once_modes() {
        let mut config = LocationConfig::default();
        config.path_mode = PathMode::CustomSequence;
        config.connect_pathways = false;
        config.human_drive.enabled = false;
        config.human_drive.smooth_curves = false;
        config.vehicle_speed_kmh = 36.0; // 10 m/s
        config.pathways = vec![Pathway {
            id: "line".into(),
            name: "Straight".into(),
            kind: PathKind::Waypoint,
            points: vec![
                GeoPoint {
                    lat: 9.9400,
                    lon: 76.2700,
                },
                GeoPoint {
                    lat: 9.9400,
                    lon: 76.2710,
                },
            ],
            enabled: true,
            reversed: false,
            speed_kmh: None,
            color: None,
        }];

        config.loop_mode = LoopMode::Once;
        let eng_once = GeoEngine::new(&config);
        let len = eng_once.total_length_m();
        let pos_end = eng_once.get_position_at_time(1000.0);
        assert!((pos_end.route_distance_m - len).abs() < 1e-3);

        config.loop_mode = LoopMode::PingPong;
        let eng_pp = GeoEngine::new(&config);
        let half_t = (len / 10.0) * 1.5; // halfway back on reverse leg
        let pos_rev = eng_pp.get_position_at_time(half_t);
        assert!(
            (pos_rev.heading_deg - 270.0).abs() < 2.0,
            "PingPong return leg should head West ~270°, got {}",
            pos_rev.heading_deg
        );

        config.loop_mode = LoopMode::Loop;
        let eng_loop = GeoEngine::new(&config);
        let wrap_t = (len / 10.0) * 1.25;
        let pos_wrap = eng_loop.get_position_at_time(wrap_t);
        assert!(
            (pos_wrap.heading_deg - 90.0).abs() < 2.0,
            "Loop mode should wrap heading East ~90°, got {}",
            pos_wrap.heading_deg
        );
    }

    #[test]
    fn test_human_drive_corner_deceleration_and_stability() {
        let mut config = LocationConfig::default();
        config.path_mode = PathMode::CustomSequence;
        config.connect_pathways = false;
        config.loop_mode = LoopMode::Once;
        config.vehicle_speed_kmh = 40.0;
        config.human_drive = HumanDriveConfig {
            enabled: true,
            corner_smoothness: 0.85,
            lateral_weave_m: 0.5,
            speed_variance_pct: 5.0,
            smooth_curves: true,
        };
        config.pathways = vec![Pathway {
            id: "corner".into(),
            name: "Sharp 90".into(),
            kind: PathKind::Waypoint,
            points: vec![
                GeoPoint {
                    lat: 9.9400,
                    lon: 76.2700,
                },
                GeoPoint {
                    lat: 9.9400,
                    lon: 76.2710,
                }, // ~110m East
                GeoPoint {
                    lat: 9.9410,
                    lon: 76.2710,
                }, // ~111m North (90° sharp corner)
            ],
            enabled: true,
            reversed: false,
            speed_kmh: Some(40.0),
            color: None,
        }];

        let eng = GeoEngine::new(&config);
        // Far on straightaway vs approaching the sharp corner around ~105m
        let pos_straight = eng.sample_at_distance(20.0, 2.0, true);
        let pos_corner = eng.sample_at_distance(104.0, 2.0, true);
        assert!(pos_straight.lat.is_finite() && pos_straight.lon.is_finite());
        assert!(pos_corner.heading_deg.is_finite());
        assert!(
            pos_corner.speed_kmh < pos_straight.speed_kmh,
            "Corner speed ({}) should be lower than straightaway speed ({})",
            pos_corner.speed_kmh,
            pos_straight.speed_kmh
        );
    }

    #[test]
    fn test_offset_coordinate() {
        let (lat_off, lon_off) = GeoEngine::offset_coordinate(10.0, 70.0, 90.0, 2.5, 0.0);
        assert!(
            lat_off < 10.0,
            "Lateral right offset facing East should shift South (lat decrease)"
        );
        assert!((lon_off - 70.0).abs() < 0.0001);
    }
}

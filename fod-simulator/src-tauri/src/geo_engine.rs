use crate::models::LocationConfig;
use rand::Rng;

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
}

pub struct GeoEngine {
    pub polygon: [(f64, f64); 4],
    waypoints: Vec<Waypoint>,
    segment_lengths: Vec<f64>,
    total_length_m: f64,
    speed_m_s: f64,
    speed_kmh: f64,
}

impl GeoEngine {
    pub fn new(config: &LocationConfig) -> Self {
        let polygon = config.polygon();
        let waypoints = Self::generate_sweep_waypoints(config);
        let mut segment_lengths = Vec::new();
        let mut total_length_m = 0.0;

        for i in 0..waypoints.len() {
            let next_idx = (i + 1) % waypoints.len();
            let p1 = &waypoints[i];
            let p2 = &waypoints[next_idx];
            let dist = haversine_distance(p1.lat, p1.lon, p2.lat, p2.lon);
            segment_lengths.push(dist);
            total_length_m += dist;
        }

        let speed_kmh = config.vehicle_speed_kmh.max(1.0);
        let speed_m_s = (speed_kmh * 1000.0) / 3600.0;

        Self {
            polygon,
            waypoints,
            segment_lengths,
            total_length_m: total_length_m.max(1.0),
            speed_m_s,
            speed_kmh,
        }
    }

    fn generate_sweep_waypoints(config: &LocationConfig) -> Vec<Waypoint> {
        let p1 = (config.p1_lat, config.p1_lon);
        let p2 = (config.p2_lat, config.p2_lon);
        let p3 = (config.p3_lat, config.p3_lon);
        let p4 = (config.p4_lat, config.p4_lon);

        let d12 = haversine_distance(p1.0, p1.1, p2.0, p2.1);
        let d23 = haversine_distance(p2.0, p2.1, p3.0, p3.1);
        let d34 = haversine_distance(p3.0, p3.1, p4.0, p4.1);
        let d41 = haversine_distance(p4.0, p4.1, p1.0, p1.1);

        let len_axis_a = (d12 + d34) / 2.0; // lengthwise along sides 1-2 & 4-3
        let len_axis_b = (d41 + d23) / 2.0; // lengthwise along sides 4-1 & 2-3

        let passes = config.sweep_passes.max(1) as usize;
        let mut wps = Vec::new();

        for pass in 0..passes {
            let u = (pass as f64 + 0.5) / (passes as f64);
            let (start_pt, end_pt) = if len_axis_a >= len_axis_b {
                // Sweep lengthwise along sides 1-2 & 4-3; passes spaced along sides 4-1 & 2-3
                let start_lat = p1.0 + u * (p4.0 - p1.0);
                let start_lon = p1.1 + u * (p4.1 - p1.1);
                let end_lat = p2.0 + u * (p3.0 - p2.0);
                let end_lon = p2.1 + u * (p3.1 - p2.1);
                ((start_lat, start_lon), (end_lat, end_lon))
            } else {
                // Sweep lengthwise along sides 4-1 & 2-3; passes spaced along sides 1-2 & 4-3
                let start_lat = p1.0 + u * (p2.0 - p1.0);
                let start_lon = p1.1 + u * (p2.1 - p1.1);
                let end_lat = p4.0 + u * (p3.0 - p4.0);
                let end_lon = p4.1 + u * (p3.1 - p4.1);
                ((start_lat, start_lon), (end_lat, end_lon))
            };

            if pass % 2 == 0 {
                wps.push(Waypoint {
                    lat: start_pt.0,
                    lon: start_pt.1,
                });
                wps.push(Waypoint {
                    lat: end_pt.0,
                    lon: end_pt.1,
                });
            } else {
                wps.push(Waypoint {
                    lat: end_pt.0,
                    lon: end_pt.1,
                });
                wps.push(Waypoint {
                    lat: start_pt.0,
                    lon: start_pt.1,
                });
            }
        }

        // Return loop waypoint to start
        if let Some(first) = wps.first() {
            wps.push(first.clone());
        }

        wps
    }

    pub fn is_inside_boundary(&self, lat: f64, lon: f64) -> bool {
        is_point_in_polygon(lat, lon, &self.polygon)
    }

    pub fn clamp_to_boundary(
        &self,
        cand_lat: f64,
        cand_lon: f64,
        safe_lat: f64,
        safe_lon: f64,
    ) -> (f64, f64) {
        clamp_inside_boundary(cand_lat, cand_lon, safe_lat, safe_lon, &self.polygon)
    }

    pub fn random_point_in_boundary<R: Rng + ?Sized>(&self, rng: &mut R) -> (f64, f64) {
        random_point_in_quadrilateral(&self.polygon, rng)
    }

    pub fn get_position_at_time(&self, elapsed_secs: f64) -> VehiclePosition {
        if self.waypoints.is_empty() {
            return VehiclePosition {
                lat: 0.0,
                lon: 0.0,
                heading_deg: 0.0,
                speed_kmh: self.speed_kmh,
            };
        }

        let traveled = (elapsed_secs * self.speed_m_s) % self.total_length_m;
        let mut accum = 0.0;

        for (i, &len) in self.segment_lengths.iter().enumerate() {
            if accum + len >= traveled || i == self.segment_lengths.len() - 1 {
                let segment_progress = if len > 0.0 {
                    (traveled - accum).clamp(0.0, len) / len
                } else {
                    0.0
                };

                let next_idx = (i + 1) % self.waypoints.len();
                let p1 = &self.waypoints[i];
                let p2 = &self.waypoints[next_idx];

                let lat = p1.lat + (p2.lat - p1.lat) * segment_progress;
                let lon = p1.lon + (p2.lon - p1.lon) * segment_progress;
                let heading = calculate_bearing(p1.lat, p1.lon, p2.lat, p2.lon);

                return VehiclePosition {
                    lat,
                    lon,
                    heading_deg: heading,
                    speed_kmh: self.speed_kmh,
                };
            }
            accum += len;
        }

        let first = &self.waypoints[0];
        VehiclePosition {
            lat: first.lat,
            lon: first.lon,
            heading_deg: 0.0,
            speed_kmh: self.speed_kmh,
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
        let delta_north = forward_offset_m * heading_rad.cos() - lateral_offset_m * heading_rad.sin();
        let delta_east = forward_offset_m * heading_rad.sin() + lateral_offset_m * heading_rad.cos();

        // 1 deg latitude ≈ 111,139 meters
        let lat_offset = delta_north / 111_139.0;
        let lon_offset = delta_east / (111_139.0 * lat.to_radians().cos().abs().max(0.01));

        (lat + lat_offset, lon + lon_offset)
    }
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

pub fn random_point_in_quadrilateral<R: Rng + ?Sized>(
    polygon: &[(f64, f64); 4],
    rng: &mut R,
) -> (f64, f64) {
    let p1 = polygon[0];
    let p2 = polygon[1];
    let p3 = polygon[2];
    let p4 = polygon[3];

    // Split quadrilateral into two triangles: (P1, P2, P3) and (P1, P3, P4)
    let area1 = (0.5 * ((p2.1 - p1.1) * (p3.0 - p1.0) - (p3.1 - p1.1) * (p2.0 - p1.0))).abs();
    let area2 = (0.5 * ((p3.1 - p1.1) * (p4.0 - p1.0) - (p4.1 - p1.1) * (p3.0 - p1.0))).abs();
    let total_area = area1 + area2;

    let (a, b, c) = if total_area > 1e-12 && rng.gen::<f64>() * total_area > area1 {
        (p1, p3, p4)
    } else {
        (p1, p2, p3)
    };

    // Uniform sample inside triangle (a, b, c)
    let mut r1: f64 = rng.gen();
    let mut r2: f64 = rng.gen();
    if r1 + r2 > 1.0 {
        r1 = 1.0 - r1;
        r2 = 1.0 - r2;
    }

    let lat = a.0 + r1 * (b.0 - a.0) + r2 * (c.0 - a.0);
    let lon = a.1 + r1 * (b.1 - a.1) + r2 * (c.1 - a.1);
    (lat, lon)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bearing_cardinal_directions() {
        let b_east = calculate_bearing(10.0, 70.0, 10.0, 71.0);
        assert!((b_east - 90.0).abs() < 1.0, "Bearing to East should be ~90 deg, got {}", b_east);

        let b_north = calculate_bearing(10.0, 70.0, 11.0, 70.0);
        assert!((b_north - 0.0).abs() < 1.0, "Bearing to North should be ~0 deg, got {}", b_north);

        let b_south = calculate_bearing(11.0, 70.0, 10.0, 70.0);
        assert!((b_south - 180.0).abs() < 1.0, "Bearing to South should be ~180 deg, got {}", b_south);
    }

    #[test]
    fn test_haversine_distance() {
        let dist = haversine_distance(10.0, 70.0, 11.0, 70.0);
        assert!(dist > 110_000.0 && dist < 112_000.0, "1 deg lat should be ~111km, got {}", dist);
    }

    #[test]
    fn test_polygon_point_containment() {
        let polygon = [
            (9.9400, 76.2700),
            (9.9400, 76.2800),
            (9.9500, 76.2800),
            (9.9500, 76.2700),
        ];

        // Inside point (center)
        assert!(is_point_in_polygon(9.9450, 76.2750, &polygon));
        // Outside points
        assert!(!is_point_in_polygon(9.9300, 76.2750, &polygon));
        assert!(!is_point_in_polygon(9.9600, 76.2750, &polygon));
        assert!(!is_point_in_polygon(9.9450, 76.2600, &polygon));
        assert!(!is_point_in_polygon(9.9450, 76.2900, &polygon));
    }

    #[test]
    fn test_polygon_clamping() {
        let polygon = [
            (9.9400, 76.2700),
            (9.9400, 76.2800),
            (9.9500, 76.2800),
            (9.9500, 76.2700),
        ];
        let safe_center = (9.9450, 76.2750);
        let outside_point = (9.9600, 76.2750);

        let (clamped_lat, clamped_lon) = clamp_inside_boundary(
            outside_point.0,
            outside_point.1,
            safe_center.0,
            safe_center.1,
            &polygon,
        );

        assert!(is_point_in_polygon(clamped_lat, clamped_lon, &polygon));
    }

    #[test]
    fn test_geo_engine_trajectory_interpolation() {
        let config = LocationConfig {
            p1_lat: 9.9400,
            p1_lon: 76.2700,
            p2_lat: 9.9400,
            p2_lon: 76.2800,
            p3_lat: 9.9500,
            p3_lon: 76.2800,
            p4_lat: 9.9500,
            p4_lon: 76.2700,
            vehicle_speed_kmh: 36.0, // 10 m/s
            sweep_passes: 3,
            lane_width_m: 10.0,
        };

        let engine = GeoEngine::new(&config);
        assert!(!engine.waypoints.is_empty());

        let pos0 = engine.get_position_at_time(0.0);
        assert!(pos0.lat >= 9.9400 && pos0.lat <= 9.9500);
        assert!(pos0.lon >= 76.2700 && pos0.lon <= 76.2800);
        assert!(engine.is_inside_boundary(pos0.lat, pos0.lon));

        let pos10 = engine.get_position_at_time(10.0);
        assert!(pos10.lat >= 9.9390 && pos10.lat <= 9.9510);
    }

    #[test]
    fn test_random_point_in_quadrilateral() {
        let polygon = [
            (9.9400, 76.2700),
            (9.9400, 76.2800),
            (9.9500, 76.2800),
            (9.9500, 76.2700),
        ];
        let mut rng = rand::thread_rng();

        for _ in 0..50 {
            let (lat, lon) = random_point_in_quadrilateral(&polygon, &mut rng);
            assert!(
                is_point_in_polygon(lat, lon, &polygon),
                "Random point ({}, {}) was outside polygon boundary",
                lat,
                lon
            );
        }
    }

    #[test]
    fn test_offset_coordinate() {
        let (lat_off, lon_off) = GeoEngine::offset_coordinate(10.0, 70.0, 90.0, 2.5, 0.0);
        assert!(lat_off < 10.0, "Lateral right offset facing East should shift South (lat decrease)");
        assert!((lon_off - 70.0).abs() < 0.0001);
    }
}


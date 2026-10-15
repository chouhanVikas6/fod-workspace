use crate::models::LocationConfig;

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
    waypoints: Vec<Waypoint>,
    segment_lengths: Vec<f64>,
    total_length_m: f64,
    speed_m_s: f64,
    speed_kmh: f64,
}

impl GeoEngine {
    pub fn new(config: &LocationConfig) -> Self {
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
            waypoints,
            segment_lengths,
            total_length_m: total_length_m.max(1.0),
            speed_m_s,
            speed_kmh,
        }
    }

    fn generate_sweep_waypoints(config: &LocationConfig) -> Vec<Waypoint> {
        let min_lat = config.min_lat.min(config.max_lat);
        let max_lat = config.min_lat.max(config.max_lat);
        let min_lon = config.min_lon.min(config.max_lon);
        let max_lon = config.min_lon.max(config.max_lon);

        let passes = config.sweep_passes.max(1) as usize;
        let mut wps = Vec::new();

        let lat_step = (max_lat - min_lat) / (passes as f64);

        for pass in 0..passes {
            let cur_lat = min_lat + (pass as f64 * lat_step) + (lat_step / 2.0);
            if pass % 2 == 0 {
                // West to East
                wps.push(Waypoint {
                    lat: cur_lat,
                    lon: min_lon,
                });
                wps.push(Waypoint {
                    lat: cur_lat,
                    lon: max_lon,
                });
            } else {
                // East to West
                wps.push(Waypoint {
                    lat: cur_lat,
                    lon: max_lon,
                });
                wps.push(Waypoint {
                    lat: cur_lat,
                    lon: min_lon,
                });
            }
        }

        // Return loop waypoint to start
        if let Some(first) = wps.first() {
            wps.push(first.clone());
        }

        wps
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bearing_cardinal_directions() {
        // Due East (lat same, lon increases)
        let b_east = calculate_bearing(10.0, 70.0, 10.0, 71.0);
        assert!((b_east - 90.0).abs() < 1.0, "Bearing to East should be ~90 deg, got {}", b_east);

        // Due North (lon same, lat increases)
        let b_north = calculate_bearing(10.0, 70.0, 11.0, 70.0);
        assert!((b_north - 0.0).abs() < 1.0, "Bearing to North should be ~0 deg, got {}", b_north);

        // Due South (lon same, lat decreases)
        let b_south = calculate_bearing(11.0, 70.0, 10.0, 70.0);
        assert!((b_south - 180.0).abs() < 1.0, "Bearing to South should be ~180 deg, got {}", b_south);
    }

    #[test]
    fn test_haversine_distance() {
        // 1 degree latitude is approx 111 km
        let dist = haversine_distance(10.0, 70.0, 11.0, 70.0);
        assert!(dist > 110_000.0 && dist < 112_000.0, "1 deg lat should be ~111km, got {}", dist);
    }

    #[test]
    fn test_geo_engine_trajectory_interpolation() {
        let config = LocationConfig {
            min_lat: 9.9400,
            max_lat: 9.9500,
            min_lon: 76.2700,
            max_lon: 76.2800,
            vehicle_speed_kmh: 36.0, // 10 m/s
            sweep_passes: 3,
            lane_width_m: 10.0,
        };

        let engine = GeoEngine::new(&config);
        assert!(!engine.waypoints.is_empty());

        let pos0 = engine.get_position_at_time(0.0);
        assert!(pos0.lat >= 9.9400 && pos0.lat <= 9.9500);
        assert!(pos0.lon >= 76.2700 && pos0.lon <= 76.2800);

        let pos10 = engine.get_position_at_time(10.0);
        assert!(pos10.lat >= 9.9390 && pos10.lat <= 9.9510);
    }

    #[test]
    fn test_offset_coordinate() {
        let (lat_off, lon_off) = GeoEngine::offset_coordinate(10.0, 70.0, 90.0, 2.5, 0.0);
        // Heading East (90 deg), lateral offset +2.5m (right = South)
        assert!(lat_off < 10.0, "Lateral right offset facing East should shift South (lat decrease)");
        assert!((lon_off - 70.0).abs() < 0.0001);
    }
}


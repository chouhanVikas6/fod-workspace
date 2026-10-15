use std::collections::BTreeMap;
use std::f64::consts::PI;

pub const GEOLIB_EARTH_RADIUS_M: f64 = 6_378_137.0;

#[inline]
pub fn to_rad(deg: f64) -> f64 {
    deg * PI / 180.0
}

/// Exact port of geolib v3 getDistance(from, to, accuracy)
/// using spherical law of cosines with earthRadius = 6,378,137m.
pub fn geolib_distance(from: (f64, f64), to: (f64, f64), accuracy: f64) -> f64 {
    let (from_lat, from_lon) = (to_rad(from.0), to_rad(from.1));
    let (to_lat, to_lon) = (to_rad(to.0), to_rad(to.1));

    let cos_angle = to_lat.sin() * from_lat.sin()
        + to_lat.cos() * from_lat.cos() * (from_lon - to_lon).cos();

    let d = cos_angle.clamp(-1.0, 1.0).acos() * GEOLIB_EARTH_RADIUS_M;
    (d / accuracy).round() * accuracy
}

#[derive(Debug, Clone)]
pub struct Track {
    pub display_id: i64,
    pub count: u32,
    pub lat: f64,
    pub lon: f64,
    pub last_seen_ms: i64,
}

pub struct Tracker {
    group_count: i64,
    refresh_ms: i64,
    threshold_m: f64,
    max_count: u32,
    /// BTreeMap ensures ascending numeric iteration order, matching JS Object.values()
    tracks: BTreeMap<i64, Track>,
}

impl Tracker {
    pub fn new(initial_count: i64, refresh_ms: i64, threshold_m: f64, max_count: u32) -> Self {
        Self {
            group_count: initial_count,
            refresh_ms,
            threshold_m,
            max_count,
            tracks: BTreeMap::new(),
        }
    }

    pub fn group_count(&self) -> i64 {
        self.group_count
    }

    pub fn active_track_count(&self) -> usize {
        self.tracks.len()
    }

    /// Process a detection packet and return the assigned groupId.
    /// Returns -1 for invalid sentinel GPS (-1.0, -1.0).
    pub fn process_packet(&mut self, lat: f64, lon: f64, now_ms: i64) -> i64 {
        if lat == -1.0 || lon == -1.0 {
            return -1;
        }

        let mut assigned_id = None;

        // 1. Scan existing tracks in ascending key order
        for (id, track) in self.tracks.iter_mut() {
            let dist = geolib_distance((lat, lon), (track.lat, track.lon), 0.1);
            if dist < self.threshold_m {
                if track.count < self.max_count {
                    track.count += 1;
                    track.last_seen_ms = now_ms;
                    assigned_id = Some(*id);
                    break;
                }
            }
        }

        // 2. If no track matched, generate a new sequential track
        let id = match assigned_id {
            Some(id) => id,
            None => {
                self.group_count += 1;
                let new_id = self.group_count;
                self.tracks.insert(
                    new_id,
                    Track {
                        display_id: new_id,
                        count: 1,
                        lat,
                        lon,
                        last_seen_ms: now_ms,
                    },
                );
                new_id
            }
        };

        // 3. Prune expired tracks after processing (matching TS behavior)
        self.prune_tracks(now_ms);

        id
    }

    fn prune_tracks(&mut self, now_ms: i64) {
        let refresh = self.refresh_ms;
        self.tracks.retain(|_, track| now_ms - track.last_seen_ms <= refresh);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_geolib_distance_exact() {
        // Known coordinates (approx 111km per latitude degree)
        let loc1 = (12.9716, 77.5946);
        let loc2 = (12.9716, 77.5946);
        assert_eq!(geolib_distance(loc1, loc2, 0.1), 0.0);

        // Distance over 10 meters
        let loc3 = (12.9716, 77.5946);
        let loc4 = (12.97169, 77.5946); // ~10m north
        let d = geolib_distance(loc3, loc4, 0.1);
        assert!(d > 9.0 && d < 11.0);
    }

    #[test]
    fn test_sentinel_location() {
        let mut tracker = Tracker::new(0, 60000, 5.0, 15);
        assert_eq!(tracker.process_packet(-1.0, -1.0, 1000), -1);
    }

    #[test]
    fn test_tracker_grouping_and_pruning() {
        let mut tracker = Tracker::new(0, 60000, 5.0, 15);
        let now = 1000;

        // First packet creates group 1
        let g1 = tracker.process_packet(12.971600, 77.594600, now);
        assert_eq!(g1, 1);

        // Close packet (within 5m) gets same group 1
        let g2 = tracker.process_packet(12.971605, 77.594605, now + 100);
        assert_eq!(g2, 1);

        // Far packet at t = 62000 (after 60s has elapsed since track 1's last seen at 1100)
        // This will process group 3, and then prune expired track 1 (62000 - 1100 > 60000)
        let g3 = tracker.process_packet(12.980000, 77.600000, now + 62000);
        assert_eq!(g3, 2);

        // Now a packet near location 1 arrives at t = 63000.
        // Because track 1 was pruned during the previous call, it creates a new group 3!
        let g4 = tracker.process_packet(12.971600, 77.594600, now + 63000);
        assert_eq!(g4, 3);
    }

    #[test]
    fn test_high_throughput_burst_simulation() {
        let mut tracker = Tracker::new(0, 60000, 5.0, 15);
        let start = std::time::Instant::now();
        let total_packets = 10_000;

        for i in 0..total_packets {
            // Simulate 20 distinct FOD clusters along runway
            let cluster_id = (i % 20) as f64;
            let lat = 12.9716 + (cluster_id * 0.001) + ((i % 5) as f64 * 0.00001);
            let lon = 77.5946 + (cluster_id * 0.001) + ((i % 5) as f64 * 0.00001);
            let gid = tracker.process_packet(lat, lon, 1000 + (i as i64 * 10));
            assert!(gid > 0);
        }

        let elapsed = start.elapsed();
        assert!(
            elapsed.as_millis() < 500,
            "10k detections must process in < 500ms (actual: {:?})",
            elapsed
        );
    }
}

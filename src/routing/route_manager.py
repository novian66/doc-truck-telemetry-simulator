"""
Route Manager Module
Menangani interpolasi koordinat rute, kalkulasi jarak kumulatif Haversine,
heading bearing, dan pemetaan segmen jalan.
"""

import math
from typing import List, Tuple, Dict, Any, Optional

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Menghitung jarak Great-Circle antara 2 titik koordinat dalam KM"""
    R = 6371.0 # Radius bumi dalam km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2.0) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Menghitung arah mata angin (bearing / heading 0° - 360°)"""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_lambda = math.radians(lon2 - lon1)

    y = math.sin(delta_lambda) * math.cos(phi2)
    x = (math.cos(phi1) * math.sin(phi2) -
         math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda))
    theta = math.atan2(y, x)
    return (math.degrees(theta) + 360.0) % 360.0

def calculate_bearing_diff(b1: float, b2: float) -> float:
    """Menghitung selisih sudut heading terkecil (0° - 180°)"""
    diff = abs(b2 - b1) % 360.0
    if diff > 180.0:
        diff = 360.0 - diff
    return diff

class RouteTrack:
    def __init__(self, coordinates: List[List[float]], total_distance_km: Optional[float] = None):
        """
        coordinates: List of [lng, lat] (format GeoJSON standar)
        """
        self.raw_coordinates = coordinates # [lng, lat]
        self.points: List[Tuple[float, float]] = [] # [(lat, lng)]
        for pt in coordinates:
            self.points.append((pt[1], pt[0]))

        # Hitung jarak kumulatif di setiap waypoint
        self.cumulative_dist: List[float] = [0.0]
        cur_dist = 0.0
        for i in range(len(self.points) - 1):
            p1 = self.points[i]
            p2 = self.points[i + 1]
            seg_dist = haversine_distance(p1[0], p1[1], p2[0], p2[1])
            cur_dist += seg_dist
            self.cumulative_dist.append(cur_dist)

        self.calculated_total_km = cur_dist if cur_dist > 0 else 1.0
        self.total_distance_km = total_distance_km if (total_distance_km and total_distance_km > 0) else self.calculated_total_km

        # Prekalkulasi tikungan, radius kurvatur, dan batas kecepatan aman DOC di sepanjang rute
        self.curves: List[Dict[str, Any]] = []
        self._detect_curves()

    def _detect_curves(self):
        """
        Mendeteksi tikungan jalan di sepanjang waypoint.
        Menghitung radius kurvatur R (meter), panjang busur transisi L (meter),
        dan batas kecepatan sentripetal aman DOC (v_safe = sqrt(R * a_lat_max)).
        """
        if len(self.points) < 3:
            return

        scale_ratio = self.total_distance_km / self.calculated_total_km if self.calculated_total_km > 0 else 1.0

        for i in range(1, len(self.points) - 1):
            p_prev = self.points[i - 1]
            p_curr = self.points[i]
            p_next = self.points[i + 1]

            b1 = calculate_bearing(p_prev[0], p_prev[1], p_curr[0], p_curr[1])
            b2 = calculate_bearing(p_curr[0], p_curr[1], p_next[0], p_next[1])
            diff_deg = calculate_bearing_diff(b1, b2)

            # Jika perubahan sudut >= 2.5 derajat, terdeteksi tikungan
            if diff_deg >= 2.5:
                d_prev_m = (self.cumulative_dist[i] - self.cumulative_dist[i - 1]) * 1000.0
                d_next_m = (self.cumulative_dist[i + 1] - self.cumulative_dist[i]) * 1000.0
                d_avg_m = (d_prev_m + d_next_m) / 2.0

                # Panjang busur transisi kurva
                L_m = min(200.0, d_avg_m) if d_avg_m < 250.0 else 150.0
                diff_rad = math.radians(diff_deg)
                radius_m = max(25.0, min(5000.0, L_m / diff_rad))

                # Kecepatan aman sentripetal DOC (maks lateral g <= 0.18g = 1.8 m/s^2)
                # v_safe = sqrt(R * a_lat_max) * 3.6 (km/h)
                a_lat_max = 1.8 # m/s^2
                v_safe_kmh = min(120.0, math.sqrt(radius_m * a_lat_max) * 3.6)

                # Panjang zona pengaruh kurva di lintasan jalan
                arc_len_km = max(0.12, (radius_m * diff_rad) / 1000.0)
                norm_dist_km = self.cumulative_dist[i] * scale_ratio

                self.curves.append({
                    "idx": i,
                    "vertex_dist_km": norm_dist_km,
                    "delta_deg": diff_deg,
                    "radius_m": radius_m,
                    "safe_speed_kmh": v_safe_kmh,
                    "arc_len_km": arc_len_km,
                    "start_km": max(0.0, norm_dist_km - (arc_len_km / 2.0)),
                    "end_km": min(self.total_distance_km, norm_dist_km + (arc_len_km / 2.0))
                })

    def get_curve_info_at_distance(
        self,
        distance_km: float,
        lookahead_km: float = 0.5,
        a_decel: float = 1.2,
        a_lat_max: float = 1.8
    ) -> Dict[str, Any]:
        """
        Menganalisis radius kurvatur jalan saat ini dan memindai tikungan ke depan (lookahead horizon).
        Menerapkan rumus deselerasi prediktif:
        v_allowed = sqrt(v_safe^2 + 2 * a_decel * d_ahead) * 3.6
        """
        current_radius_m = 5000.0
        allowed_speeds: List[float] = []

        for c in self.curves:
            # 1. Truk sedang berada di dalam tikungan
            if c["start_km"] <= distance_km <= c["end_km"]:
                current_radius_m = min(current_radius_m, c["radius_m"])
                allowed_speeds.append(c["safe_speed_kmh"])
            # 2. Tikungan berada di depan dalam rentang horizon pandang (lookahead)
            elif distance_km < c["start_km"] and (c["start_km"] - distance_km) <= lookahead_km:
                d_ahead_m = (c["start_km"] - distance_km) * 1000.0
                v_safe_ms = c["safe_speed_kmh"] / 3.6
                # Persamaan gerak GLBB pengereman halus sebelum tikungan
                v_allowed_ms = math.sqrt(v_safe_ms ** 2 + 2.0 * a_decel * d_ahead_m)
                allowed_speeds.append(v_allowed_ms * 3.6)

        governed_speed = min(allowed_speeds) if allowed_speeds else 120.0

        return {
            "governed_speed_kmh": round(governed_speed, 1),
            "current_curve_radius_m": round(current_radius_m, 1),
            "curves_in_horizon": len(allowed_speeds)
        }

    def get_position_at_distance(self, distance_km: float) -> Dict[str, Any]:
        """
        Interpolasi posisi [lat, lng, bearing, segment_idx] pada jarak tertentu dari titik awal.
        """
        if len(self.points) == 0:
            return {
                "lat": -6.5650, "lng": 107.7600,
                "latitude": -6.5650, "longitude": 107.7600,
                "bearing": 0.0, "is_completed": True, "segment_idx": 0
            }

        # Normalisasi jarak jika skala disesuaikan
        scale_ratio = self.calculated_total_km / self.total_distance_km if self.total_distance_km > 0 else 1.0
        target_calc_dist = min(max(0.0, distance_km * scale_ratio), self.calculated_total_km)

        if target_calc_dist >= self.calculated_total_km:
            last = self.points[-1]
            prev = self.points[-2] if len(self.points) > 1 else last
            b = calculate_bearing(prev[0], prev[1], last[0], last[1])
            lat_r = round(last[0], 6)
            lng_r = round(last[1], 6)
            return {
                "lat": lat_r,
                "lng": lng_r,
                "latitude": lat_r,
                "longitude": lng_r,
                "bearing": round(b, 1),
                "is_completed": True,
                "segment_idx": 4
            }

        # Binary search / Linear scan untuk menemukan segmen
        idx = 0
        for i in range(len(self.cumulative_dist) - 1):
            if self.cumulative_dist[i] <= target_calc_dist <= self.cumulative_dist[i + 1]:
                idx = i
                break

        p1 = self.points[idx]
        p2 = self.points[idx + 1]
        d1 = self.cumulative_dist[idx]
        d2 = self.cumulative_dist[idx + 1]
        seg_len = d2 - d1

        fraction = 0.0 if seg_len <= 1e-9 else (target_calc_dist - d1) / seg_len
        fraction = min(max(0.0, fraction), 1.0)

        interp_lat = p1[0] + fraction * (p2[0] - p1[0])
        interp_lng = p1[1] + fraction * (p2[1] - p1[1])
        bearing = calculate_bearing(p1[0], p1[1], p2[0], p2[1])

        # Tentukan segmen 0 - 4
        progress_pct = target_calc_dist / self.calculated_total_km
        segment_idx = min(int(progress_pct * 5), 4)

        lat_r = round(interp_lat, 6)
        lng_r = round(interp_lng, 6)

        return {
            "lat": lat_r,
            "lng": lng_r,
            "latitude": lat_r,
            "longitude": lng_r,
            "bearing": round(bearing, 1),
            "is_completed": False,
            "segment_idx": segment_idx
        }

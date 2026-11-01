"""
Kinematics & Road Dynamics Module
Sesuai spesifikasi physics_and_algorithms_spec.md §4
Mengelola percepatan/pengereman truk, profil kecepatan adaptif tikungan (curve governor),
deselerasi prediktif lookahead, zona keberangkatan (first-mile) & kedatangan (last-mile),
serta mikrogoyangan stokastik pengemudi dan kalkulasi g-force lateral.
"""

import math
import random
from typing import Dict, Any, Optional
from src.routing.route_manager import RouteTrack

# Kecepatan target dasar jalan tol (km/h)
ROAD_SPEED_TARGETS_TOLL = {
    "FREE_FLOW": 75.0,        # Tol lancar km/h
    "FREE_FLOW_ARTERI": 45.0, # Arteri biasa km/h
    "CONGESTED": 24.0,        # Padat merayap km/h
    "GRIDLOCK": 0.0,          # Macet total
    "DAMAGED_ROAD": 18.0,     # Jalan rusak
    "FLOODED": 8.0,           # Tergenang banjir
    "DISASTER_BLOCKED": 0.0   # Bencana / longsor
}

# Kecepatan target dasar rute non-tol / arteri (km/h)
ROAD_SPEED_TARGETS_NON_TOLL = {
    "FREE_FLOW": 48.0,        # Arteri luar kota lancar km/h
    "FREE_FLOW_ARTERI": 42.0, # Arteri biasa km/h
    "CONGESTED": 18.0,        # Padat merayap non-tol km/h
    "GRIDLOCK": 0.0,          # Macet total
    "DAMAGED_ROAD": 14.0,     # Jalan bergelombang/rusak
    "FLOODED": 6.0,           # Genangan air
    "DISASTER_BLOCKED": 0.0   # Bencana / tertutup
}

class KinematicsEngine:
    def __init__(self, route_track: RouteTrack, route_type: str = "TOLL_HIGHWAY", random_seed: int = 20261030):
        self.track = route_track
        self.route_type = route_type
        self.distance_traveled_km = 0.0
        self.current_speed_kmh = 0.0
        self.is_completed = False
        self.current_road_condition = "FREE_FLOW"
        self.traffic_stop_fault = False

        # Profil adaptif tikungan & kinematika DOC
        self.a_lat_max = 1.8           # Batas akselerasi lateral kesejahteraan DOC (m/s^2 ≈ 0.183g)
        self.a_decel = 1.2             # Deselerasi nyaman armada ternak (m/s^2)
        self.lookahead_horizon_km = 0.5# Rentang pemindaian tikungan ke depan (500 meter)
        self.current_curve_radius_m = 5000.0
        self.current_lateral_accel_g = 0.0

        # Zona first-mile & last-mile
        self.first_mile_km = 3.0       # Jarak transisi keluar hatchery (KM 0 - 3)
        self.first_mile_min_kmh = 25.0 # Kecepatan awal merayap keluar pool/portal
        self.last_mile_km = 3.5        # Jarak transisi masuk area peternakan Bogor (3.5 KM terakhir)
        self.last_mile_min_kmh = 20.0  # Kecepatan mendekati unloading dock

        # Stokastik mikro pengemudi (mean-reverting Ornstein-Uhlenbeck noise)
        self.rng = random.Random(random_seed)
        self.driver_noise_kmh = 0.0
        self.current_rush_factor = 1.0

    @staticmethod
    def calculate_rush_hour_factor(clock_hours: float, is_non_toll: bool = False) -> float:
        """
        Modulator Jam Sibuk (Rush Hour Modulator)
        Menghasilkan faktor pengali kecepatan kontinual [0.45 s/d 1.00] berdasarkan jam biologis lalu lintas (WIB):
        - Puncak Pagi (07:00 - 08:30 WIB): perlambatan ~35% (Tol) / ~44% (Non-Tol)
        - Puncak Sore (16:30 - 18:30 WIB): perlambatan ~40% (Tol) / ~50% (Non-Tol)
        - Siang Hari (11:30 - 13:30 WIB): perlambatan ringan ~8%
        - Malam & Dini Hari (21:00 - 05:00 WIB): arus lancar bebas hambatan (faktor 1.00)
        """
        t = clock_hours % 24.0
        morn_dip = 0.35 * math.exp(-((t - 7.5) ** 2) / (2.0 * (0.9 ** 2)))
        eve_dip = 0.40 * math.exp(-((t - 17.5) ** 2) / (2.0 * (1.1 ** 2)))
        mid_dip = 0.08 * math.exp(-((t - 12.5) ** 2) / (2.0 * (1.5 ** 2)))

        total_dip = morn_dip + eve_dip + mid_dip
        if is_non_toll:
            total_dip *= 1.25 # Arteri nasional lebih rentan kemacetan jam sibuk

        return max(0.45, min(1.0, 1.0 - total_dip))

    def step(
        self,
        dt_seconds: float,
        road_condition: str,
        traffic_stop_fault: bool = False,
        route_type: Optional[str] = None,
        clock_hours: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Melakukan update kinematika 1 tick diskrit dengan profil kecepatan adaptif:
        v_target = min(v_road * K_rush, v_dep, v_arr, v_curve) + eta_driver
        """
        self.traffic_stop_fault = traffic_stop_fault
        self.current_road_condition = road_condition
        if route_type:
            self.route_type = route_type

        if self.is_completed:
            self.current_speed_kmh = 0.0
            self.current_lateral_accel_g = 0.0
            pos = self.track.get_position_at_distance(self.distance_traveled_km)
            return {
                "speed_kmh": 0.0,
                "target_speed_kmh": 0.0,
                "distance_km": round(self.distance_traveled_km, 3),
                "curve_radius_m": round(self.current_curve_radius_m, 1),
                "lateral_accel_g": 0.0,
                "rush_hour_factor": round(self.current_rush_factor, 2),
                "lat": pos["lat"],
                "lng": pos["lng"],
                "latitude": pos.get("latitude", pos["lat"]),
                "longitude": pos.get("longitude", pos["lng"]),
                "bearing": pos["bearing"],
                "is_completed": True,
                "segment_idx": pos["segment_idx"],
                "road_condition": self.current_road_condition,
                "route_type": self.route_type
            }

        is_non_toll = self.route_type in ("NON_TOLL", "NON_TOLL_ARTERIAL")
        speed_map = ROAD_SPEED_TARGETS_NON_TOLL if is_non_toll else ROAD_SPEED_TARGETS_TOLL

        # 1. Base Road Target Speed berdasarkan kondisi lalu lintas dan Modulator Jam Sibuk
        if self.traffic_stop_fault or self.current_road_condition in ("GRIDLOCK", "DISASTER_BLOCKED"):
            v_road = 0.0
            self.current_rush_factor = 1.0
        else:
            default_v = 45.0 if is_non_toll else 75.0
            base_v = speed_map.get(self.current_road_condition, default_v)
            if clock_hours is not None:
                self.current_rush_factor = self.calculate_rush_hour_factor(clock_hours, is_non_toll)
            else:
                self.current_rush_factor = 1.0
            v_road = base_v * self.current_rush_factor

        s = self.distance_traveled_km

        # 2. First-Mile Departure Ramp-Up (Keberangkatan Subang KM 0 - 3)
        # v_dep = 25.0 + (s / 3.0) * (v_road - 25.0)
        if s < self.first_mile_km and v_road > self.first_mile_min_kmh:
            frac_dep = min(1.0, max(0.0, s / self.first_mile_km))
            v_dep = self.first_mile_min_kmh + frac_dep * (v_road - self.first_mile_min_kmh)
        else:
            v_dep = v_road

        # 3. Last-Mile Arrival Slowdown (Kedatangan Peternakan Bogor 3.5 KM terakhir)
        # v_arr = 20.0 + (d_rem / 3.5) * (v_road - 20.0)
        d_rem = self.track.total_distance_km - s
        if d_rem <= self.last_mile_km and v_road > self.last_mile_min_kmh:
            frac_arr = min(1.0, max(0.0, d_rem / self.last_mile_km))
            v_arr = self.last_mile_min_kmh + frac_arr * (v_road - self.last_mile_min_kmh)
        else:
            v_arr = v_road

        # 4. Curve Governor & Lookahead Deceleration Scan
        # v_curve = sqrt(R * a_lat_max), v_allowed = sqrt(v_safe^2 + 2 * a_decel * d_ahead)
        curve_info = self.track.get_curve_info_at_distance(
            distance_km=s,
            lookahead_km=self.lookahead_horizon_km,
            a_decel=self.a_decel,
            a_lat_max=self.a_lat_max
        )
        v_curve = curve_info["governed_speed_kmh"]
        self.current_curve_radius_m = curve_info["current_curve_radius_m"]

        # Gabungan batas deterministik fisika
        v_deterministic = min(v_road, v_dep, v_arr, v_curve)

        # 5. Stochastic Driver Micro-Fluctuations (Throttle Breathing η ∈ [-2.5, +2.5] km/h)
        if v_deterministic > 8.0:
            noise_pulse = self.rng.uniform(-2.5, 2.5)
            self.driver_noise_kmh = 0.88 * self.driver_noise_kmh + 0.12 * noise_pulse
            target_v = max(5.0, v_deterministic + self.driver_noise_kmh)
        else:
            self.driver_noise_kmh = 0.0
            target_v = v_deterministic

        # 6. Dinamika Akselerasi & Pengereman Truk Muatan
        # Percepatan maks: 4.0 km/h per detik (~1.1 m/s^2)
        # Pengereman maks: 8.0 km/h per detik (~2.2 m/s^2)
        max_accel = 4.0 * dt_seconds
        max_decel = 8.0 * dt_seconds

        if self.current_speed_kmh < target_v:
            self.current_speed_kmh = min(target_v, self.current_speed_kmh + max_accel)
        elif self.current_speed_kmh > target_v:
            self.current_speed_kmh = max(target_v, self.current_speed_kmh - max_decel)

        # 7. Kalkulasi Akselerasi Lateral Sentripetal (g-force)
        # a_lat = v^2 / R (m/s^2) -> a_lat_g = a_lat / 9.81
        v_ms = self.current_speed_kmh / 3.6
        if self.current_curve_radius_m < 4500.0:
            a_lat_ms2 = (v_ms ** 2) / self.current_curve_radius_m
            self.current_lateral_accel_g = round(a_lat_ms2 / 9.81, 3)
        else:
            self.current_lateral_accel_g = 0.0

        # 8. Hitung perpindahan jarak: Δs = v * Δt
        delta_km = (self.current_speed_kmh / 3600.0) * dt_seconds
        self.distance_traveled_km += delta_km

        if self.distance_traveled_km >= self.track.total_distance_km:
            self.distance_traveled_km = self.track.total_distance_km
            self.is_completed = True
            self.current_speed_kmh = 0.0
            self.current_lateral_accel_g = 0.0

        pos = self.track.get_position_at_distance(self.distance_traveled_km)
        if pos.get("is_completed", False):
            self.is_completed = True

        return {
            "speed_kmh": round(self.current_speed_kmh, 1),
            "target_speed_kmh": round(target_v, 1),
            "distance_km": round(self.distance_traveled_km, 3),
            "curve_radius_m": round(self.current_curve_radius_m, 1),
            "lateral_accel_g": self.current_lateral_accel_g,
            "lat": pos["lat"],
            "lng": pos["lng"],
            "latitude": pos.get("latitude", pos["lat"]),
            "longitude": pos.get("longitude", pos["lng"]),
            "bearing": pos["bearing"],
            "is_completed": self.is_completed,
            "segment_idx": pos["segment_idx"],
            "road_condition": self.current_road_condition,
            "route_type": self.route_type
        }

"""
Biometrics, Welfare & Weight Loss Physics Module
Sesuai spesifikasi physics_and_algorithms_spec.md §12
Kalkulasi THI Cobb-Vantress, entalpi spesifik, susut bobot Khosravinia & Yerpes, dan status welfare.
"""

import math
from typing import Dict, Any

class BiometricsEngine:
    def __init__(self, initial_weight_g: float = 42.0):
        self.w0 = initial_weight_g
        self.cumulative_weight_loss_g = 0.0

    def step(
        self,
        dt_seconds: float,
        cargo_temp_c: float,
        rh_pct: float,
        box_core_temp_c: float,
        co2_ppm: int,
        vibration_g: float,
        speed_kmh: float
    ) -> Dict[str, Any]:
        """
        Kalkulasi biometrik dan kesejahteraan DOC dalam 1 tick
        """
        # 1. THI (Skala Cobb-Vantress: T_°F + RH_%)
        temp_f = (1.8 * cargo_temp_c) + 32.0
        thi = temp_f + rh_pct

        if thi < 142.0:
            thi_category = "COMFORT"
        elif thi < 160.0:
            thi_category = "ALERT"
        else:
            thi_category = "EMERGENCY"

        # 2. Entalpi Spesifik (kJ/kg udara kering)
        # Rasio kelembaban spesifik W_c (kg uap / kg udara) aproksimasi
        w_c = (0.622 * (rh_pct / 100.0) * 3.17) / (101.325 - (rh_pct / 100.0) * 3.17)
        enthalpy = 1.006 * cargo_temp_c + w_c * (2501.0 + 1.805 * cargo_temp_c)

        # 3. Susut Bobot Kumulatif (Khosravinia 2015 & Yerpes 2021)
        # Rate dalam gram per jam:
        term_distance = 0.45 * (speed_kmh / 100.0)
        term_duration = 0.002407 * self.w0
        base_rate_g_per_hour = max(term_distance, term_duration)

        phi_thi = 1.0 + max(0.0, (thi - 142.0) / 50.0)
        rate_g_per_sec = (base_rate_g_per_hour * phi_thi) / 3600.0

        self.cumulative_weight_loss_g += rate_g_per_sec * dt_seconds
        weight_loss_pct = min(15.0, (self.cumulative_weight_loss_g / self.w0) * 100.0)

        # 4. Status Kesejahteraan DOC (Welfare Status)
        is_critical = (
            box_core_temp_c > 37.5 or
            box_core_temp_c < 30.0 or
            co2_ppm > 2500 or
            thi >= 160.0
        )
        is_warning = (
            (35.0 < box_core_temp_c <= 37.5) or
            (30.0 <= box_core_temp_c < 32.0) or
            (1500 <= co2_ppm <= 2500) or
            (vibration_g > 0.40) or
            (rh_pct > 80.0 or rh_pct < 40.0)
        )

        if is_critical:
            welfare_status = "CRITICAL"
        elif is_warning:
            welfare_status = "WARNING"
        else:
            welfare_status = "OPTIMAL"

        return {
            "thi": round(thi, 1),
            "thi_category": thi_category,
            "enthalpy_kj_kg": round(enthalpy, 2),
            "weight_loss_g": round(self.cumulative_weight_loss_g, 3),
            "weight_loss_pct": round(weight_loss_pct, 2),
            "welfare_status": welfare_status
        }

"""
Moisture & Relative Humidity Physics Module
Sesuai spesifikasi physics_and_algorithms_spec.md §7
Menghitung kelembaban relatif kargo (%RH) dari respirasi air DOC, udara luar, dan kondensasi koil pendingin.
"""

import math
from typing import Dict, Any

class MoistureEngine:
    def __init__(self, truck_template: Dict[str, Any], cargo_quantity: int = 36000):
        self.capacity_doc = truck_template.get("capacity_doc", 36000)
        self.actual_doc = min(cargo_quantity, self.capacity_doc)
        self.thermal_mode = truck_template.get("thermal_mode", "HVAC")
        self.current_rh = 65.0 # Nilai awal %RH

    def step(
        self,
        dt_seconds: float,
        ambient_rh_pct: float,
        cargo_temp_c: float,
        active_cooling_kw: float,
        door_open: bool = False
    ) -> float:
        """
        Kalkulasi Relative Humidity (%RH) dalam 1 tick
        """
        # Uap air respirasi DOC menaikkan kelembaban
        moisture_input_gain = (self.actual_doc / 36000.0) * 0.05 # Laju kenaikan per detik
        
        if self.thermal_mode == "HVAC" and active_cooling_kw > 1.0:
            # Koil chiller mengembunkan uap air (dehumidifikasi alami)
            rh_target = 62.0 + (ambient_rh_pct - 60.0) * 0.1
        else:
            # Non-AC blower: kelembaban mengikuti ambien ditambah respirasi kargo
            rh_target = ambient_rh_pct * 0.75 + 18.0

        if door_open:
            rh_target = ambient_rh_pct

        tau_rh = 400.0 # Konstanta waktu uap air
        decay = math.exp(-dt_seconds / tau_rh)
        self.current_rh = rh_target + (self.current_rh - rh_target) * decay + (moisture_input_gain * dt_seconds)
        
        # Batasi rentang fisik
        self.current_rh = max(35.0, min(95.0, self.current_rh))
        return round(self.current_rh, 1)

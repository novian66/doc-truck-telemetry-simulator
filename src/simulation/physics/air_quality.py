"""
Air Quality & CO2 Mass Balance Physics Module
Sesuai spesifikasi physics_and_algorithms_spec.md §8
Menghitung dinamika konsentrasi gas CO2 (ppm) dari respirasi bibit dan pengenceran ventilasi udara segar.
"""

import math
from typing import Dict, Any

class AirQualityEngine:
    def __init__(self, truck_template: Dict[str, Any], cargo_quantity: int = 36000):
        self.capacity_doc = truck_template.get("capacity_doc", 36000)
        self.actual_doc = min(cargo_quantity, self.capacity_doc)
        
        # Volume udara bebas dalam kargo (m³)
        v_box = self.capacity_doc * 6.6e-4
        self.air_volume_m3 = 0.6 * v_box
        
        # Laju respirasi CO2 per ekor: 1.76 x 10^-5 m³/jam (≈ 17.6 mL/jam)
        self.co2_rate_per_doc_m3h = 1.76e-5
        self.total_co2_emission_m3h = self.actual_doc * self.co2_rate_per_doc_m3h
        
        self.ambient_co2_ppm = 420.0
        self.current_co2_ppm = 1050.0 # Nilai awal normal terkendali

    def step(self, dt_seconds: float, fresh_air_flow_m3h: float) -> int:
        """
        Kalkulasi neraca massa konsentrasi CO2 dalam 1 tick
        """
        if fresh_air_flow_m3h <= 10.0:
            # Ventilasi mati total (ventStop): akumulasi murni
            co2_increase_ppm_per_sec = (self.total_co2_emission_m3h * 1e6) / (self.air_volume_m3 * 3600.0)
            self.current_co2_ppm += co2_increase_ppm_per_sec * dt_seconds
            # Cap realistis maksimum sesak napas kargo 8.000 ppm
            self.current_co2_ppm = min(8000.0, self.current_co2_ppm)
        else:
            # Solusi eksak eksponensial menuju ekuilibrium
            co2_eq = self.ambient_co2_ppm + (self.total_co2_emission_m3h * 1e6) / fresh_air_flow_m3h
            tau_sec = (self.air_volume_m3 / (fresh_air_flow_m3h / 3600.0))
            
            decay = math.exp(-dt_seconds / tau_sec)
            self.current_co2_ppm = co2_eq + (self.current_co2_ppm - co2_eq) * decay

        return int(round(self.current_co2_ppm))

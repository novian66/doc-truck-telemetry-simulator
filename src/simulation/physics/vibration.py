"""
Chassis Stochastic Vibration Physics Module
Sesuai spesifikasi physics_and_algorithms_spec.md §5 (ISO 8608 / Nanni 2008)
Filter rekursif getaran sasis vertikal truk berdasarkan kelas kekasaran jalan dan kecepatan.
"""

import math
import random
from typing import Dict, Any

ROAD_SIGMA = {
    "FREE_FLOW": 0.08,        # Jalan tol aspal mulus (ISO 8608 Class A/B)
    "CONGESTED": 0.12,        # Arteri stop-and-go
    "GRIDLOCK": 0.02,         # Truk diam
    "DAMAGED_ROAD": 0.55,     # Jalan rusak, berlubang, sambungan jembatan (Class C/D)
    "FLOODED": 0.06,          # Genangan air
    "DISASTER_BLOCKED": 0.01
}

class VibrationEngine:
    def __init__(self, random_seed: int = 20261030):
        self.rng = random.Random(random_seed)
        self.a_z = 0.08 # Nilai awal getaran (g)
        self.a_idle = 0.04 # Getaran idle mesin
        self.beta = 0.25   # Faktor kelembaman filter rekursif
        self.v_nom = 60.0  # Kecepatan nominal acuan (km/h)

    def step(self, dt_seconds: float, speed_kmh: float, road_condition: str) -> float:
        """
        Menghitung akselerasi getaran vertikal RMS a_z (g-force)
        """
        sigma = ROAD_SIGMA.get(road_condition, 0.08)

        if speed_kmh < 1.0:
            # Truk berhenti: getaran murni dari getaran mesin genset / idle
            target_vib = self.a_idle + abs(self.rng.gauss(0, 0.01))
        else:
            speed_factor = (speed_kmh / self.v_nom) ** 0.6
            noise = abs(self.rng.gauss(0, 1.0))
            raw_vib = sigma * noise * speed_factor
            target_vib = max(self.a_idle, raw_vib)

        # Autoregressive Filter: a_z(t) = (1-β) a_z(t-1) + β target_vib
        self.a_z = (1.0 - self.beta) * self.a_z + self.beta * target_vib
        return round(self.a_z, 3)

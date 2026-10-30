"""
Ambient Environment Physics Module
Sesuai spesifikasi physics_and_algorithms_spec.md §3
Menghitung profil diurnal kontinu T_amb, RH_amb, I_solar, dan pengaruh cuaca.
"""

import math
from typing import Dict, Any

class EnvironmentEngine:
    def __init__(self, departure_time_str: str = "08:00", weather: str = "SUNNY"):
        """
        departure_time_str: "HH:MM" waktu lokal (WIB)
        weather: "SUNNY" | "LIGHT_RAIN" | "HEAVY_STORM"
        """
        parts = departure_time_str.split(":")
        self.dep_hour = float(parts[0]) if len(parts) > 0 else 8.0
        self.dep_min = float(parts[1]) if len(parts) > 1 else 0.0
        self.departure_seconds = self.dep_hour * 3600.0 + self.dep_min * 60.0
        self.weather = weather

    def get_ambient_state(self, elapsed_seconds: float) -> Dict[str, Any]:
        """
        Menghitung kondisi lingkungan pada jam lokal saat ini (t_clock)
        """
        total_seconds = (self.departure_seconds + elapsed_seconds) % 86400.0
        clock_hours = total_seconds / 3600.0

        # Model sinusoidal diurnal suhu ambien tropis Jawa Barat:
        # Minimum ~24.5 °C pada 05:00 subuh, Maksimum ~34.0 °C pada 13:00 siang
        t_base = 29.25 # Nilai tengah
        t_amp = 4.75   # Amplitudo (29.25 ± 4.75 -> 24.5 s/d 34.0)
        # Puncak pada jam 13.00: cos((13 - 13)*pi/12) = 1
        t_amb = t_base + t_amp * math.cos((clock_hours - 13.0) * math.pi / 12.0)

        # Model radiasi matahari I_solar (W/m²):
        # Terbit 06:00, Terbenam 18:00, Puncak jam 12:00 siang (±900 W/m²)
        if 6.0 <= clock_hours <= 18.0:
            i_solar = 900.0 * math.sin((clock_hours - 6.0) * math.pi / 12.0)
        else:
            i_solar = 0.0

        # Model kelembaban ambien RH_amb (%):
        # Berbanding terbalik dengan suhu: ~85% pada subuh, ~58% pada siang terik
        rh_amb = 85.0 - (t_amb - 24.5) * 2.84
        rh_amb = min(max(rh_amb, 45.0), 95.0)

        # Efek Cuaca (Weather Modifiers)
        if self.weather == "LIGHT_RAIN":
            t_amb -= 3.0
            i_solar *= 0.35
            rh_amb = min(98.0, rh_amb + 15.0)
        elif self.weather == "HEAVY_STORM":
            t_amb -= 5.5
            i_solar *= 0.10
            rh_amb = 98.0

        co2_amb = 420.0 # ppm standar atmosfer

        return {
            "clock_hours": clock_hours,
            "temp_c": round(t_amb, 2),
            "rh_pct": round(rh_amb, 1),
            "solar_w_m2": round(i_solar, 1),
            "co2_ppm": co2_amb
        }

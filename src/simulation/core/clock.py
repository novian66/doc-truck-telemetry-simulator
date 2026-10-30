"""
Simulation Clock & Time Scaler Module
Sesuai spesifikasi physics_and_algorithms_spec.md §1.1
Mengelola laju jam dinding (speed multiplier), waktu tempuh elapsed, dan sequence counter monotonik.
"""

from datetime import datetime, timezone, timedelta
from typing import Optional

class SimulationClock:
    def __init__(self, departure_time_str: str = "08:00", speed_multiplier: float = 1.0, departure_date_str: Optional[str] = None):
        self.speed_multiplier = speed_multiplier
        self.dt_simulation_seconds = 1.0 # Langkah integrasi fisika TETAP 1.0 detik
        self.elapsed_simulation_seconds = 0.0
        self.sequence_number = 1
        
        parts = departure_time_str.split(":")
        h = int(parts[0]) if len(parts) > 0 else 8
        m = int(parts[1]) if len(parts) > 1 else 0

        if departure_date_str and "-" in departure_date_str:
            try:
                dparts = departure_date_str.split("-")
                year, month, day = int(dparts[0]), int(dparts[1]), int(dparts[2])
            except Exception:
                now = datetime.now(timezone.utc)
                year, month, day = now.year, now.month, now.day
        else:
            now = datetime.now(timezone.utc)
            year, month, day = now.year, now.month, now.day

        self.base_departure_utc = datetime(year, month, day, h, m, 0, tzinfo=timezone.utc)

    def set_speed_multiplier(self, multiplier: float):
        """Opsi multiplier: 1.0, 2.0, 5.0, 10.0, 20.0"""
        self.speed_multiplier = max(1.0, min(50.0, multiplier))

    def get_tick_interval_ms(self) -> int:
        """Interval jeda jam dinding dalam milidetik"""
        return int(1000.0 / self.speed_multiplier)

    def tick(self) -> int:
        """Memajukan waktu simulasi 1 langkah"""
        self.elapsed_simulation_seconds += self.dt_simulation_seconds
        seq = self.sequence_number
        self.sequence_number += 1
        return seq

    def get_current_iso_timestamp(self) -> str:
        current_time = self.base_departure_utc + timedelta(seconds=self.elapsed_simulation_seconds)
        return current_time.strftime("%Y-%m-%dT%H:%M:%SZ")

    def reset(self):
        self.elapsed_simulation_seconds = 0.0
        self.sequence_number = 1

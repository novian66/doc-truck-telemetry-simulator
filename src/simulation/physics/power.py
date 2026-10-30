"""
Power, Battery & Fuel Subsystem Physics Module
Sesuai spesifikasi physics_and_algorithms_spec.md §9
Menghitung konsumsi BBM genset, tegangan baterai/aki, dan interlock daya.
"""

from typing import Dict, Any

class PowerEngine:
    def __init__(self, truck_template: Dict[str, Any]):
        self.power_source = truck_template.get("power_source", "AUX_GENSET")
        self.nominal_voltage = float(truck_template.get("nominal_voltage_v", 12))
        self.fuel_tank_capacity_l = float(truck_template.get("fuel_tank_l", 65.0))
        
        self.fuel_remaining_liters = self.fuel_tank_capacity_l
        self.fuel_remaining_pct = 100.0
        self.battery_voltage = self.nominal_voltage + 0.5 # Tegangan float sehat (12.5V / 24.5V)

    def step(
        self,
        dt_seconds: float,
        cooling_kw: float,
        fan_ratio: float,
        fuel_empty_fault: bool = False,
        low_battery_fault: bool = False
    ) -> Dict[str, Any]:
        """
        Kalkulasi konsumsi daya dalam 1 tick
        """
        if fuel_empty_fault:
            self.fuel_remaining_liters = 0.0
            self.fuel_remaining_pct = 0.0
        else:
            # Laju konsumsi BBM (SFC ~ 0.30 L/kWh)
            base_kw = 1.0 # Genset idling / fan
            total_electrical_load_kw = base_kw + cooling_kw + (fan_ratio * 1.5)
            liter_per_second = (total_electrical_load_kw * 0.30) / 3600.0
            self.fuel_remaining_liters = max(0.0, self.fuel_remaining_liters - (liter_per_second * dt_seconds))
            self.fuel_remaining_pct = (self.fuel_remaining_liters / self.fuel_tank_capacity_l) * 100.0

        if low_battery_fault:
            self.battery_voltage = self.nominal_voltage * 0.88 # 10.5V pada aki 12V
        else:
            # Fluktuasi tegangan normal alternator
            self.battery_voltage = self.nominal_voltage + (0.4 if fan_ratio > 0.5 else 0.6)

        return {
            "power_status": self.power_source,
            "fuel_remaining_pct": round(self.fuel_remaining_pct, 1),
            "battery_voltage_v": round(self.battery_voltage, 1),
            "is_power_available": (self.fuel_remaining_pct > 0.0)
        }

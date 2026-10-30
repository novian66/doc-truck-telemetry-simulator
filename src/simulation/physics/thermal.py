"""
Thermal Dynamics Physics Module
Sesuai spesifikasi physics_and_algorithms_spec.md §6
Mendukung mode HVAC (Neraca Kalor Lumped-Parameter ODE) dan mode Regresi Non-AC Audy Joinaldy 2020.
Menghitung distribusi suhu 3 posisi (Z1, Z2, Z3) dan suhu inti boks DOC (T_box_core).
"""

import math
from typing import Dict, Any

class ThermalEngine:
    def __init__(self, truck_template: Dict[str, Any], cargo_quantity: int = 36000, box_type: str = "PLASTIC_CRATE"):
        self.template = truck_template
        self.capacity_doc = truck_template.get("capacity_doc", 36000)
        self.actual_doc = min(cargo_quantity, self.capacity_doc)
        self.thermal_mode = truck_template.get("thermal_mode", "HVAC")
        self.cooling_capacity_kw = truck_template.get("cooling_capacity_kw", 0.0)
        self.airflow_direction = truck_template.get("airflow_direction", "front_to_rear")
        self.fresh_air_max_m3h = truck_template.get("fresh_air_max_m3h", 2800.0)
        self.setpoint_c = truck_template.get("temperature_setpoint_c", 25.0)

        # Geometri Kargo (Herget et al. 2025: 6.6 x 10^-4 m³ per ekor)
        v_box = self.capacity_doc * 6.6e-4
        l_box = v_box / (2.45 * 2.45)
        self.surface_area = 2.0 * (2.0 * 2.45 * l_box + 2.45 * 2.45)
        self.roof_area = 2.45 * l_box
        self.air_volume = 0.6 * v_box # 60% udara bebas

        # Parameter Termal
        self.u_wall = 0.40 # W/(m²·K) insulasi PU 75mm
        self.alpha_roof = 0.35 # Cat putih
        self.h_o = 25.0 # W/(m²·K)
        self.cp_air = 1005.0 # J/(kg·K)
        self.rho_air = 1.16 # kg/m³

        # Massa termal efektif C_eff
        chicks_per_box = 100
        n_boxes = math.ceil(self.actual_doc / chicks_per_box)
        m_box = 1.6 if box_type == "PLASTIC_CRATE" else 0.45
        c_box = 1900.0 if box_type == "PLASTIC_CRATE" else 1340.0
        self.g_box = 1.25 if box_type == "PLASTIC_CRATE" else 0.90 # Konduktansi boks ke udara (W/K)
        self.c_eff = (n_boxes * m_box * c_box) + (self.rho_air * self.air_volume * self.cp_air)

        # Status Awal
        self.t_container = self.setpoint_c
        self.t_box_core = self.setpoint_c + 7.0 # ±32 °C
        self.pi_integral = 0.0
        self.active_cooling_kw = 0.0
        self.fresh_air_m3h = self.fresh_air_max_m3h * 0.5 # 50% default damper
        self.fan_ratio = 1.0 # HIGH

    def step(
        self,
        dt_seconds: float,
        ambient_temp_c: float,
        solar_w_m2: float,
        speed_kmh: float,
        chiller_switch: bool = True,
        fan_speed: str = "HIGH",
        air_inlet_mode: str = "AUTO",
        door_open: bool = False,
        chiller_fail_fault: bool = False,
        vent_stop_fault: bool = False
    ) -> Dict[str, Any]:
        """
        Kalkulasi neraca kalor 1 tick
        """
        # Kecepatan kipas & debit udara segar
        if vent_stop_fault or fan_speed == "OFF":
            self.fan_ratio = 0.0
            self.fresh_air_m3h = 0.0
        elif fan_speed == "LOW":
            self.fan_ratio = 0.4
            self.fresh_air_m3h = self.fresh_air_max_m3h * 0.3
        elif fan_speed == "MED":
            self.fan_ratio = 0.7
            self.fresh_air_m3h = self.fresh_air_max_m3h * 0.6
        else: # HIGH
            self.fan_ratio = 1.0
            self.fresh_air_m3h = self.fresh_air_max_m3h

        # Infiltrasi pintu belakang terbuka
        m_dot_door = 0.8 if door_open else 0.0 # kg/s

        # -------------------------------------------------------------
        # MODE 1: Regresi Non-AC Audy Joinaldy 2020 (Model Blower Tropis)
        # -------------------------------------------------------------
        if self.thermal_mode == "REGRESSION":
            # Model empiris lapangan: Y = 1.2385*X - 6.2567
            t_eq = 1.2385 * ambient_temp_c - 6.2567
            if door_open:
                t_eq = max(t_eq, ambient_temp_c)
            
            # Waktu relaksasi termal bodi non-AC tau ~900 detik (15 menit)
            tau_reg = 900.0 if self.fan_ratio > 0.1 else 1800.0
            decay = math.exp(-dt_seconds / tau_reg)
            self.t_container = t_eq + (self.t_container - t_eq) * decay
            self.active_cooling_kw = 0.0

        # -------------------------------------------------------------
        # MODE 2: Termodinamika Kontrol HVAC (Lumped Parameter ODE)
        # -------------------------------------------------------------
        else:
            # 1. Kalor metabolik DOC sensibel
            # Panting bila suhu boks > 36°C
            is_panting = (self.t_box_core > 36.0)
            q_chick = 0.18 if is_panting else 0.135
            f_sensible = 0.40 if is_panting else 0.65
            q_chick_sensible = self.actual_doc * q_chick * f_sensible # Watt

            # 2. Kalor konduksi dinding & radiasi atap sol-air
            q_wall = self.u_wall * self.surface_area * (ambient_temp_c - self.t_container)
            q_solar = (self.alpha_roof * self.roof_area * solar_w_m2) * (self.u_wall / self.h_o)

            # 3. Ventilasi udara segar
            m_dot_fa = self.rho_air * (self.fresh_air_m3h / 3600.0) # kg/s
            q_vent = m_dot_fa * self.cp_air * (ambient_temp_c - self.t_container)

            # 4. Infiltrasi pintu terbuka
            q_door = m_dot_door * self.cp_air * (ambient_temp_c - self.t_container)

            # 5. Pendinginan HVAC (Kontroler PI)
            if (not chiller_switch) or chiller_fail_fault or self.cooling_capacity_kw <= 0.0:
                self.active_cooling_kw = 0.0
            else:
                err = self.t_container - self.setpoint_c
                kp = 0.5 # K^-1
                ti = 600.0 # detik
                self.pi_integral = max(0.0, min(10.0, self.pi_integral + (err * dt_seconds / ti)))
                cooling_req_ratio = max(0.0, kp * err + self.pi_integral)
                cooling_req_ratio = min(1.0, cooling_req_ratio)
                self.active_cooling_kw = self.cooling_capacity_kw * cooling_req_ratio

            q_cooling_w = self.active_cooling_kw * 1000.0 # Watt

            # Neraca Total: C_eff * dT/dt = ΣQ
            total_heat_rate_w = q_chick_sensible + q_wall + q_solar + q_vent + q_door - q_cooling_w
            dt_container = (total_heat_rate_w / self.c_eff) * dt_seconds

            # Batasi perubahan suhu per detik agar stabil
            dt_container = max(-0.1, min(0.1, dt_container))
            self.t_container += dt_container

        # -------------------------------------------------------------
        # SUHU INTI BOKS DOC (T_box_core) — Termonetral 32.0 - 35.0 °C
        # -------------------------------------------------------------
        # Panas DOC di dalam 1 boks (100 ekor)
        q_box_sensible = 100 * 0.135 * 0.65 # ~8.775 Watt
        t_box_target = self.t_container + (q_box_sensible / self.g_box) # ~ +7.0 °C
        tau_box = 600.0 # 10 menit
        self.t_box_core = t_box_target + (self.t_box_core - t_box_target) * math.exp(-dt_seconds / tau_box)

        # -------------------------------------------------------------
        # DISTRIBUSI SUHU 3 ZONA (Z1: Depan, Z2: Tengah, Z3: Belakang)
        # -------------------------------------------------------------
        if self.airflow_direction == "front_to_rear":
            # Udara dingin ditiup dari depan ke belakang
            z1 = self.t_container - 0.4
            z2 = self.t_container + 0.1
            z3 = self.t_container + 0.6
        elif self.airflow_direction == "top_to_bottom":
            # Distribusi vertikal atap (Heering) lebih seragam
            z1 = self.t_container - 0.2
            z2 = self.t_container
            z3 = self.t_container + 0.3
        else: # roof_to_rear (Audy Joinaldy)
            z1 = self.t_container - 0.3
            z2 = self.t_container + 0.2
            z3 = self.t_container + 0.5

        if door_open:
            # Pintu belakang terbuka -> Z3 terimbas suhu luar
            z3 = z3 * 0.4 + ambient_temp_c * 0.6

        return {
            "avg_temp_c": round(self.t_container, 2),
            "temp_zone_1_c": round(z1, 2),
            "temp_zone_2_c": round(z2, 2),
            "temp_zone_3_c": round(z3, 2),
            "temp_box_core_c": round(self.t_box_core, 2),
            "active_cooling_kw": round(self.active_cooling_kw, 2),
            "fresh_air_m3h": round(self.fresh_air_m3h, 1)
        }

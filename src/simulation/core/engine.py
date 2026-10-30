"""
Core Simulation Engine (16-Stage Deterministic Tick Orchestrator)
Sesuai spesifikasi physics_and_algorithms_spec.md §13 & database_and_storage_spec.md
Menghasilkan paket telemetri 25-field baku berstandar industri dan log ground-truth.
"""

from typing import Dict, Any, Optional, List
from src.routing.route_manager import RouteTrack
from src.simulation.physics.environment import EnvironmentEngine
from src.simulation.physics.kinematics import KinematicsEngine
from src.simulation.physics.vibration import VibrationEngine
from src.simulation.physics.thermal import ThermalEngine
from src.simulation.physics.air_quality import AirQualityEngine
from src.simulation.physics.moisture import MoistureEngine
from src.simulation.physics.power import PowerEngine
from src.simulation.pipeline.biometrics import BiometricsEngine
from src.simulation.pipeline.canonical_hasher import CanonicalHasher
from src.simulation.pipeline.payload_builder import (
    TelemetryPayload, IdentityBlock, VehicleBlock, MicroclimateBlock,
    BiometricsBlock, SystemsBlock, VentilationSystem, CoolingSystem,
    PowerSystem, SafetyBlock, SecurityBlock
)
from src.simulation.core.state import SimulationState
from src.simulation.core.clock import SimulationClock
from src.storage.jsonl_logger import JSONLLogger

class SimulationEngine:
    def __init__(
        self,
        trip_data: Dict[str, Any],
        truck_template: Dict[str, Any],
        route_coordinates: List[List[float]],
        random_seed: int = 20261030
    ):
        self.trip_id = trip_data["trip_id"]
        self.truck_id = trip_data["truck_id"]
        self.delivery_order = trip_data.get("delivery_order", "DO-001")
        self.driver_name = trip_data.get("driver_name", "Supir Logistik")
        self.departure_date_str = trip_data.get("departure_date", "2026-10-31")
        self.departure_time_str = trip_data.get("departure_time", "08:00")
        self.weather = trip_data.get("weather", "SUNNY")
        self.cargo_quantity = int(trip_data.get("cargo_quantity", 36000))
        self.average_weight_g = float(trip_data.get("average_weight_g", 42.0))
        self.strain = trip_data.get("cargo_strain", "Cobb 500")
        self.box_type = trip_data.get("box_type", "PLASTIC_CRATE")
        self.total_road_km = float(trip_data.get("total_distance_km", 145.0))
        self.route_type = trip_data.get("route_type", "TOLL_HIGHWAY")

        # Komponen Fisika & Jalur
        self.track = RouteTrack(route_coordinates, self.total_road_km)
        self.clock = SimulationClock(self.departure_time_str, speed_multiplier=1.0, departure_date_str=self.departure_date_str)
        self.env = EnvironmentEngine(self.departure_time_str, self.weather)
        self.kinematics = KinematicsEngine(self.track, route_type=self.route_type, random_seed=random_seed)
        self.vibration = VibrationEngine(random_seed)
        self.thermal = ThermalEngine(truck_template, self.cargo_quantity, self.box_type)
        self.air_quality = AirQualityEngine(truck_template, self.cargo_quantity)
        self.moisture = MoistureEngine(truck_template, self.cargo_quantity)
        self.power = PowerEngine(truck_template)
        self.biometrics = BiometricsEngine(self.average_weight_g)
        self.state = SimulationState(random_seed)
        self.hasher = CanonicalHasher()
        self.logger = JSONLLogger(self.trip_id)

        # Kondisi Kontrol Aktuator Awal
        self.actuator_chiller = True
        self.actuator_fan_speed = "HIGH"
        self.actuator_air_inlet = "OPEN" # atau AUTO
        self.road_conditions_map = {
            0: "FREE_FLOW", 1: "FREE_FLOW", 2: "CONGESTED", 3: "FREE_FLOW", 4: "FREE_FLOW"
        }

        self.is_running = False
        self.is_paused = False
        self.is_completed = False

    def configure_segments(self, segments_map: Dict[int, str]):
        """Mengatur kondisi jalan per segmen (0 s/d 4)"""
        self.road_conditions_map.update(segments_map)

    def set_actuators(self, fan_speed: Optional[str] = None, air_inlet: Optional[str] = None, chiller: Optional[bool] = None):
        if fan_speed is not None:
            self.actuator_fan_speed = fan_speed
        if air_inlet is not None:
            self.actuator_air_inlet = air_inlet
        if chiller is not None:
            self.actuator_chiller = chiller

    def inject_faults(self, faults_dict: Dict[str, Any]):
        self.state.apply_operational_faults(faults_dict)

    def tick(self) -> TelemetryPayload:
        """
        Mengeksekusi 1 Langkah Waktu Tetap (Δt = 1.0 detik waktu-simulasi).
        Mengikuti 16 tahapan di physics_and_algorithms_spec.md §13.
        """
        dt = self.clock.dt_simulation_seconds
        seq = self.clock.tick()
        timestamp_iso = self.clock.get_current_iso_timestamp()

        # 1. Lingkungan Diurnal
        amb = self.env.get_ambient_state(self.clock.elapsed_simulation_seconds)

        # 2. Kinematika Posisi & Kecepatan
        # Ambil kondisi jalan segmen saat ini
        pos_peek = self.track.get_position_at_distance(self.kinematics.distance_traveled_km)
        current_seg = pos_peek.get("segment_idx", 0)
        seg_road_cond = self.road_conditions_map.get(current_seg, "FREE_FLOW")

        pos = self.kinematics.step(
            dt_seconds=dt,
            road_condition=seg_road_cond,
            traffic_stop_fault=self.state.fault_traffic_stop,
            route_type=self.route_type
        )
        if pos["is_completed"]:
            self.is_completed = True

        # 3. Getaran Sasis
        vib = self.vibration.step(dt, pos["speed_kmh"], seg_road_cond)

        # 4. Termal & Kargo
        thermal_res = self.thermal.step(
            dt_seconds=dt,
            ambient_temp_c=amb["temp_c"],
            solar_w_m2=amb["solar_w_m2"],
            speed_kmh=pos["speed_kmh"],
            chiller_switch=self.actuator_chiller,
            fan_speed=self.actuator_fan_speed,
            air_inlet_mode=self.actuator_air_inlet,
            door_open=self.state.fault_door_open,
            chiller_fail_fault=self.state.fault_chiller_fail,
            vent_stop_fault=self.state.fault_vent_stop
        )

        # 5. Kelembaban & Kualitas Udara (CO2)
        co2_val = self.air_quality.step(dt, thermal_res["fresh_air_m3h"])
        rh_val = self.moisture.step(
            dt_seconds=dt,
            ambient_rh_pct=amb["rh_pct"],
            cargo_temp_c=thermal_res["avg_temp_c"],
            active_cooling_kw=thermal_res["active_cooling_kw"],
            door_open=self.state.fault_door_open
        )

        # 6. Sistem Daya (BBM & Baterai)
        pwr = self.power.step(
            dt_seconds=dt,
            cooling_kw=thermal_res["active_cooling_kw"],
            fan_ratio=self.thermal.fan_ratio,
            fuel_empty_fault=self.state.fault_fuel_empty,
            low_battery_fault=self.state.fault_low_battery
        )

        # 7. Biometrik & Kesejahteraan DOC (Ground Truth)
        bio = self.biometrics.step(
            dt_seconds=dt,
            cargo_temp_c=thermal_res["avg_temp_c"],
            rh_pct=rh_val,
            box_core_temp_c=thermal_res["temp_box_core_c"],
            co2_ppm=co2_val,
            vibration_g=vib,
            speed_kmh=pos["speed_kmh"]
        )

        # Simpan Ground Truth Murni (Tanpa Derau Sensor)
        gt_record = {
            "sequence_number": seq,
            "timestamp": timestamp_iso,
            "distance_km": pos["distance_km"],
            "speed_kmh": pos["speed_kmh"],
            "curve_radius_m": pos.get("curve_radius_m", 5000.0),
            "lateral_accel_g": pos.get("lateral_accel_g", 0.0),
            "true_temp_z1": thermal_res["temp_zone_1_c"],
            "true_temp_z2": thermal_res["temp_zone_2_c"],
            "true_temp_z3": thermal_res["temp_zone_3_c"],
            "true_box_core": thermal_res["temp_box_core_c"],
            "true_rh": rh_val,
            "true_co2": co2_val,
            "welfare_status": bio["welfare_status"],
            "thi": bio["thi"],
            "weight_loss_g": bio["weight_loss_g"],
            "weight_loss_pct": bio["weight_loss_pct"]
        }
        self.logger.log_ground_truth(gt_record)

        # 8. Sensor Emulation (Derau Gaussian + Fault Injection)
        true_for_sensors = {
            "temp_zone_1_c": thermal_res["temp_zone_1_c"],
            "temp_zone_2_c": thermal_res["temp_zone_2_c"],
            "temp_zone_3_c": thermal_res["temp_zone_3_c"],
            "temp_box_core_c": thermal_res["temp_box_core_c"],
            "humidity_pct": rh_val,
            "co2_ppm": co2_val,
            "fuel_level_pct": pwr["fuel_remaining_pct"],
            "battery_voltage_v": pwr["battery_voltage_v"]
        }
        rep = self.state.process_reported_sensors(dt, true_for_sensors)

        # 9. Rakit 25-Field Telemetry Payload Baku
        total_biomass = round((self.cargo_quantity * self.average_weight_g) / 1000.0, 1)

        # Tentukan status HVAC
        if thermal_res["active_cooling_kw"] > 0.1:
            hvac_st = "COOLING"
        elif self.actuator_chiller and not self.state.fault_chiller_fail:
            hvac_st = "STANDBY"
        else:
            hvac_st = "OFF"

        # Tentukan posisi fisik damper dari debit udara segar
        damper_pos = "OPEN" if thermal_res["fresh_air_m3h"] > (self.thermal.fresh_air_max_m3h * 0.75) else ("PARTIAL" if thermal_res["fresh_air_m3h"] > 100 else "CLOSED")

        # Bentuk payload parsial untuk hashing
        raw_dict = {
            "identity": {
                "truck_id": self.truck_id,
                "trip_id": self.trip_id,
                "delivery_order": self.delivery_order,
                "driver_name": self.driver_name,
                "sequence_number": seq,
                "timestamp": timestamp_iso
            },
            "vehicle": {
                "latitude": pos["lat"],
                "longitude": pos["lng"],
                "speed_kmh": pos["speed_kmh"],
                "heading_deg": pos["bearing"],
                "altitude_m": 120.0,
                "vibration_rms_g": vib,
                "distance_traveled_km": pos["distance_km"],
                "total_distance_km": self.total_road_km
            },
            "microclimate": {
                "temp_zone_1_c": rep["reported_temp_z1"],
                "temp_zone_2_c": rep["reported_temp_z2"],
                "temp_box_core_c": rep["reported_temp_core"],
                "temp_zone_3_c": rep["reported_temp_z3"],
                "humidity_pct": rep["reported_rh"] if rep["reported_rh"] is not None else 65.0,
                "co2_ppm": rep["reported_co2"],
                "ambient_temp_c": amb["temp_c"],
                "ambient_humidity_pct": amb["rh_pct"],
                "solar_irradiance_wm2": amb["solar_w_m2"]
            },
            "biometrics": {
                "strain": self.strain,
                "chick_quantity": self.cargo_quantity,
                "average_weight_g": self.average_weight_g,
                "total_biomass_kg": total_biomass,
                "thi_index": bio["thi"],
                "eci_enthalpy_kj_kg": bio["enthalpy_kj_kg"],
                "estimated_weight_loss_pct": bio["weight_loss_pct"]
            },
            "systems": {
                "ventilation": {
                    "fan_status": self.actuator_fan_speed,
                    "air_inlet_status": damper_pos,
                    "roof_exhaust_active": (self.actuator_fan_speed != "OFF")
                },
                "cooling": {
                    "hvac_status": hvac_st,
                    "temperature_setpoint_c": self.thermal.setpoint_c
                },
                "power": {
                    "power_status": pwr["power_status"],
                    "fuel_level_pct": pwr["fuel_remaining_pct"],
                    "battery_voltage_v": pwr["battery_voltage_v"]
                }
            },
            "safety": {
                "rear_door_open": self.state.fault_door_open,
                "door_open_duration_s": rep["door_open_seconds"],
                "alarm_code": rep["alarm_code"],
                "sensor_status": rep["sensor_status"],
                "network_connection": rep["network_connection"]
            }
        }

        # 10. Hitung Canonical SHA-256 Hash
        payload_hash = self.hasher.compute_hash(raw_dict)

        raw_dict["security"] = {
            "payload_hash_sha256": payload_hash,
            "previous_hash_sha256": self.hasher.prev_hash
        }

        # 11. Simpan ke .jsonl (Setiap 10 detik atau saat tick 1, atau saat ada alarm)
        if seq % 10 == 0 or seq == 1 or rep["alarm_code"] != "ALARM_NONE":
            self.logger.log_telemetry(raw_dict)

        # 12. Validasi Pydantic TelemetryPayload
        return TelemetryPayload(**raw_dict)

"""
Simulation State & Fault Injection Manager
Sesuai spesifikasi physics_and_algorithms_spec.md §1.2 & §11
Memisahkan ground truth (kondisi fisik nyata) dari reported value (nilai sensor + derau + gangguan).
"""

import random
from typing import Dict, Any, Optional

class SimulationState:
    def __init__(self, random_seed: int = 20261030):
        self.rng = random.Random(random_seed)

        # Saklar Gangguan Operasional (Mempengaruhi Fisika)
        self.fault_chiller_fail = False
        self.fault_door_open = False
        self.fault_vent_stop = False
        self.fault_traffic_stop = False
        self.fault_fuel_empty = False
        self.fault_low_battery = False
        self.fault_blank_spot = False

        # Saklar Gangguan Sensor (Hanya Mengubah Nilai Terlapor)
        self.fault_sensor_drift = False
        self.fault_sensor_freeze = False
        self.fault_sensor_spike = False
        self.fault_sensor_null = False
        self.fault_seq_gap = False

        # State memori internal sensor fault
        self.drift_offset_c = 0.0
        self.frozen_co2_value: Optional[int] = None
        self.seq_gap_applied = False
        self.door_open_seconds = 0

    def apply_operational_faults(self, faults_dict: Dict[str, Any]):
        """Mengaktifkan/menonaktifkan fault operasional"""
        self.fault_chiller_fail = faults_dict.get("chillerFail", self.fault_chiller_fail)
        self.fault_door_open = faults_dict.get("doorOpen", self.fault_door_open)
        self.fault_vent_stop = faults_dict.get("ventFail", self.fault_vent_stop)
        self.fault_traffic_stop = faults_dict.get("trafficStop", self.fault_traffic_stop)
        self.fault_fuel_empty = faults_dict.get("fuelEmpty", self.fault_fuel_empty)
        self.fault_low_battery = faults_dict.get("lowBattery", self.fault_low_battery)
        self.fault_blank_spot = faults_dict.get("blankSpot", self.fault_blank_spot)

        self.fault_sensor_drift = faults_dict.get("sensorDrift", self.fault_sensor_drift)
        self.fault_sensor_freeze = faults_dict.get("sensorFreeze", self.fault_sensor_freeze)
        self.fault_sensor_spike = faults_dict.get("sensorSpike", self.fault_sensor_spike)
        self.fault_sensor_null = faults_dict.get("sensorNull", self.fault_sensor_null)
        self.fault_seq_gap = faults_dict.get("seqGap", self.fault_seq_gap)

    def process_reported_sensors(self, dt: float, true_values: Dict[str, Any], signal_condition: str = "GOOD") -> Dict[str, Any]:
        """
        Menghasilkan nilai sensor terlapor: ground truth + derau Gaussian + fault
        Serta evaluasi status koneksi jaringan berdasarkan signal_condition & blankSpot fault
        """
        if self.fault_door_open:
            self.door_open_seconds += int(dt)
        else:
            self.door_open_seconds = 0

        # Derau Gaussian instrumentasi normal
        noise_t1 = self.rng.gauss(0, 0.05)
        noise_t2 = self.rng.gauss(0, 0.05)
        noise_t3 = self.rng.gauss(0, 0.05)
        noise_rh = self.rng.gauss(0, 0.2)
        noise_co2 = int(self.rng.gauss(0, 5))

        rep_t1 = round(true_values["temp_zone_1_c"] + noise_t1, 2)
        rep_t2 = round(true_values["temp_zone_2_c"] + noise_t2, 2)
        rep_t3 = round(true_values["temp_zone_3_c"] + noise_t3, 2)
        rep_core = round(true_values["temp_box_core_c"] + noise_t2, 2)
        rep_rh = round(true_values["humidity_pct"] + noise_rh, 1)
        rep_co2 = int(true_values["co2_ppm"] + noise_co2)

        # Evaluasi Prioritas Sensor Status
        sensor_status = "HEALTHY"

        # 1. Sensor Drift (+0.2 °C / menit = +0.00333 °C / detik pada Zone 2)
        if self.fault_sensor_drift:
            self.drift_offset_c += (0.2 / 60.0) * dt
            rep_t2 = round(rep_t2 + self.drift_offset_c, 2)
            sensor_status = "DRIFT"
        else:
            self.drift_offset_c = 0.0

        # 2. Sensor Freeze (Stuck-at konstan pada CO2)
        if self.fault_sensor_freeze:
            if self.frozen_co2_value is None:
                self.frozen_co2_value = rep_co2
            rep_co2 = self.frozen_co2_value
            sensor_status = "FROZEN"
        else:
            self.frozen_co2_value = None

        # 3. Sensor Outlier Spike (+50 °C dengan peluang 12.5% per tick pada Zone 2)
        if self.fault_sensor_spike:
            if self.rng.random() < 0.125:
                rep_t2 = round(rep_t2 + 50.0, 2)
            sensor_status = "OUTLIER_SPIKE"

        # 4. Sensor Null Packet (Semua sensor kargo bernilai null)
        if self.fault_sensor_null:
            rep_t1 = None
            rep_t2 = None
            rep_t3 = None
            rep_core = None
            rep_rh = None
            rep_co2 = None
            sensor_status = "NULL_PACKET"

        # Evaluasi Alarm Perangkat Edge (Berdasarkan Nilai Terlapor)
        alarm_code = "ALARM_NONE"
        if self.fault_chiller_fail and (rep_t2 is not None and rep_t2 > 27.0):
            alarm_code = "ALARM_CHILLER_FAIL"
        elif self.fault_vent_stop:
            alarm_code = "ALARM_VENT_STOP"
        elif rep_co2 is not None and rep_co2 > 2500:
            alarm_code = "ALARM_CO2_CRITICAL"
        elif rep_t2 is not None and rep_t2 > 29.5:
            alarm_code = "ALARM_TEMP_VIOLATION"
        elif self.door_open_seconds > 300:
            alarm_code = "ALARM_DOOR_BREACH"
        elif true_values.get("fuel_level_pct", 100.0) < 15.0:
            alarm_code = "ALARM_LOW_FUEL"
        elif true_values.get("battery_voltage_v", 12.0) < 11.5:
            alarm_code = "ALARM_LOW_BATTERY"
        elif sensor_status != "HEALTHY":
            alarm_code = "ALARM_SENSOR_FAULT"

        # Evaluasi Koneksi Jaringan & Blank Spot (Model Gilbert-Elliott §10)
        if self.fault_blank_spot:
            net_conn = "OFFLINE_LOCAL_BUFFER"
        elif signal_condition == "BAD":
            net_conn = "OFFLINE_LOCAL_BUFFER"
        elif signal_condition == "FADING":
            net_conn = "OFFLINE_LOCAL_BUFFER" if self.rng.random() < 0.33 else "ONLINE_4G_LTE"
        else:
            net_conn = "ONLINE_4G_LTE"

        return {
            "reported_temp_z1": rep_t1,
            "reported_temp_z2": rep_t2,
            "reported_temp_z3": rep_t3,
            "reported_temp_core": rep_core,
            "reported_rh": rep_rh,
            "reported_co2": rep_co2,
            "sensor_status": sensor_status,
            "alarm_code": alarm_code,
            "door_open_seconds": self.door_open_seconds,
            "network_connection": net_conn
        }

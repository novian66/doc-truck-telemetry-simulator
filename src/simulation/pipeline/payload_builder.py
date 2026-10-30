"""
Pydantic Telemetry Payload Models & Builder
Sesuai skema baku telemetry_data_schema.json (Draft 2020-12)
Mendefinisikan 7 blok data standar dan serialisasi payload kanonikal.
"""

from typing import Optional, Literal
from pydantic import BaseModel, Field

class IdentityBlock(BaseModel):
    truck_id: str
    trip_id: str
    delivery_order: str
    driver_name: str
    sequence_number: int = Field(ge=1)
    timestamp: str

class VehicleBlock(BaseModel):
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    speed_kmh: float = Field(ge=0.0, le=140.0)
    heading_deg: float = Field(ge=0.0, le=360.0)
    altitude_m: float = 120.0
    vibration_rms_g: float = Field(ge=0.0, le=5.0)
    distance_traveled_km: float = Field(ge=0.0)
    total_distance_km: float = Field(ge=0.1)

class MicroclimateBlock(BaseModel):
    temp_zone_1_c: Optional[float] = None
    temp_zone_2_c: Optional[float] = None
    temp_box_core_c: Optional[float] = None
    temp_zone_3_c: Optional[float] = None
    humidity_pct: float = Field(ge=0.0, le=100.0)
    co2_ppm: Optional[int] = None
    ambient_temp_c: float
    ambient_humidity_pct: float = Field(ge=0.0, le=100.0)
    solar_irradiance_wm2: float = Field(ge=0.0, le=1500.0)

class BiometricsBlock(BaseModel):
    strain: str = "Cobb 500"
    chick_quantity: int = Field(ge=1)
    average_weight_g: float = Field(ge=20.0, le=70.0)
    total_biomass_kg: float = Field(ge=0.0)
    thi_index: float
    eci_enthalpy_kj_kg: float
    estimated_weight_loss_pct: float = Field(ge=0.0, le=20.0)

class VentilationSystem(BaseModel):
    fan_status: Literal["OFF", "LOW", "MED", "HIGH"]
    air_inlet_status: Literal["CLOSED", "PARTIAL", "OPEN"]
    roof_exhaust_active: bool

class CoolingSystem(BaseModel):
    hvac_status: Literal["OFF", "STANDBY", "COOLING", "HEATING"]
    temperature_setpoint_c: float

class PowerSystem(BaseModel):
    power_status: Literal["BATTERY", "ENGINE", "AUX_GENSET"]
    fuel_level_pct: float = Field(ge=0.0, le=100.0)
    battery_voltage_v: float = Field(ge=0.0, le=32.0)

class SystemsBlock(BaseModel):
    ventilation: VentilationSystem
    cooling: CoolingSystem
    power: PowerSystem

class SafetyBlock(BaseModel):
    rear_door_open: bool
    door_open_duration_s: int = Field(ge=0)
    alarm_code: Literal[
        "ALARM_NONE",
        "ALARM_CHILLER_FAIL",
        "ALARM_VENT_STOP",
        "ALARM_CO2_CRITICAL",
        "ALARM_TEMP_VIOLATION",
        "ALARM_DOOR_BREACH",
        "ALARM_LOW_FUEL",
        "ALARM_LOW_BATTERY",
        "ALARM_SENSOR_FAULT"
    ]
    sensor_status: Literal[
        "HEALTHY",
        "DRIFT",
        "FROZEN",
        "OUTLIER_SPIKE",
        "NULL_PACKET"
    ]
    network_connection: Literal[
        "ONLINE_4G_LTE",
        "OFFLINE_LOCAL_BUFFER"
    ]

class SecurityBlock(BaseModel):
    payload_hash_sha256: str
    previous_hash_sha256: str

class TelemetryPayload(BaseModel):
    identity: IdentityBlock
    vehicle: VehicleBlock
    microclimate: MicroclimateBlock
    biometrics: BiometricsBlock
    systems: SystemsBlock
    safety: SafetyBlock
    security: SecurityBlock

"""
Simulation Control & Lifecycle REST API Routes
Sesuai spesifikasi api_and_websocket_spec.md §2
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from src.simulation.core.manager import simulation_manager

router = APIRouter(prefix="/api/v1/simulation", tags=["Simulation Lifecycle & Controls"])

class StartRequest(BaseModel):
    trip_id: str
    truck_id: Optional[str] = None
    delivery_order: Optional[str] = None
    driver_name: Optional[str] = None
    route_type: Optional[str] = "TOLL"
    cargo_strain: Optional[str] = "Cobb 500"
    cargo_quantity: Optional[int] = 36000
    average_weight_g: Optional[float] = 42.0
    box_type: Optional[str] = "PLASTIC_CRATE"
    departure_date: Optional[str] = None
    departure_time: Optional[str] = "08:00"
    weather: Optional[str] = "SUNNY"
    speed_multiplier: Optional[float] = 1.0

class PauseRequest(BaseModel):
    trip_id: str

class ResetRequest(BaseModel):
    trip_id: str

class SpeedRequest(BaseModel):
    trip_id: str
    multiplier: float = Field(default=1.0, ge=1.0, le=50.0)

class ActuatorRequest(BaseModel):
    trip_id: str
    fan_speed: Optional[str] = None # "OFF" | "LOW" | "MED" | "HIGH"
    air_inlet: Optional[str] = None # "AUTO" | "CLOSED" | "PARTIAL" | "OPEN"
    chiller_power: Optional[bool] = None

class FaultRequest(BaseModel):
    trip_id: str
    anomaly_type: str # "CHILLER_FAIL", "DOOR_OPEN", "VENT_STOP", "TRAFFIC_JAM", "FUEL_EMPTY", "LOW_BATTERY", "BLANK_SPOT", "SENSOR_DRIFT", "SENSOR_FREEZE", "SENSOR_SPIKE", "SENSOR_NULL"
    active: bool = True

class ConfigureRequest(BaseModel):
    trip_id: str
    route_segments: Optional[Dict[str, str]] = None # e.g. {"0": "FREE_FLOW", "2": "CONGESTED"}
    route_spans: Optional[Dict[str, str]] = None # e.g. {"2": "25", "3": "FULL"}
    signal_segments: Optional[Dict[str, str]] = None # e.g. {"3": "BAD", "4": "GOOD"}
    signal_spans: Optional[Dict[str, str]] = None # e.g. {"3": "15", "4": "FULL"}

@router.post("/start")
async def start_simulation(req: StartRequest):
    """Start simulation engine for a designated trip"""
    trip_dict = req.model_dump(exclude_unset=True)
    success = simulation_manager.start(req.trip_id, trip_dict)
    if req.speed_multiplier and req.speed_multiplier > 1.0:
        simulation_manager.set_speed(req.trip_id, req.speed_multiplier)
    if not success:
        raise HTTPException(status_code=404, detail=f"Trip ID '{req.trip_id}' could not be started.")
    return {"status": "SUCCESS", "message": f"Simulation for trip {req.trip_id} started successfully."}

@router.post("/pause")
async def pause_simulation(req: PauseRequest):
    """Pause running simulation"""
    success = simulation_manager.pause(req.trip_id)
    return {"status": "SUCCESS" if success else "FAILED", "trip_id": req.trip_id, "is_paused": True}

@router.post("/reset")
async def reset_simulation(req: ResetRequest):
    """Reset simulation state to KM 0"""
    success = simulation_manager.reset(req.trip_id)
    return {"status": "SUCCESS", "message": f"Simulation for trip {req.trip_id} has been reset."}

@router.post("/speed")
async def set_speed(req: SpeedRequest):
    """Set simulation time acceleration multiplier (1x, 2x, 5x, 10x, 20x)"""
    success = simulation_manager.set_speed(req.trip_id, req.multiplier)
    engine = simulation_manager.engines.get(req.trip_id)
    interval = engine.clock.get_tick_interval_ms() if engine else int(1000.0 / req.multiplier)
    return {"status": "SUCCESS", "speed_multiplier": req.multiplier, "tick_interval_ms": interval}

@router.post("/configure")
async def configure_simulation(req: ConfigureRequest):
    """Update route segment road conditions and congestion spans dynamically"""
    engine = simulation_manager.get_or_create_engine(req.trip_id)
    if not engine:
        raise HTTPException(status_code=404, detail=f"Trip {req.trip_id} not found.")

    seg_dict = None
    if req.route_segments:
        seg_dict = {int(k): str(v).upper() for k, v in req.route_segments.items() if str(k).isdigit()}

    span_dict = None
    if req.route_spans:
        span_dict = {int(k): str(v).upper() for k, v in req.route_spans.items() if str(k).isdigit()}

    sig_dict = None
    if req.signal_segments:
        sig_dict = {int(k): str(v).upper() for k, v in req.signal_segments.items() if str(k).isdigit()}

    sig_span_dict = None
    if req.signal_spans:
        sig_span_dict = {int(k): str(v).upper() for k, v in req.signal_spans.items() if str(k).isdigit()}

    simulation_manager.configure_segments(req.trip_id, seg_dict, span_dict, sig_dict, sig_span_dict)

    return {
        "status": "SUCCESS",
        "trip_id": req.trip_id,
        "road_conditions": engine.road_conditions_map,
        "road_spans": engine.road_spans_map,
        "road_hazard_zones": engine.road_hazard_zones,
        "signal_conditions": engine.signal_conditions_map,
        "signal_spans": engine.signal_spans_map,
        "signal_hazard_zones": engine.signal_hazard_zones
    }

@router.post("/actuator")
async def update_actuators(req: ActuatorRequest):
    """Control blower fan speed, air inlet damper, and refrigeration compressor"""
    engine = simulation_manager.get_or_create_engine(req.trip_id)
    if not engine:
        raise HTTPException(status_code=404, detail=f"Trip {req.trip_id} not found.")
    
    engine.set_actuators(fan_speed=req.fan_speed, air_inlet=req.air_inlet, chiller=req.chiller_power)
    return {"status": "SUCCESS", "message": "Actuator status updated successfully."}

@router.post("/inject-fault")
async def inject_fault(req: FaultRequest):
    """Inject mechanical faults, environmental hazards, and sensor anomalies"""
    engine = simulation_manager.get_or_create_engine(req.trip_id)
    if not engine:
        raise HTTPException(status_code=404, detail=f"Trip {req.trip_id} not found.")
    
    anomaly = req.anomaly_type.upper()
    faults = {}
    if anomaly == "CHILLER_FAIL":
        faults["chillerFail"] = req.active
    elif anomaly == "DOOR_OPEN":
        faults["doorOpen"] = req.active
    elif anomaly == "VENT_STOP":
        faults["ventFail"] = req.active
    elif anomaly == "TRAFFIC_JAM":
        faults["trafficStop"] = req.active
    elif anomaly == "FUEL_EMPTY":
        faults["fuelEmpty"] = req.active
    elif anomaly == "LOW_BATTERY":
        faults["lowBattery"] = req.active
    elif anomaly == "BLANK_SPOT":
        faults["blankSpot"] = req.active
    elif anomaly == "SENSOR_DRIFT":
        faults["sensorDrift"] = req.active
    elif anomaly == "SENSOR_FREEZE":
        faults["sensorFreeze"] = req.active
    elif anomaly == "SENSOR_SPIKE":
        faults["sensorSpike"] = req.active
    elif anomaly == "SENSOR_NULL":
        faults["sensorNull"] = req.active
    
    engine.inject_faults(faults)
    return {"status": "SUCCESS", "anomaly": req.anomaly_type, "active": req.active}

@router.get("/status")
async def get_simulation_status(trip_id: Optional[str] = Query(None)):
    """Retrieve current simulation operational status"""
    if not trip_id:
        trips = simulation_manager.db.get_trips()
        if not trips:
            return {"status": "STANDBY", "trip_id": None, "is_running": False}
        trip_id = trips[0]["trip_id"]
    return simulation_manager.get_status(trip_id)

@router.get("/latest")
async def get_latest_payload(trip_id: Optional[str] = Query(None)):
    """Retrieve latest 25-field telemetry payload from memory"""
    if not trip_id:
        trips = simulation_manager.db.get_trips()
        if not trips:
            raise HTTPException(status_code=404, detail="No dispatch manifests registered yet.")
        trip_id = trips[0]["trip_id"]

    engine = simulation_manager.engines.get(trip_id)
    is_running = engine.is_running and not engine.is_paused and not engine.is_completed if engine else False
    trip_record = simulation_manager.db.get_trip(trip_id)
    db_status = trip_record["status"] if trip_record else "SCHEDULED"

    payload = simulation_manager.latest_payloads.get(trip_id)
    if not payload:
        engine = simulation_manager.get_or_create_engine(trip_id)
        if engine:
            # Standby baseline snapshot (preserve vehicle's last position from database)
            p = engine.tick()
            payload = p.model_dump()
            payload["vehicle"]["speed_kmh"] = 0.0
            payload["vehicle"]["vibration_rms_g"] = 0.0
            payload["engineRunning"] = False
            payload["tripStatus"] = db_status

            truck_info = simulation_manager.db.get_vehicle(engine.truck_id)
            if truck_info and truck_info.get("last_latitude") is not None and truck_info.get("last_longitude") is not None:
                payload["vehicle"]["latitude"] = truck_info["last_latitude"]
                payload["vehicle"]["longitude"] = truck_info["last_longitude"]
                if truck_info.get("heading_deg") is not None:
                    payload["vehicle"]["heading_deg"] = truck_info["heading_deg"]
            else:
                payload["vehicle"]["distance_traveled_km"] = 0.0
                payload["identity"]["sequence_number"] = 0

            simulation_manager.latest_payloads[trip_id] = payload
        else:
            raise HTTPException(status_code=404, detail=f"No telemetry data available for trip {trip_id}.")

    res = dict(payload)
    res["engineRunning"] = is_running
    res["tripStatus"] = db_status
    if not is_running:
        if "vehicle" in res and isinstance(res["vehicle"], dict):
            res["vehicle"]["speed_kmh"] = 0.0
            res["vehicle"]["vibration_rms_g"] = 0.0
        if "systems" in res and isinstance(res["systems"], dict) and "power" in res["systems"]:
            res["systems"]["power"]["power_status"] = "BATTERY"
    return res

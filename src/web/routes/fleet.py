"""
Fleet & Templates REST API Routes
Sesuai spesifikasi api_and_websocket_spec.md §2.3
"""

import json
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from src.simulation.core.manager import db_manager, simulation_manager
from src.routing.osrm_client import OSRMClient

router = APIRouter(prefix="/api/v1/simulation", tags=["Fleet & Templates"])
osrm_client = OSRMClient()

class VehicleCreateRequest(BaseModel):
    truck_id: str
    plate_number: str
    template_key: str
    display_name: str
    notes: str = ""

class TripCreateRequest(BaseModel):
    trip_id: str
    truck_id: str = "TRUCK-AJ-36000-01"
    delivery_order: Optional[str] = None
    driver_name: str = "Rahmat Santoso"
    route_type: str = "TOLL"
    cargo_strain: str = "Cobb 500"
    cargo_quantity: int = 36000
    average_weight_g: float = 42.0
    box_type: str = "PLASTIC_CRATE"
    chicks_per_box: int = 100
    departure_date: Optional[str] = "2026-10-31"
    departure_time: str = "08:00"
    weather: str = "SUNNY"
    origin_name: Optional[str] = "Subang Hatchery (Hulu)"
    origin_lat: Optional[float] = -6.5650
    origin_lng: Optional[float] = 107.7600
    destination_name: Optional[str] = "Bogor Broiler Farm (Hilir)"
    destination_lat: Optional[float] = -6.5980
    destination_lng: Optional[float] = 106.7990

@router.get("/templates")
def list_templates():
    """Mengambil master 6 Template Spesifikasi Paten Truk"""
    templates = db_manager.get_templates()
    return {"status": "SUCCESS", "count": len(templates), "templates": templates}

@router.get("/vehicles")
def list_vehicles():
    """Mengambil daftar armada truk terdaftar beserta posisi GPS terakhir real-time"""
    vehicles = db_manager.get_vehicles()
    enriched = []
    for v in vehicles:
        v_dict = dict(v)
        truck_id = v_dict["truck_id"]
        gps_live = simulation_manager.get_truck_last_gps(truck_id)
        if gps_live:
            v_dict["last_latitude"] = gps_live["last_latitude"]
            v_dict["last_longitude"] = gps_live["last_longitude"]
            v_dict["last_location_name"] = gps_live["last_location_name"]
            v_dict["last_speed_kmh"] = gps_live["last_speed_kmh"]
            v_dict["heading_deg"] = gps_live["heading_deg"]
            v_dict["last_telemetry_at"] = gps_live["last_telemetry_at"]
            v_dict["is_moving"] = gps_live["is_moving"]
            v_dict["active_trip_id"] = gps_live.get("active_trip_id")
            if gps_live["is_moving"]:
                v_dict["status"] = "ON_TRIP"
        else:
            v_dict["is_moving"] = False
            v_dict["heading_deg"] = 0.0
            v_dict["active_trip_id"] = None
        enriched.append(v_dict)

    return {"status": "SUCCESS", "count": len(enriched), "vehicles": enriched}

@router.post("/vehicles")
def create_vehicle(req: VehicleCreateRequest):
    """Mendaftarkan armada truk baru"""
    template = db_manager.get_template(req.template_key)
    if not template:
        raise HTTPException(status_code=400, detail=f"Template key '{req.template_key}' tidak ditemukan.")
    
    with db_manager.get_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute("""
            INSERT INTO vehicles (
                truck_id, plate_number, template_key, display_name, status,
                last_latitude, last_longitude, last_location_name, last_speed_kmh, notes
            ) VALUES (?, ?, ?, ?, 'AVAILABLE', -6.5650, 107.7600, 'Subang Hatchery Pool', 0.0, ?)
            """, (req.truck_id, req.plate_number, req.template_key, req.display_name, req.notes))
            conn.commit()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Gagal mendaftarkan armada: {str(e)}")
            
    return {"status": "SUCCESS", "message": f"Armada {req.truck_id} berhasil didaftarkan."}

@router.get("/trips")
def list_trips():
    """Mengambil daftar rencana ekspedisi / pengiriman dengan status runtime live"""
    trips = db_manager.get_trips()
    enriched = []
    for t in trips:
        t_dict = dict(t)
        tid = t_dict["trip_id"]
        eng = simulation_manager.engines.get(tid)
        if eng:
            if eng.is_running and not eng.is_paused and not eng.is_completed:
                t_dict["status"] = "RUNNING"
            elif eng.is_paused:
                t_dict["status"] = "PAUSED"
            elif eng.is_completed:
                t_dict["status"] = "COMPLETED"
        enriched.append(t_dict)
    return {"status": "SUCCESS", "count": len(enriched), "trips": enriched}

@router.post("/trips")
async def create_trip(req: TripCreateRequest):
    """Mendaftarkan atau memperbarui rencana pengiriman (trip) dan menghitung rute dinamis via OSRM API (profil car)"""
    trip_dict = req.model_dump()

    # Koordinat asal, tujuan & status preferensi jalan tol dari form
    o_lat = req.origin_lat if req.origin_lat is not None else -6.5650
    o_lng = req.origin_lng if req.origin_lng is not None else 107.7600
    d_lat = req.destination_lat if req.destination_lat is not None else -6.5980
    d_lng = req.destination_lng if req.destination_lng is not None else 106.7990
    o_name = req.origin_name or "Subang Hatchery (Hulu)"
    d_name = req.destination_name or "Bogor Broiler Farm (Hilir)"
    r_type = req.route_type or "TOLL"

    # Panggil OSRM API dengan profil car
    try:
        osrm_res = await osrm_client.get_route(
            origin_lng=o_lng,
            origin_lat=o_lat,
            dest_lng=d_lng,
            dest_lat=d_lat,
            route_type=r_type,
            origin_name=o_name,
            dest_name=d_name
        )
    except Exception as e:
        osrm_res = None

    if osrm_res and osrm_res.get("success"):
        route_id = f"ROUTE-{r_type}-{req.trip_id}"
        route_record = {
            "route_id": route_id,
            "origin_name": o_name,
            "origin_lat": o_lat,
            "origin_lng": o_lng,
            "destination_name": d_name,
            "destination_lat": d_lat,
            "destination_lng": d_lng,
            "route_type": "TOLL_HIGHWAY" if r_type == "TOLL" else "NON_TOLL_ARTERIAL",
            "total_distance_km": osrm_res["total_distance_km"],
            "estimated_duration_min": osrm_res["estimated_duration_min"],
            "waypoints_count": osrm_res["waypoints_count"],
            "waypoints_geojson": json.dumps(osrm_res["geojson"])
        }
        db_manager.save_route(route_record)
        trip_dict["route_id"] = route_id
        trip_dict["total_distance_km"] = osrm_res["total_distance_km"]
        trip_dict["estimated_duration_min"] = osrm_res["estimated_duration_min"]
        trip_dict["waypoints_count"] = osrm_res["waypoints_count"]

    db_manager.insert_trip(trip_dict)
    return {
        "status": "SUCCESS",
        "message": f"Pengiriman {req.trip_id} berhasil didaftarkan dengan rute OSRM car ({trip_dict.get('total_distance_km', 145.0)} km).",
        "trip": trip_dict,
        "osrm_route": osrm_res
    }

@router.delete("/trips/{trip_id}")
def delete_trip(trip_id: str):
    """Menghapus data pengiriman dan menghentikan simulasi jika sedang berjalan"""
    success = simulation_manager.delete_trip(trip_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Trip ID '{trip_id}' tidak ditemukan.")
    return {"status": "SUCCESS", "message": f"Pengiriman {trip_id} berhasil dihapus."}

@router.post("/trips/clear")
@router.delete("/trips")
def clear_trips():
    """Membersihkan seluruh data pengiriman lama agar antrean kosong untuk pembuatan pengiriman baru"""
    count = simulation_manager.clear_all_trips(reseed_default=False)
    trips = db_manager.get_trips()
    return {
        "status": "SUCCESS",
        "message": f"Berhasil membersihkan seluruh data pengiriman ({count} data terhapus). Antrean pengiriman kini kosong dan siap untuk pembuatan pengiriman baru.",
        "trips": trips
    }

"""
Routes & OSRM REST API Routes
Sesuai spesifikasi database_and_storage_spec.md §4
"""

import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from src.routing.osrm_client import OSRMClient
from src.simulation.core.manager import db_manager

router = APIRouter(prefix="/api/v1/routes", tags=["Routes & OSRM"])
osrm_client = OSRMClient()

class RouteGenerateRequest(BaseModel):
    origin_name: str = "Subang Hatchery"
    origin_lat: float = -6.5650
    origin_lng: float = 107.7600
    destination_name: str = "Bogor Broiler Farm"
    destination_lat: float = -6.5980
    destination_lng: float = 106.7990
    route_type: str = Field(default="TOLL_HIGHWAY", description="'TOLL_HIGHWAY' atau 'NON_TOLL_ARTERIAL'")

@router.post("/generate")
async def generate_route(req: RouteGenerateRequest):
    """
    Memanggil OSRM API untuk menghitung rute dinamis (Tol / Non-Tol),
    lalu menyimpan GeoJSON hasilnya ke pustaka rute database.
    """
    res = await osrm_client.get_route(
        origin_lng=req.origin_lng,
        origin_lat=req.origin_lat,
        dest_lng=req.destination_lng,
        dest_lat=req.destination_lat,
        route_type=req.route_type,
        origin_name=req.origin_name,
        dest_name=req.destination_name
    )

    route_id = f"ROUTE-{req.route_type}-{abs(hash(req.origin_name + req.destination_name)) % 10000:04d}"
    route_record = {
        "route_id": route_id,
        "origin_name": req.origin_name,
        "origin_lat": req.origin_lat,
        "origin_lng": req.origin_lng,
        "destination_name": req.destination_name,
        "destination_lat": req.destination_lat,
        "destination_lng": req.destination_lng,
        "route_type": req.route_type,
        "total_distance_km": res["total_distance_km"],
        "estimated_duration_min": res["estimated_duration_min"],
        "waypoints_count": res["waypoints_count"],
        "waypoints_geojson": json.dumps(res["geojson"])
    }
    
    db_manager.save_route(route_record)

    return {
        "status": "SUCCESS",
        "route_id": route_id,
        "source": res["source"],
        "total_distance_km": res["total_distance_km"],
        "estimated_duration_min": res["estimated_duration_min"],
        "waypoints_count": res["waypoints_count"],
        "geojson": res["geojson"]
    }

@router.get("")
def list_routes():
    """Mengambil seluruh riwayat rute di database"""
    with db_manager.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT route_id, origin_name, destination_name, route_type, total_distance_km, estimated_duration_min, waypoints_count, created_at FROM routes ORDER BY created_at DESC")
        rows = [dict(r) for r in cursor.fetchall()]
        return {"status": "SUCCESS", "count": len(rows), "routes": rows}

@router.get("/{route_id}")
def get_route_detail(route_id: str):
    """Mengambil detail rute lengkap dan koordinat GeoJSON dari database"""
    with db_manager.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM routes WHERE route_id = ?", (route_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Rute '{route_id}' tidak ditemukan.")
        r = dict(row)
        try:
            r["waypoints_geojson"] = json.loads(r["waypoints_geojson"])
        except Exception:
            pass
        return {"status": "SUCCESS", "route": r}

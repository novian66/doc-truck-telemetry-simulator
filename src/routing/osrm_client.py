"""
OSRM Client Module
Memanggil Open Source Routing Machine (OSRM) API untuk rute dinamis (Tol vs Non-Tol).
Dilengkapi penanganan offline fallback ke cache lokal.
"""

import json
import httpx
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple

BASE_DIR = Path(__file__).resolve().parent.parent.parent
CONFIG_ROUTES_DIR = BASE_DIR / "configs" / "routes"
CACHE_ROUTES_DIR = BASE_DIR / "data" / "cache_routes"

OSRM_BASE_URL = "https://router.project-osrm.org/route/v1/car"

# Koordinat perantara untuk memaksa rute menghindari jalan tol (jalur arteri Purwakarta - Cileungsi)
NON_TOLL_WAYPOINTS = [
    (107.4430, -6.5560), # Sadang / Purwakarta
    (107.0540, -6.4670)  # Jonggol / Cileungsi
]

class OSRMClient:
    def __init__(self, timeout_sec: float = 8.0):
        self.timeout = timeout_sec
        CACHE_ROUTES_DIR.mkdir(parents=True, exist_ok=True)

    async def get_route(
        self,
        origin_lng: float,
        origin_lat: float,
        dest_lng: float,
        dest_lat: float,
        route_type: str = "TOLL_HIGHWAY",
        origin_name: str = "Origin",
        dest_name: str = "Destination"
    ) -> Dict[str, Any]:
        """
        Memanggil OSRM API (profil car) secara asinkron.
        Mengembalikan struktur data rute lengkap (GeoJSON LineString, jarak total km, estimasi menit).
        """
        # Susun daftar koordinat OSRM: {lon1},{lat1};{lon2},{lat2}
        if route_type in ("NON_TOLL", "NON_TOLL_ARTERIAL"):
            # Sisipkan titik arteri nasional non-tol
            pts = [f"{origin_lng},{origin_lat}"]
            for w_lng, w_lat in NON_TOLL_WAYPOINTS:
                pts.append(f"{w_lng},{w_lat}")
            pts.append(f"{dest_lng},{dest_lat}")
            coords_str = ";".join(pts)
        else:
            coords_str = f"{origin_lng},{origin_lat};{dest_lng},{dest_lat}"

        url = f"{OSRM_BASE_URL}/{coords_str}?overview=full&geometries=geojson&steps=false"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    routes = data.get("routes", [])
                    if routes:
                        r = routes[0]
                        dist_km = round(r.get("distance", 0) / 1000.0, 2)
                        dur_min = round(r.get("duration", 0) / 60.0, 1)
                        geom = r.get("geometry", {})
                        coords = geom.get("coordinates", [])

                        geojson_feature = {
                            "type": "Feature",
                            "properties": {
                                "route_name": f"{origin_name} ke {dest_name} ({'Tol' if route_type == 'TOLL_HIGHWAY' else 'Non-Tol'})",
                                "origin_name": origin_name,
                                "destination_name": dest_name,
                                "road_length_km": dist_km,
                                "estimated_duration_min": dur_min,
                                "route_type": route_type
                            },
                            "geometry": {
                                "type": "LineString",
                                "coordinates": coords
                            }
                        }
                        return {
                            "success": True,
                            "source": "OSRM_API",
                            "total_distance_km": dist_km,
                            "estimated_duration_min": dur_min,
                            "waypoints_count": len(coords),
                            "geojson": geojson_feature,
                            "coordinates": coords
                        }
        except Exception as e:
            # Gagal koneksi / timeout / offline -> Fallback
            pass

        # Fallback ke cache rute lokal
        return self._get_fallback_route(origin_name, dest_name, route_type)

    def _get_fallback_route(self, origin_name: str, dest_name: str, route_type: str) -> Dict[str, Any]:
        fallback_file = CONFIG_ROUTES_DIR / "waypoints_subang_bogor.json"
        if fallback_file.exists():
            with open(fallback_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                coords = data.get("geometry", {}).get("coordinates", [])
                dist_km = data.get("properties", {}).get("road_length_km", 145.0)
                dur_min = data.get("properties", {}).get("estimated_duration_min", 175)
                return {
                    "success": True,
                    "source": "OFFLINE_CACHE_FALLBACK",
                    "total_distance_km": dist_km,
                    "estimated_duration_min": dur_min,
                    "waypoints_count": len(coords),
                    "geojson": data,
                    "coordinates": coords
                }
        
        # Skenario ekstrim: Buat garis lurus dasar
        coords = [[107.7600, -6.5650], [106.7990, -6.5980]]
        return {
            "success": True,
            "source": "MINIMAL_FALLBACK",
            "total_distance_km": 145.0,
            "estimated_duration_min": 180,
            "waypoints_count": len(coords),
            "geojson": {
                "type": "Feature",
                "properties": { "route_name": f"{origin_name} ke {dest_name}", "road_length_km": 145.0 },
                "geometry": { "type": "LineString", "coordinates": coords }
            },
            "coordinates": coords
        }

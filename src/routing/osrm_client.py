"""
OSRM Client Module
Memanggil Open Source Routing Machine (OSRM) API untuk rute dinamis (Tol vs Non-Tol).
Dilengkapi penanganan offline fallback ke cache lokal.
"""

import json
import httpx
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple
from src.routing.route_manager import haversine_distance
from src.routing.arterial_corridors import select_arterial_waypoints

BASE_DIR = Path(__file__).resolve().parent.parent.parent
CACHE_ROUTES_DIR = BASE_DIR / "data" / "cache_routes"

OSRM_BASE_URL = "https://router.project-osrm.org/route/v1/car"

class OSRMClient:
    def __init__(self, timeout_sec: float = 15.0):
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
        Untuk rute NON_TOLL, menggunakan seleksi koridor dinamis arteri nasional (Option A)
        agar terhindar dari jalan tol tanpa hardcoded titik rute tunggal.
        """
        # Susun daftar koordinat OSRM: {lon1},{lat1};{lon2},{lat2}
        if route_type in ("NON_TOLL", "NON_TOLL_ARTERIAL"):
            arterial_pts = select_arterial_waypoints(
                origin_lng=origin_lng,
                origin_lat=origin_lat,
                dest_lng=dest_lng,
                dest_lat=dest_lat
            )
            if arterial_pts:
                pts = [f"{origin_lng:.6f},{origin_lat:.6f}"]
                for w_lng, w_lat, _ in arterial_pts:
                    pts.append(f"{w_lng:.6f},{w_lat:.6f}")
                pts.append(f"{dest_lng:.6f},{dest_lat:.6f}")
                coords_str = ";".join(pts)
            else:
                coords_str = f"{origin_lng:.6f},{origin_lat:.6f};{dest_lng:.6f},{dest_lat:.6f}"
        else:
            coords_str = f"{origin_lng:.6f},{origin_lat:.6f};{dest_lng:.6f},{dest_lat:.6f}"

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
                                "route_name": f"{origin_name} to {dest_name} ({'Toll' if route_type in ('TOLL', 'TOLL_HIGHWAY') else 'Non-Toll'})",
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
        except Exception:
            # Network failure / timeout / offline -> Dynamic Geodesic Fallback
            pass

        # Fallback to dynamic geodesic interpolation (zero file dependency)
        return self._get_fallback_route(
            origin_lng=origin_lng,
            origin_lat=origin_lat,
            dest_lng=dest_lng,
            dest_lat=dest_lat,
            origin_name=origin_name,
            dest_name=dest_name,
            route_type=route_type
        )

    def _get_fallback_route(
        self,
        origin_lng: float,
        origin_lat: float,
        dest_lng: float,
        dest_lat: float,
        origin_name: str,
        dest_name: str,
        route_type: str
    ) -> Dict[str, Any]:
        """
        Dynamic Geodesic Fallback
        Calculates Great-Circle geodesic waypoints between arbitrary coordinates
        when external OSRM API is unreachable or rate-limited.
        """
        direct_dist = haversine_distance(origin_lat, origin_lng, dest_lat, dest_lng)
        # Apply typical roadway winding factor (1.25x for expressway, 1.35x for arterial)
        winding_factor = 1.25 if route_type in ("TOLL", "TOLL_HIGHWAY") else 1.35
        dist_km = max(1.0, round(direct_dist * winding_factor, 2))
        avg_speed = 75.0 if route_type in ("TOLL", "TOLL_HIGHWAY") else 50.0
        dur_min = round((dist_km / avg_speed) * 60.0, 1)

        # Generate intermediate interpolated coordinates (5 to 35 steps based on distance)
        num_steps = max(5, min(35, int(dist_km / 5.0)))
        coords = []
        for i in range(num_steps + 1):
            ratio = i / float(num_steps)
            lng_i = round(origin_lng + ratio * (dest_lng - origin_lng), 6)
            lat_i = round(origin_lat + ratio * (dest_lat - origin_lat), 6)
            coords.append([lng_i, lat_i])

        geojson_feature = {
            "type": "Feature",
            "properties": {
                "route_name": f"{origin_name} to {dest_name} ({'Toll' if route_type in ('TOLL', 'TOLL_HIGHWAY') else 'Non-Toll'})",
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
            "source": "DYNAMIC_GEODESIC_FALLBACK",
            "total_distance_km": dist_km,
            "estimated_duration_min": dur_min,
            "waypoints_count": len(coords),
            "geojson": geojson_feature,
            "coordinates": coords
        }

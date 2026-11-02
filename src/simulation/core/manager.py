"""
Simulation Runtime Manager
Mengelola konkurensi multi-truk/ekspedisi secara simultan menggunakan asyncio background tasks.
"""

import asyncio
import json
from typing import Dict, Optional, Any
from src.storage.db_manager import DatabaseManager
from src.simulation.core.engine import SimulationEngine
from src.web.ws.broadcaster import broadcaster

class SimulationManager:
    def __init__(self, db: DatabaseManager):
        self.db = db
        self.engines: Dict[str, SimulationEngine] = {}
        self.tasks: Dict[str, asyncio.Task] = {}
        self.latest_payloads: Dict[str, Dict[str, Any]] = {}

    def get_or_create_engine(self, trip_id: str, trip_data_override: Optional[Dict[str, Any]] = None) -> Optional[SimulationEngine]:
        if trip_id in self.engines:
            return self.engines[trip_id]

        trip_data = self.db.get_trip(trip_id)
        if not trip_data:
            return None

        truck = self.db.get_vehicle(trip_data["truck_id"])
        if not truck:
            return None

        template = self.db.get_template(truck["template_key"])
        if not template:
            return None

        route_geojson = json.loads(trip_data["waypoints_geojson"])
        coords = route_geojson.get("geometry", {}).get("coordinates", [])

        engine = SimulationEngine(trip_data, template, coords)
        self.engines[trip_id] = engine
        return engine

    async def _run_loop(self, trip_id: str, engine: SimulationEngine):
        engine.is_running = True
        engine.is_paused = False

        try:
            self.db.update_trip_status(trip_id, "RUNNING")
            trip_rec = self.db.get_trip(trip_id)
            orig_name = trip_rec.get("origin_name", "Asal") if trip_rec else "Asal"
            dest_name = trip_rec.get("destination_name", "Tujuan") if trip_rec else "Tujuan"

            pos_init = engine.track.get_position_at_distance(engine.kinematics.distance_traveled_km)
            self.db.update_vehicle_last_position(
                truck_id=engine.truck_id,
                lat=pos_init.get("latitude", pos_init.get("lat", -6.5650)),
                lng=pos_init.get("longitude", pos_init.get("lng", 107.7600)),
                location_name=f"{orig_name} (KM 0)",
                speed_kmh=engine.kinematics.current_speed_kmh,
                status="ON_TRIP"
            )

            while engine.is_running and not engine.is_completed:
                if engine.is_paused:
                    await asyncio.sleep(0.5)
                    continue

                # Eksekusi 1 tick
                payload = engine.tick()
                p_dict = payload.model_dump()
                p_dict["engineRunning"] = True
                p_dict["tripStatus"] = "RUNNING"
                self.latest_payloads[trip_id] = p_dict

                # Broadcast ke WebSocket
                await broadcaster.broadcast_payload(trip_id, p_dict)

                # Persist posisi GPS armada ke database secara berkala (tiap 5 tick)
                if payload.identity.sequence_number % 5 == 0:
                    v_p = p_dict.get("vehicle", {})
                    dist_km = v_p.get("distance_traveled_km", 0.0)
                    self.db.update_vehicle_last_position(
                        truck_id=engine.truck_id,
                        lat=v_p.get("latitude", -6.5650),
                        lng=v_p.get("longitude", 107.7600),
                        location_name=f"Jalur {orig_name} - {dest_name} KM {dist_km:.1f}",
                        speed_kmh=v_p.get("speed_kmh", 0.0),
                        status="ON_TRIP"
                    )

                # Delay jam dinding sesuai speed multiplier (1x = 1000ms, 10x = 100ms)
                interval_sec = engine.clock.get_tick_interval_ms() / 1000.0
                await asyncio.sleep(interval_sec)

            if engine.is_completed:
                self.db.update_trip_status(trip_id, "COMPLETED")
                if trip_id in self.latest_payloads:
                    last_p = self.latest_payloads[trip_id]
                    last_p["engineRunning"] = False
                    last_p["tripStatus"] = "COMPLETED"
                    v_p = last_p.get("vehicle", {})
                    v_p["speed_kmh"] = 0.0
                    v_p["vibration_rms_g"] = 0.0
                    self.db.update_vehicle_last_position(
                        truck_id=engine.truck_id,
                        lat=v_p.get("latitude", -6.5980),
                        lng=v_p.get("longitude", 106.7990),
                        location_name=f"{dest_name} (Tiba di Tujuan)",
                        speed_kmh=0.0,
                        status="AVAILABLE"
                    )
                engine.is_running = False
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"Error in simulation loop {trip_id}: {e}")
        finally:
            engine.is_running = False

    def start(self, trip_id: str, trip_data_override: Optional[Dict[str, Any]] = None) -> bool:
        engine = self.get_or_create_engine(trip_id, trip_data_override)
        if not engine:
            return False

        # Pastikan status di database dan armada selalu sinkron menjadi RUNNING / ON_TRIP
        self.db.update_trip_status(trip_id, "RUNNING")
        pos = engine.track.get_position_at_distance(engine.kinematics.distance_traveled_km)
        dist_km = engine.kinematics.distance_traveled_km
        self.db.update_vehicle_last_position(
            truck_id=engine.truck_id,
            lat=pos.get("latitude", pos.get("lat", -6.5650)),
            lng=pos.get("longitude", pos.get("lng", 107.7600)),
            location_name=f"Tol / Jalan KM {dist_km:.1f}",
            speed_kmh=engine.kinematics.current_speed_kmh,
            status="ON_TRIP"
        )

        if trip_id in self.latest_payloads:
            self.latest_payloads[trip_id]["tripStatus"] = "RUNNING"
            self.latest_payloads[trip_id]["engineRunning"] = True

        if trip_id in self.tasks and not self.tasks[trip_id].done():
            # Jika sedang di-pause, resume loop dan pancarkan status terkini
            engine.is_paused = False
            engine.is_running = True
            if trip_id in self.latest_payloads:
                try:
                    asyncio.create_task(broadcaster.broadcast_payload(trip_id, self.latest_payloads[trip_id]))
                except Exception:
                    pass
            return True

        # Buat task baru
        task = asyncio.create_task(self._run_loop(trip_id, engine))
        self.tasks[trip_id] = task
        return True

    def pause(self, trip_id: str) -> bool:
        engine = self.engines.get(trip_id)
        if engine and engine.is_running:
            engine.is_paused = True
            self.db.update_trip_status(trip_id, "PAUSED")
            if trip_id in self.latest_payloads:
                last_p = self.latest_payloads[trip_id]
                last_p["engineRunning"] = False
                last_p["tripStatus"] = "PAUSED"
                v_p = last_p.get("vehicle", {})
                v_p["speed_kmh"] = 0.0
                v_p["vibration_rms_g"] = 0.0
                dist_km = v_p.get("distance_traveled_km", 0.0)
                self.db.update_vehicle_last_position(
                    truck_id=engine.truck_id,
                    lat=v_p.get("latitude", -6.5650),
                    lng=v_p.get("longitude", 107.7600),
                    location_name=f"Berhenti Sementara (KM {dist_km:.1f})",
                    speed_kmh=0.0,
                    status="ON_TRIP"
                )
                try:
                    asyncio.create_task(broadcaster.broadcast_payload(trip_id, last_p))
                except Exception:
                    pass
            return True
        return False

    def get_truck_last_gps(self, truck_id: str) -> Optional[Dict[str, Any]]:
        """Mengekstrak posisi GPS real-time terbaru dari memori simulasi aktif jika ada"""
        for trip_id, p_dict in self.latest_payloads.items():
            if p_dict.get("identity", {}).get("truck_id") == truck_id:
                eng = self.engines.get(trip_id)
                is_running = eng.is_running and not eng.is_paused and not eng.is_completed if eng else False
                v = p_dict.get("vehicle", {})
                dist_km = v.get("distance_traveled_km", 0.0)
                tot_km = v.get("total_distance_km", 145.0)

                trip_rec = self.db.get_trip(trip_id)
                orig = trip_rec.get("origin_name", "Asal") if trip_rec else "Asal"
                dest = trip_rec.get("destination_name", "Tujuan") if trip_rec else "Tujuan"

                if dist_km <= 1.0:
                    loc = f"{orig} (KM 0)"
                elif dist_km >= tot_km - 1.0:
                    loc = f"{dest} (KM {tot_km:.0f})"
                else:
                    loc = f"Jalur {orig} &rarr; {dest} KM {dist_km:.1f}"

                return {
                    "last_latitude": v.get("latitude", -6.5650),
                    "last_longitude": v.get("longitude", 107.7600),
                    "last_location_name": loc,
                    "last_speed_kmh": v.get("speed_kmh", 0.0),
                    "heading_deg": v.get("heading_deg", 0.0),
                    "last_telemetry_at": p_dict.get("identity", {}).get("timestamp"),
                    "is_moving": is_running and v.get("speed_kmh", 0.0) > 0,
                    "active_trip_id": trip_id
                }
        return None

    def reset(self, trip_id: str) -> bool:
        # Hentikan task jika sedang berjalan
        if trip_id in self.tasks and not self.tasks[trip_id].done():
            self.tasks[trip_id].cancel()
        
        if trip_id in self.engines:
            del self.engines[trip_id]
        if trip_id in self.latest_payloads:
            del self.latest_payloads[trip_id]

        self.db.update_trip_status(trip_id, "SCHEDULED")
        return True

    def delete_trip(self, trip_id: str) -> bool:
        if trip_id in self.tasks and not self.tasks[trip_id].done():
            self.tasks[trip_id].cancel()
        if trip_id in self.engines:
            self.engines[trip_id].is_running = False
            del self.engines[trip_id]
        if trip_id in self.latest_payloads:
            del self.latest_payloads[trip_id]
        if trip_id in self.tasks:
            del self.tasks[trip_id]
        return self.db.delete_trip(trip_id)

    def clear_all_trips(self, reseed_default: bool = False) -> int:
        for tid, task in list(self.tasks.items()):
            if not task.done():
                task.cancel()
        self.tasks.clear()
        self.engines.clear()
        self.latest_payloads.clear()
        return self.db.clear_trips(reseed_default=reseed_default)

    def set_speed(self, trip_id: str, multiplier: float) -> bool:
        engine = self.get_or_create_engine(trip_id)
        if engine:
            engine.clock.set_speed_multiplier(multiplier)
            return True
        return False

    def configure_segments(self, trip_id: str, segments_map: Dict[int, str]) -> bool:
        engine = self.get_or_create_engine(trip_id)
        if engine:
            engine.configure_segments(segments_map)
            return True
        return False

    def get_status(self, trip_id: str) -> Dict[str, Any]:
        engine = self.engines.get(trip_id)
        if not engine:
            return {
                "trip_id": trip_id,
                "status": "STOPPED",
                "is_running": False,
                "is_paused": False,
                "is_completed": False
            }
        return {
            "trip_id": trip_id,
            "status": "RUNNING" if engine.is_running and not engine.is_paused else ("PAUSED" if engine.is_paused else "STOPPED"),
            "is_running": engine.is_running,
            "is_paused": engine.is_paused,
            "is_completed": engine.is_completed,
            "speed_multiplier": engine.clock.speed_multiplier,
            "tick_interval_ms": engine.clock.get_tick_interval_ms(),
            "sequence_number": engine.clock.sequence_number,
            "distance_traveled_km": engine.kinematics.distance_traveled_km,
            "total_distance_km": engine.total_road_km,
            "road_conditions": engine.road_conditions_map
        }

db_manager = DatabaseManager()
simulation_manager = SimulationManager(db_manager)

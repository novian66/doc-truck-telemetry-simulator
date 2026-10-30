"""
Simulator Telemetri Truk DOC — Main Entry Point
Menjalankan FastAPI Uvicorn Server (:8000) atau Live Terminal Inspector.
"""

import sys
import argparse
import uvicorn
from pathlib import Path

# Pastikan path modul terdaftar
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

def run_server(host: str = "0.0.0.0", port: int = 8000, reload: bool = False):
    print(f"Starting Simulator Telemetri Truk DOC on http://{host}:{port}")
    print(f"API Docs available at http://{host}:{port}/docs")
    print(f"WebSocket endpoint at ws://{host}:{port}/ws/telemetry")
    uvicorn.run("src.web.app:app", host=host, port=port, reload=reload)

def run_terminal_inspector(trip_id: str = "TRIP-20261030-01", ticks: int = 15):
    """Menjalankan inspeksi payload telemetri langsung di terminal konsol"""
    import json
    import time
    from src.storage.db_manager import DatabaseManager
    from src.simulation.core.engine import SimulationEngine

    db = DatabaseManager()
    trip = db.get_trip(trip_id)
    if not trip:
        print(f"Error: Trip '{trip_id}' tidak ditemukan di metadata.db.")
        return

    truck = db.get_vehicle(trip["truck_id"])
    template = db.get_template(truck["template_key"])
    route_data = json.loads(trip["waypoints_geojson"])
    coords = route_data["geometry"]["coordinates"]

    engine = SimulationEngine(trip, template, coords)
    print("=" * 88)
    print(f"🚀 MEMULAI SIMULASI TELEMETRI: {trip_id} | ARMADA: {trip['truck_id']} ({template['model_name']})")
    print("=" * 88)

    for i in range(ticks):
        p = engine.tick()
        print(f"\n[TICK #{p.identity.sequence_number:04d}] {p.identity.timestamp} | Speed: {p.vehicle.speed_kmh} km/h | Bearing: {p.vehicle.heading_deg}°")
        print(f"  📍 GPS      : Lat {p.vehicle.latitude:.6f}, Lng {p.vehicle.longitude:.6f} | Jarak: {p.vehicle.distance_traveled_km:.2f} km / {p.vehicle.total_distance_km} km")
        print(f"  🌡️ MIKROKLIMAT: Z1={p.microclimate.temp_zone_1_c}°C, Z2={p.microclimate.temp_zone_2_c}°C, Z3={p.microclimate.temp_zone_3_c}°C | BoxCore={p.microclimate.temp_box_core_c}°C")
        print(f"  💨 GAS & RH : CO2={p.microclimate.co2_ppm} ppm | RH={p.microclimate.humidity_pct}% | Ambien={p.microclimate.ambient_temp_c}°C ({p.microclimate.solar_irradiance_wm2} W/m²)")
        print(f"  🐥 BIOMETRIK: THI={p.biometrics.thi_index} | Susut Bobot={p.biometrics.estimated_weight_loss_pct:.2f}% | Alarm={p.safety.alarm_code}")
        print(f"  🔐 SECURITY : SHA-256 Hash = {p.security.payload_hash_sha256}")
        time.sleep(0.5)

    print("\n" + "=" * 88)
    print(f"✅ Selesai {ticks} tick. Seluruh payload tertulis rapi di data/trips/telemetry_{trip_id}.jsonl")
    print("=" * 88)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simulator Telemetri Truk DOC")
    parser.add_argument("--inspect", action="store_true", help="Jalankan Live Terminal Inspector langsung di konsol")
    parser.add_argument("--ticks", type=int, default=10, help="Jumlah ticks untuk mode inspect")
    parser.add_argument("--port", type=int, default=8000, help="Port server HTTP/WebSocket")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host binding server")
    args = parser.parse_args()

    if args.inspect:
        run_terminal_inspector(ticks=args.ticks)
    else:
        run_server(host=args.host, port=args.port)

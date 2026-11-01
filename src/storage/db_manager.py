"""
Database Manager Module (SQLite metadata.db)
Sesuai spesifikasi database_and_storage_spec.md
Mengelola master templates, registered vehicles, routes, dan trips.
"""

import os
import json
import sqlite3
from datetime import datetime
from typing import Dict, List, Optional, Any
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "metadata.db"

class DatabaseManager:
    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.init_db()

    def get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        return conn

    def init_db(self):
        """Inisialisasi tabel skema DDL jika belum ada"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            # 1. Tabel Master Templates Paten
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS vehicle_templates (
                template_key            VARCHAR(50) PRIMARY KEY,
                model_name              VARCHAR(120) NOT NULL,
                vendor                  VARCHAR(100) NOT NULL,
                country                 VARCHAR(50) NOT NULL,
                capacity_doc            INTEGER NOT NULL CHECK(capacity_doc > 0),
                thermal_mode            VARCHAR(20) NOT NULL CHECK(thermal_mode IN ('HVAC', 'REGRESSION')),
                cooling_capacity_kw     REAL NOT NULL DEFAULT 0.0,
                airflow_m3h             REAL NOT NULL,
                fresh_air_max_m3h       REAL NOT NULL,
                passive_inlet_area_m2   REAL NOT NULL DEFAULT 0.0,
                airflow_direction       VARCHAR(50) NOT NULL,
                sensor_zones_json       TEXT NOT NULL,
                power_source            VARCHAR(30) NOT NULL CHECK(power_source IN ('AUX_GENSET', 'ENGINE', 'BATTERY')),
                nominal_voltage_v       INTEGER NOT NULL CHECK(nominal_voltage_v IN (12, 24)),
                fuel_tank_l             REAL NOT NULL DEFAULT 50.0,
                temperature_setpoint_c  REAL NOT NULL DEFAULT 25.0,
                sensor_suite_desc       TEXT NOT NULL,
                features_json           TEXT NOT NULL,
                created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """)

            # 2. Tabel Master Armada Terdaftar
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS vehicles (
                truck_id            VARCHAR(50) PRIMARY KEY,
                plate_number        VARCHAR(20) NOT NULL UNIQUE,
                template_key        VARCHAR(50) NOT NULL REFERENCES vehicle_templates(template_key) ON UPDATE CASCADE,
                display_name        VARCHAR(120) NOT NULL,
                status              VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE' 
                                    CHECK(status IN ('AVAILABLE', 'ON_TRIP', 'MAINTENANCE')),
                last_latitude       REAL NOT NULL DEFAULT -6.5650,
                last_longitude      REAL NOT NULL DEFAULT 107.7600,
                last_location_name  TEXT NOT NULL DEFAULT 'Subang Hatchery Pool',
                last_speed_kmh      REAL NOT NULL DEFAULT 0.0,
                last_telemetry_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                notes               TEXT,
                created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """)

            # 3. Tabel Pustaka Rute
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS routes (
                route_id                VARCHAR(60) PRIMARY KEY,
                origin_name             VARCHAR(120) NOT NULL,
                origin_lat              REAL NOT NULL,
                origin_lng              REAL NOT NULL,
                destination_name        VARCHAR(120) NOT NULL,
                destination_lat         REAL NOT NULL,
                destination_lng         REAL NOT NULL,
                route_type              VARCHAR(30) NOT NULL DEFAULT 'TOLL_HIGHWAY'
                                        CHECK(route_type IN ('TOLL_HIGHWAY', 'NON_TOLL_ARTERIAL')),
                total_distance_km       REAL NOT NULL,
                estimated_duration_min  REAL NOT NULL,
                waypoints_count         INTEGER NOT NULL,
                waypoints_geojson       TEXT NOT NULL,
                created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """)

            # 4. Tabel Ekspedisi / Perjalanan
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS trips (
                trip_id             VARCHAR(60) PRIMARY KEY,
                truck_id            VARCHAR(50) NOT NULL REFERENCES vehicles(truck_id) ON UPDATE CASCADE,
                delivery_order      VARCHAR(100) NOT NULL UNIQUE,
                driver_name         VARCHAR(100) NOT NULL,
                route_id            VARCHAR(60) NOT NULL REFERENCES routes(route_id) ON UPDATE CASCADE,
                cargo_strain        VARCHAR(50) NOT NULL DEFAULT 'Cobb 500',
                cargo_quantity      INTEGER NOT NULL CHECK(cargo_quantity > 0),
                average_weight_g    REAL NOT NULL DEFAULT 42.0,
                box_type            VARCHAR(50) NOT NULL DEFAULT 'PLASTIC_CRATE',
                chicks_per_box      INTEGER NOT NULL DEFAULT 100,
                departure_date      TEXT NOT NULL DEFAULT '2026-10-31',
                departure_time      TEXT NOT NULL DEFAULT '08:00',
                weather             VARCHAR(30) NOT NULL DEFAULT 'SUNNY'
                                    CHECK(weather IN ('SUNNY', 'LIGHT_RAIN', 'HEAVY_STORM')),
                telemetry_file_path TEXT NOT NULL,
                status              VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED'
                                    CHECK(status IN ('SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'ABORTED')),
                created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at        TIMESTAMP
            );
            """)

            # Migrasi skema: Tambahkan kolom departure_date jika tabel trips sudah ada sebelumnya
            cursor.execute("PRAGMA table_info(trips);")
            trip_cols = [c[1] for c in cursor.fetchall()]
            if "departure_date" not in trip_cols and len(trip_cols) > 0:
                cursor.execute("ALTER TABLE trips ADD COLUMN departure_date TEXT NOT NULL DEFAULT '2026-10-31';")

            # Migrasi skema: Tambahkan kolom posisi GPS terakhir pada tabel vehicles
            cursor.execute("PRAGMA table_info(vehicles);")
            veh_cols = [c[1] for c in cursor.fetchall()]
            if "last_latitude" not in veh_cols and len(veh_cols) > 0:
                cursor.execute("ALTER TABLE vehicles ADD COLUMN last_latitude REAL NOT NULL DEFAULT -6.5650;")
            if "last_longitude" not in veh_cols and len(veh_cols) > 0:
                cursor.execute("ALTER TABLE vehicles ADD COLUMN last_longitude REAL NOT NULL DEFAULT 107.7600;")
            if "last_location_name" not in veh_cols and len(veh_cols) > 0:
                cursor.execute("ALTER TABLE vehicles ADD COLUMN last_location_name TEXT NOT NULL DEFAULT 'Subang Hatchery Pool';")
            if "last_speed_kmh" not in veh_cols and len(veh_cols) > 0:
                cursor.execute("ALTER TABLE vehicles ADD COLUMN last_speed_kmh REAL NOT NULL DEFAULT 0.0;")
            if "last_telemetry_at" not in veh_cols and len(veh_cols) > 0:
                cursor.execute("ALTER TABLE vehicles ADD COLUMN last_telemetry_at TIMESTAMP DEFAULT '2026-10-31 00:00:00';")

            # Indeks
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_vehicles_template ON vehicles(template_key);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_trips_truck ON trips(truck_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_routes_type ON routes(route_type);")

            conn.commit()

        # Seed data awal jika kosong
        self.seed_initial_data()

    def seed_initial_data(self):
        """Seeding 6 Master Patented Templates, Default Fleet, Default Routes, and Default Trips"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            # Check if vehicle_templates table is empty
            cursor.execute("SELECT COUNT(*) FROM vehicle_templates")
            if cursor.fetchone()[0] == 0:
                templates = [
                    (
                        'hatchtech', 'HatchTech HatchTraveller 38400', 'HatchTech B.V.', 'Netherlands',
                        38400, 'HVAC', 8.5, 15000.0, 2800.0, 0.0, 'front_to_rear', '[1, 3]',
                        'AUX_GENSET', 24, 65.0, 25.0,
                        '8-Probe MicroClimer PT100 2-Zone, SHT31 RH, SenseAir S8 NDIR, 3-Axis Accelerometer, Door Reed Switch, 1 Hz GPS',
                        json.dumps(["Uniform low-velocity laminar airflow distribution", "Eliminates hot and cold thermal spots", "Independent 2-zone microclimate control"])
                    ),
                    (
                        'heering', 'Heering Link Telematics Chick Trailer', 'Heering Holland', 'Netherlands',
                        50000, 'HVAC', 10.0, 12000.0, 3200.0, 0.0, 'top_to_bottom', '[1, 2, 3]',
                        'AUX_GENSET', 12, 80.0, 25.0,
                        'Multi-point RHT Probe, CO2 NDIR, Motorized Air Damper, Door Reed Switch, Genset Telemetry Logger',
                        json.dumps(["Multi-fan roof array with 12 suction exhaust fans", "Motorized proportional air inlet damper", "Heering Link 4G telematics system"])
                    ),
                    (
                        'thermoking', 'Thermo King UT-Series Reefer Truck', 'Thermo King Corp', 'Ireland',
                        60000, 'HVAC', 12.0, 18000.0, 3500.0, 0.0, 'ceiling_ducted', '[1, 2, 3]',
                        'ENGINE', 12, 90.0, 25.0,
                        'CargoWatch Data Logger 6x PT1000 Probes, TracKing Telematics GPS/4G, Optical CO2, Door Sensor',
                        json.dumps(["Heavy-duty high-capacity underslung cooling unit", "EN 12830 certified data logger", "Smart Reefer microprocessor control system"])
                    ),
                    (
                        'carrier', 'Carrier Transicold Lynx Fleet Carrier', 'Carrier Transicold', 'United States',
                        45000, 'HVAC', 9.5, 14000.0, 3000.0, 0.0, 'front_return', '[1, 2, 3]',
                        'AUX_GENSET', 24, 75.0, 25.0,
                        'Lynx IoT Edge Hub, Wireless RHT Sensor Node, CO2 NDIR, Shock Sensor, Solenoid Door Lock',
                        json.dumps(["Lynx Fleet Cloud intelligent telematics platform", "Edge gateway temperature analytics integration", "High-efficiency electric scroll compressor"])
                    ),
                    (
                        'chengli', 'Chengli Special Automobile Poultry Carrier', 'Chengli Automobile Co.', 'China',
                        30000, 'HVAC', 6.5, 9000.0, 2000.0, 0.0, 'top_to_bottom', '[1, 2, 3]',
                        'AUX_GENSET', 12, 50.0, 25.0,
                        '3-Zone Thermocouple Sensors, Analog Humidity Sensor, Roof Exhaust Fan Tachometer, Cabin Console',
                        json.dumps(["Economical poultry transport bodywork with roof ventilation", "Combined roof exhaust suction and lower body passive air louvers", "Auxiliary booster blower in rear cargo door area"])
                    ),
                    (
                        'joinaldy', 'Tropical Blower Modified Truck (Audy Joinaldy 2020)', 'IPB Empirical Field Research', 'Indonesia',
                        36000, 'REGRESSION', 0.0, 8500.0, 8500.0, 0.06, 'roof_to_rear', '[1, 3]',
                        'BATTERY', 12, 45.0, 26.0,
                        'Ambient & Cargo Box Temp (Y=1.2385X - 6.2567), RH Sensor, CO2 NDIR, 3-Axis Accelerometer, GPS',
                        json.dumps(["Empirical dissertation benchmark from IPB University by Audy Joinaldy (2020)", "Representative model of conventional non-refrigerated transport", "Demonstrates critical THI elevation (>160) during midday heat / traffic delays"])
                    )
                ]
                cursor.executemany("""
                INSERT INTO vehicle_templates (
                    template_key, model_name, vendor, country, capacity_doc, thermal_mode,
                    cooling_capacity_kw, airflow_m3h, fresh_air_max_m3h, passive_inlet_area_m2,
                    airflow_direction, sensor_zones_json, power_source, nominal_voltage_v,
                    fuel_tank_l, temperature_setpoint_c, sensor_suite_desc, features_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, templates)

            # Check initial vehicles
            cursor.execute("SELECT COUNT(*) FROM vehicles")
            if cursor.fetchone()[0] == 0:
                vehicles = [
                    ('TRUCK-AJ-36000-01', 'DD 8741 XY', 'joinaldy', 'Audy Joinaldy Tropical Blower Truck 01', 'AVAILABLE', 'Empirical Research Fleet Unit 1'),
                    ('TRUCK-AJ-36000-02', 'DD 8129 AB', 'joinaldy', 'Audy Joinaldy Tropical Blower Truck 02', 'AVAILABLE', 'Empirical Research Fleet Unit 2'),
                    ('TRUCK-HT-38400-01', 'B 9201 TPA', 'hatchtech', 'HatchTech HatchTraveller Flagship', 'AVAILABLE', 'Laminar HVAC Refrigerated Unit')
                ]
                cursor.executemany("""
                INSERT INTO vehicles (truck_id, plate_number, template_key, display_name, status, notes)
                VALUES (?, ?, ?, ?, ?, ?)
                """, vehicles)

            # Default initial route seeding (pure in-memory seed, zero file dependency)
            cursor.execute("SELECT COUNT(*) FROM routes")
            if cursor.fetchone()[0] == 0:
                default_coords = [
                    [107.7600, -6.5650], [107.7200, -6.5520], [107.6750, -6.5380], [107.5600, -6.4950],
                    [107.5050, -6.4680], [107.4500, -6.4420], [107.4000, -6.4180], [107.3800, -6.4010],
                    [107.3100, -6.3680], [107.2100, -6.3250], [107.1200, -6.3000], [107.0100, -6.2650],
                    [106.9600, -6.2550], [106.8900, -6.3100], [106.8950, -6.3720], [106.8850, -6.4500],
                    [106.8650, -6.4950], [106.8550, -6.5350], [106.8250, -6.5820], [106.8120, -6.5920],
                    [106.7990, -6.5980]
                ]
                rdata = {
                    "type": "Feature",
                    "properties": {
                        "route_name": "Subang Hatchery - Bogor Broiler Farm Expressway Corridor",
                        "origin_name": "Subang Hatchery (KM 0)",
                        "destination_name": "Bogor Broiler Farm (KM 145)",
                        "road_length_km": 145.0,
                        "estimated_duration_min": 175.0,
                        "route_type": "TOLL_HIGHWAY"
                    },
                    "geometry": {
                        "type": "LineString",
                        "coordinates": default_coords
                    }
                }
                cursor.execute("""
                INSERT INTO routes (
                    route_id, origin_name, origin_lat, origin_lng, destination_name,
                    destination_lat, destination_lng, route_type, total_distance_km,
                    estimated_duration_min, waypoints_count, waypoints_geojson
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    'ROUTE-SBG-BGR-TOLL',
                    'Subang Hatchery (KM 0)',
                    -6.5650, 107.7600,
                    'Bogor Broiler Farm (KM 145)',
                    -6.5980, 106.7990,
                    'TOLL_HIGHWAY',
                    145.0, 175.0, len(default_coords),
                    json.dumps(rdata)
                ))

            conn.commit()

    # --- Query Methods ---
    def get_templates(self) -> List[Dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM vehicle_templates")
            rows = cursor.fetchall()
            result = []
            for r in rows:
                d = dict(r)
                d["sensor_zones"] = json.loads(d["sensor_zones_json"])
                d["features"] = json.loads(d["features_json"])
                result.append(d)
            return result

    def get_template(self, template_key: str) -> Optional[Dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM vehicle_templates WHERE template_key = ?", (template_key,))
            row = cursor.fetchone()
            if not row:
                return None
            d = dict(row)
            d["sensor_zones"] = json.loads(d["sensor_zones_json"])
            d["features"] = json.loads(d["features_json"])
            return d

    def get_vehicles(self) -> List[Dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            SELECT v.*, t.model_name, t.capacity_doc, t.thermal_mode, t.cooling_capacity_kw, t.temperature_setpoint_c
            FROM vehicles v
            JOIN vehicle_templates t ON v.template_key = t.template_key
            ORDER BY v.truck_id ASC
            """)
            return [dict(r) for r in cursor.fetchall()]

    def get_vehicle(self, truck_id: str) -> Optional[Dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            SELECT v.*, t.model_name, t.capacity_doc, t.thermal_mode, t.cooling_capacity_kw, t.temperature_setpoint_c
            FROM vehicles v
            JOIN vehicle_templates t ON v.template_key = t.template_key
            WHERE v.truck_id = ?
            """, (truck_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def update_vehicle_last_position(
        self,
        truck_id: str,
        lat: float,
        lng: float,
        location_name: str = "Subang Hatchery Pool",
        speed_kmh: float = 0.0,
        status: Optional[str] = None
    ):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            if status:
                cursor.execute("""
                UPDATE vehicles
                SET last_latitude = ?, last_longitude = ?, last_location_name = ?, last_speed_kmh = ?,
                    status = ?, last_telemetry_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE truck_id = ?
                """, (lat, lng, location_name, speed_kmh, status, truck_id))
            else:
                cursor.execute("""
                UPDATE vehicles
                SET last_latitude = ?, last_longitude = ?, last_location_name = ?, last_speed_kmh = ?,
                    last_telemetry_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE truck_id = ?
                """, (lat, lng, location_name, speed_kmh, truck_id))
            conn.commit()

    def get_trips(self) -> List[Dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            SELECT tr.*, v.plate_number, v.template_key, r.origin_name, r.destination_name, r.total_distance_km
            FROM trips tr
            JOIN vehicles v ON tr.truck_id = v.truck_id
            JOIN routes r ON tr.route_id = r.route_id
            ORDER BY tr.created_at DESC
            """)
            return [dict(r) for r in cursor.fetchall()]

    def get_trip(self, trip_id: str) -> Optional[Dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            SELECT tr.*, v.plate_number, v.template_key, r.origin_name, r.destination_name, r.total_distance_km, r.waypoints_geojson
            FROM trips tr
            JOIN vehicles v ON tr.truck_id = v.truck_id
            JOIN routes r ON tr.route_id = r.route_id
            WHERE tr.trip_id = ?
            """, (trip_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def update_trip_status(self, trip_id: str, status: str):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE trips SET status = ? WHERE trip_id = ?", (status, trip_id))
            conn.commit()

    def insert_trip(self, trip_dict: Dict[str, Any]):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            truck_id = trip_dict.get("truck_id", "TRUCK-AJ-36000-01")
            cursor.execute("SELECT 1 FROM vehicles WHERE truck_id = ?", (truck_id,))
            if not cursor.fetchone():
                cursor.execute("""
                INSERT OR IGNORE INTO vehicles (truck_id, plate_number, template_key, display_name, status, notes)
                VALUES (?, ?, 'joinaldy', ?, 'AVAILABLE', 'Auto-registered from UI')
                """, (truck_id, trip_dict.get("license_plate", "DD 8741 XY"), f"Armada {truck_id}"))

            route_id = trip_dict.get("route_id") or ("ROUTE-SBG-BGR-NON_TOLL" if trip_dict.get("route_type") == "NON_TOLL" else "ROUTE-SBG-BGR-TOLL")
            cursor.execute("SELECT 1 FROM routes WHERE route_id = ?", (route_id,))
            if not cursor.fetchone():
                route_id = "ROUTE-SBG-BGR-TOLL"

            telemetry_path = trip_dict.get("telemetry_file_path") or str(DATA_DIR / "trips" / f"telemetry_{trip_dict['trip_id']}.jsonl")
            dep_date = trip_dict.get("departure_date") or datetime.now().strftime("%Y-%m-%d")
            cursor.execute("""
            INSERT OR REPLACE INTO trips (
                trip_id, truck_id, delivery_order, driver_name, route_id,
                cargo_strain, cargo_quantity, average_weight_g, box_type,
                chicks_per_box, departure_date, departure_time, weather, telemetry_file_path, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                trip_dict["trip_id"],
                truck_id,
                trip_dict.get("delivery_order") or f"DO-CPI-SBG-{trip_dict['trip_id'].replace('TRIP-', '')}",
                trip_dict.get("driver_name") or "Rahmat Santoso",
                route_id,
                trip_dict.get("cargo_strain") or "Cobb 500",
                int(trip_dict.get("cargo_quantity") or 36000),
                float(trip_dict.get("average_weight_g") or 42.0),
                trip_dict.get("box_type") or "PLASTIC_CRATE",
                int(trip_dict.get("chicks_per_box") or 100),
                dep_date,
                trip_dict.get("departure_time") or "08:00",
                trip_dict.get("weather") or "SUNNY",
                telemetry_path,
                trip_dict.get("status") or "SCHEDULED"
            ))
            conn.commit()

    def delete_trip(self, trip_id: str) -> bool:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM trips WHERE trip_id = ?", (trip_id,))
            deleted = cursor.rowcount > 0
            conn.commit()

        # Hapus berkas log telemetri jika ada
        log_file = DATA_DIR / "trips" / f"telemetry_{trip_id}.jsonl"
        if log_file.exists():
            try: log_file.unlink()
            except Exception: pass
        gt_file = DATA_DIR / "trips" / f"ground_truth_{trip_id}.jsonl"
        if gt_file.exists():
            try: gt_file.unlink()
            except Exception: pass

        return deleted

    def clear_trips(self, reseed_default: bool = False) -> int:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM trips")
            count = cursor.rowcount

            # Hapus semua log telemetri di folder trips
            trips_dir = DATA_DIR / "trips"
            if trips_dir.exists():
                for f in trips_dir.glob("*.jsonl"):
                    try: f.unlink()
                    except Exception: pass

            if reseed_default:
                telemetry_path = str(trips_dir / "telemetry_TRIP-20261030-01.jsonl")
                cursor.execute("""
                INSERT INTO trips (
                    trip_id, truck_id, delivery_order, driver_name, route_id,
                    cargo_strain, cargo_quantity, average_weight_g, box_type,
                    chicks_per_box, departure_time, weather, telemetry_file_path, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    'TRIP-20261030-01',
                    'TRUCK-AJ-36000-01',
                    'DO-CPI-SBG-20261030-01',
                    'Rahmat Santoso',
                    'ROUTE-SBG-BGR-TOLL',
                    'Cobb 500', 36000, 42.0, 'PLASTIC_CRATE', 100,
                    '08:00', 'SUNNY', telemetry_path, 'SCHEDULED'
                ))

            conn.commit()
            return count

    def get_route(self, route_id: str) -> Optional[Dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM routes WHERE route_id = ?", (route_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def update_vehicle_last_position(
        self,
        truck_id: str,
        lat: float,
        lng: float,
        location_name: str = "Subang Hatchery Pool",
        speed_kmh: float = 0.0,
        status: Optional[str] = None
    ):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            if status:
                cursor.execute("""
                UPDATE vehicles
                SET last_latitude = ?, last_longitude = ?, last_location_name = ?, last_speed_kmh = ?,
                    status = ?, last_telemetry_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE truck_id = ?
                """, (lat, lng, location_name, speed_kmh, status, truck_id))
            else:
                cursor.execute("""
                UPDATE vehicles
                SET last_latitude = ?, last_longitude = ?, last_location_name = ?, last_speed_kmh = ?,
                    last_telemetry_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE truck_id = ?
                """, (lat, lng, location_name, speed_kmh, truck_id))
            conn.commit()

    def save_route(self, route_data: Dict[str, Any]):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            INSERT OR REPLACE INTO routes (
                route_id, origin_name, origin_lat, origin_lng, destination_name,
                destination_lat, destination_lng, route_type, total_distance_km,
                estimated_duration_min, waypoints_count, waypoints_geojson
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                route_data["route_id"],
                route_data["origin_name"],
                route_data["origin_lat"],
                route_data["origin_lng"],
                route_data["destination_name"],
                route_data["destination_lat"],
                route_data["destination_lng"],
                route_data.get("route_type", "TOLL_HIGHWAY"),
                route_data["total_distance_km"],
                route_data.get("estimated_duration_min", 150),
                route_data.get("waypoints_count", 0),
                route_data["waypoints_geojson"]
            ))
            conn.commit()

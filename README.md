# Phase 3: Implementation & Software Architecture (DOC IoT Truck Simulator)

## 📌 Technical Summary
Phase 3 establishes an end-to-end, high-fidelity empirical simulation testbed developed from scratch in **Python 3.10+**. The system incorporates an asynchronous web framework (**FastAPI**), an ASGI server (**Uvicorn**), a relational metadata database (**SQLite** `metadata.db`), high-performance append-only telemetry logging (**JSON Lines** `.jsonl`), and dynamic road routing integration (**OSRM / OpenStreetMap**).

The service is deployed in production as a continuous *systemd background daemon* behind a reverse proxy with TLS v1.3 encryption:
🌐 **`https://truck-simulator.devnap.cloud`**

---

## 📂 Modular Architecture & Source Tree (`src/`)

```text
03_implementation/
├── configs/
│   └── routes/
│       └── waypoints_subang_bogor.json   # Local fallback cache for Subang - Bogor corridor (145 km)
│
├── data/
│   ├── metadata.db                       # Relational SQLite master metadata database
│   └── trips/
│       ├── telemetry_TRIP-20261030-01.jsonl    # Canonical 25-field raw sensor stream log
│       └── ground_truth_TRIP-20261030-01.jsonl # Noise-free physical ground truth log
│
├── src/
│   ├── storage/
│   │   ├── db_manager.py                 # SQLite connection pool & 6 Patented Templates seed
│   │   └── jsonl_logger.py               # O(1) Append-only asynchronous file writer
│   │
│   ├── routing/
│   │   ├── osrm_client.py                # Asynchronous OSRM API routing client (Expressway vs Arterial)
│   │   └── route_manager.py              # Geodesic kinematics: Haversine distance, bearing, & path interpolator
│   │
│   ├── simulation/
│   │   ├── core/
│   │   │   ├── clock.py                  # Simulation discrete clock & time scaler (1x - 50x)
│   │   │   ├── state.py                  # State manager (Ground Truth vs Reported Telemetry)
│   │   │   ├── engine.py                 # 16-Stage Deterministic Physics Tick Pipeline
│   │   │   └── manager.py                # Multi-truck concurrent runner (asyncio lifecycle tasks)
│   │   ├── physics/
│   │   │   ├── environment.py            # Diurnal ambient model: T_amb, RH_amb, and solar radiation
│   │   │   ├── kinematics.py             # Roadway-dependent kinematic acceleration & braking
│   │   │   ├── vibration.py              # Stochastic 3-axis vibration filter (ISO 8608 road roughness)
│   │   │   ├── thermal.py                # Lumped-parameter thermal balance ODE & Audy Joinaldy empirical regression
│   │   │   ├── air_quality.py            # CO2 metabolic respiration mass balance & forced ventilation
│   │   │   ├── moisture.py               # Moisture balance ODE & relative humidity (%RH)
│   │   │   └── power.py                  # Auxiliary fuel consumption & 24V control battery dynamics
│   │   └── pipeline/
│   │       ├── biometrics.py             # Cobb-Vantress THI, enthalpy, & Khosravinia weight loss
│   │       ├── canonical_hasher.py       # SHA-256 canonical cryptographic tamper-evident hash chain
│   │       └── payload_builder.py        # Pydantic v2 strict validator for 25-field contract
│   │
│   └── web/
│       ├── app.py                        # FastAPI application entry-point & lifespan management
│       ├── routes/
│       │   ├── simulation.py             # REST API for simulation lifecycle, actuators, & fault suite
│       │   ├── fleet.py                  # REST API for fleet registry, templates, & dispatch manifests
│       │   ├── routes_api.py             # REST API for dynamic OSRM road route generation
│       │   └── export.py                 # REST API for .jsonl log & ground truth export
│       ├── ws/
│       │   └── broadcaster.py            # Bi-directional 1.0 Hz WebSocket telemetry broadcaster
│       └── static/                       # Client web interfaces (monitor & testbed console)
│
├── main.py                               # CLI entry-point & Uvicorn runner
└── requirements.txt                      # Python runtime dependencies
```

---

## 🛠️ System Daemon Management (Systemd)

The FastAPI simulation backend runs as a high-availability background service:

```bash
# Check service health
systemctl status truck-simulator

# Restart service
systemctl restart truck-simulator

# Inspect real-time streaming logs
journalctl -u truck-simulator -f
```

---

## 📡 API & Telemetry Ingestion Guide

### 1. Interactive OpenAPI / Swagger UI
Explore and interact with live endpoints:
🔗 **`https://truck-simulator.devnap.cloud/docs`**

### 2. Real-Time Telemetry Stream (WebSocket)
Connect via Postman, wscat, or client application:
* **WebSocket URL**: 
  `wss://truck-simulator.devnap.cloud/ws/telemetry`  
  *(Or trip-specific stream: `wss://truck-simulator.devnap.cloud/ws/telemetry/TRIP-20261030-01`)*
* Click **Connect**.
* The server streams standardized 25-field JSON packets at 1.0 Hz.
* Send text `"ping"` to receive keepalive response `"pong"`.

### 3. Simulation Lifecycle & Controls (REST API)
* **Start Simulation**:
  `POST https://truck-simulator.devnap.cloud/api/v1/simulation/start`  
  Payload: `{"trip_id": "TRIP-20261030-01"}`
* **Pause Simulation**:
  `POST https://truck-simulator.devnap.cloud/api/v1/simulation/pause`  
  Payload: `{"trip_id": "TRIP-20261030-01"}`
* **Retrieve Latest Snapshot**:
  `GET https://truck-simulator.devnap.cloud/api/v1/simulation/latest?trip_id=TRIP-20261030-01`
* **Inject Fault / Anomaly**:
  `POST https://truck-simulator.devnap.cloud/api/v1/simulation/inject-fault`  
  Payload: `{"trip_id": "TRIP-20261030-01", "anomaly_type": "DOOR_OPEN", "active": true}`
* **Dynamic Route Generation (OSRM)**:
  `POST https://truck-simulator.devnap.cloud/api/v1/routes/generate`  
  Payload:
  ```json
  {
    "origin_name": "Subang Hatchery",
    "origin_lat": -6.5650,
    "origin_lng": 107.7600,
    "destination_name": "Bogor Broiler Farm",
    "destination_lat": -6.5980,
    "destination_lng": 106.7990,
    "route_type": "TOLL_HIGHWAY"
  }
  ```
* **Export Telemetry Logs (.jsonl)**:
  `GET https://truck-simulator.devnap.cloud/api/v1/simulation/export/jsonl?trip_id=TRIP-20261030-01`

---

## 🚪 Verification & Acceptance Checklist

- [x] **Master Database Seeding**: Relational SQLite database `metadata.db` auto-initialized with 6 patented vendor templates and registered fleet units.
- [x] **Dynamic OSRM Routing**: Asynchronous route calculation returning real roadway GeoJSON coordinates for toll expressways and non-toll arterial alternatives.
- [x] **Thermal & Respiration Differential Physics**: Stable numerical resolution of lumped-parameter thermal balance ODEs, Audy Joinaldy empirical regressions, and chick $CO_2$ mass respiration balances.
- [x] **Data Contract Integrity**: 25-field canonical telemetry payload schema validated via Pydantic v2.
- [x] **Cryptographic Hash Chain**: Canonical SHA-256 state hashing computed deterministically per simulation tick.
- [x] **Append-Only Logging**: Simultaneous persistence of raw reported sensor streams and ground truth logs to `.jsonl` files.
- [x] **Production Deployment**: Active TLS v1.3 SSL certificate on `truck-simulator.devnap.cloud`.
- [x] **Bi-Directional Telemetry Stream**: Verified real-time client ingestion via WebSocket `wss://truck-simulator.devnap.cloud/ws/telemetry`.

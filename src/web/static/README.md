# Telemetry Monitoring Dashboard & Simulation Testbed Console

This web client architecture provides a **complete separation of concerns between the production-facing telematics monitoring application and the underlying internal simulation engine**. The codebase is engineered entirely in **Vanilla ECMAScript Modules (ESM)** without build steps or third-party bundle bloat, ensuring maximum modularity, inspectability, and long-term academic maintainability.

1. **Production Telemetry Monitor (`monitor/` & Root URL)**:
   - Designed for cold-chain logistics operations, hatchery dispatchers, and receiving broiler farms.
   - Displays real-time 1.0 Hz telemetry of trucks traveling the Subang Hatchery &rarr; Bogor Broiler Farm transport corridor.
   - Contains no simulation control buttons or developer harness elements.
2. **Simulation Engine Console (`config/`)**:
   - Internal testbed and harness environment for research and evaluation.
   - Enables operators to manipulate physical parameters, road conditions, actuator setpoints, and trigger controlled fault injections (HVAC compressor breakdowns, door breaches, blower jams, cellular blind spots, and cryptographic sequence tampering).

---

## 🌐 Live Service URLs (HTTPS & TLS v1.3)

- **Production Telemetry Monitor (User-Facing)**:  
  [https://truck-simulator.devnap.cloud/monitor/](https://truck-simulator.devnap.cloud/monitor/)
- **Simulation Engine Console (Internal Testbed)**:  
  [https://truck-simulator.devnap.cloud/config/](https://truck-simulator.devnap.cloud/config/)

---

## 📂 Modular Architecture (ES Modules)

```text
static/
├── index.html                  # Entry point (auto-redirect to production telemetry monitor)
├── README.md                   # Technical documentation and architecture guide
│
├── shared/                     # SHARED DOMAIN & MATHEMATICAL UTILITIES
│   ├── constants.js            # Storage keys, 145 km route waypoints, road roughness, fleet templates
│   ├── geo.js                  # Geodesic kinematics: Haversine distance, calculateBearing, interpolateDensePath
│   ├── biometrics.js           # Empirical formulations: Cobb-Vantress THI, Khosravinia weight loss %, mortality evaluation
│   └── crypto.js               # Canonical SHA-256 state hashing (sha256Sync)
│
├── monitor/                    # PRODUCTION TELEMETRY MONITOR (USER FACING)
│   ├── index.html              # Clean single-page application shell (<script type="module" src="app.js"></script>)
│   ├── style.css               # Telematics command deck stylesheet
│   ├── app.js                  # ESM entry point, WebSocket listener & DOM event orchestration
│   └── modules/
│       ├── state.js            # Client-side cache, graph history buffer, active expedition tracker
│       ├── map.js              # Leaflet.js controller: rotated top-view vehicle SVG & geodesic trails
│       ├── chart.js            # Chart.js streaming: multi-zone microclimate & kinematic telemetry
│       ├── trip-selector.js    # Dispatch selector dropdown & summary status pill synchronization
│       └── consumer.js         # 25-field telemetry ingestion, microclimate cards, watchdog timer
│
└── config/                     # SIMULATION ENGINE CONSOLE (INTERNAL HARNESS)
    ├── index.html              # Operator testbed interface shell
    ├── style.css               # Control console stylesheet
    ├── app.js                  # ESM entry point and bootstrapper
    └── modules/
        ├── state.js            # Engine runtime state, fleet registry, manifests, fuel/battery quotas
        ├── engine.js           # Kinematic integration, 3-zone thermal ODE, CO2 mass balance, anomaly triggers
        ├── telemetry.js        # Telemetry packet dispatcher via BroadcastChannel & LocalStorage
        └── ui.js               # Manifest table renderer, floating rightbar, modal forms, and event listeners
```

---

## 🔄 Separation of Concerns & State Synchronization

1. **Client Observer (`/monitor/`)**:
   - Opens `https://truck-simulator.devnap.cloud/monitor/` and receives live telemetry.
   - Ingests structured 25-field telemetry streams (biometrics, cargo zones, ambient conditions, vehicle kinematics, sensor integrity, and cryptographic audit hash).
2. **Simulation Operator (`/config/`)**:
   - Runs `https://truck-simulator.devnap.cloud/config/` in an operator session.
   - Adjusts road conditions across 5 distinct route segments, modifies fan blowers and dampers.
   - Conducts **Controlled Fault Injections**:
     - ❄️ HVAC Chiller Breakdown / Compressor shutdown
     - 🚪 Cargo Door breach exceeding safety thresholds
     - 🌬️ Ventilation Blower Jam (damper closure with CO2 spike)
     - 🛑 Emergency Braking / Traffic congestion
     - ⚡ Reefer fuel depletion (<15%) & auxiliary battery drop (<11.5V)
     - 🔬 Sensor anomalies: Drift, Stuck-at Freeze, Outlier Spike, Null Packet Drop
     - 📶 Cellular Blind Spot (Gilbert-Elliott Channel Model with local buffering)
     - 🔀 Sequence gap jump (tampering test for blockchain consensus audit)
   - Dispatches changes immediately via browser IPC `BroadcastChannel("truck_telematics_stream")` and backend REST APIs.

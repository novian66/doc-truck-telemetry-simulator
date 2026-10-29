# Fase 3: Implementasi & Koding (Implementation & Coding)

## 📌 Ringkasan Fase
Fase 3 telah berhasil diselesaikan secara penuh dari baris kode nol (*scratch*). Seluruh modul koding tersusun modular berbasis bahasa pemrograman **Python 3.10+** dengan web framework **FastAPI**, server asinkron **Uvicorn**, database master **SQLite (`metadata.db`)**, penyimpanan log append-only **JSON Lines (`.jsonl`)**, dan integrasi routing **OSRM OpenStreetMap**.

Sistem saat ini telah aktif berjalan sebagai *background service systemd* di domain resmi dengan sertifikat SSL TLS v1.3:
🌐 **`https://truck-simulator.devnap.cloud`**

---

## 📂 Struktur Source Code Modular (`src/`)

```text
03_implementation/
├── configs/
│   └── routes/
│       └── waypoints_subang_bogor.json   # Cache rute fallback lokal Subang - Bogor (145 km)
│
├── data/
│   ├── metadata.db                       # Database Relasional SQLite Master
│   └── trips/
│       ├── telemetry_TRIP-20261030-01.jsonl    # Log Aliran Sensor Plain Text 25-Field
│       └── ground_truth_TRIP-20261030-01.jsonl # Log Ground Truth Murni Tanpa Derau
│
├── src/
│   ├── storage/
│   │   ├── db_manager.py                 # SQLite connection & Seeding 6 Template Paten
│   │   └── jsonl_logger.py               # Append-only file writer O(1) untuk .jsonl
│   │
│   ├── routing/
│   │   ├── osrm_client.py                # Asynchronous OSRM API Client (Tol vs Non-Tol)
│   │   └── route_manager.py              # Haversine distance, bearing, & koordinat interpolator
│   │
│   ├── simulation/
│   │   ├── core/
│   │   │   ├── clock.py                  # Simulation clock & speed scaler (1x - 50x)
│   │   │   ├── state.py                  # State manager (Ground Truth vs Reported Sensor)
│   │   │   ├── engine.py                 # 16-Stage Deterministic Physics Tick Loop
│   │   │   └── manager.py                # Multi-truck concurrent runner (asyncio tasks)
│   │   ├── physics/
│   │   │   ├── environment.py            # Profil diurnal T_amb, RH_amb, I_solar
│   │   │   ├── kinematics.py             # Kecepatan aktual & pengereman berbasis kondisi jalan
│   │   │   ├── vibration.py              # Filter stokastik getaran ISO 8608 (a_z)
│   │   │   ├── thermal.py                # Neraca kalor lumped-parameter ODE & mode Audy Joinaldy
│   │   │   ├── air_quality.py            # Neraca massa CO2 respirasi bibit & ventilasi segar
│   │   │   ├── moisture.py               # Neraca uap air & kelembaban relatif (%RH)
│   │   │   └── power.py                  # Konsumsi BBM genset & tegangan aki
│   │   └── pipeline/
│   │       ├── biometrics.py             # THI Cobb-Vantress, entalpi, & susut bobot Khosravinia
│   │       ├── canonical_hasher.py       # Rantai integritas kriptografis SHA-256
│   │       └── payload_builder.py        # Pydantic v2 validator untuk skema baku 25-field
│   │
│   └── web/
│       ├── app.py                        # FastAPI Application & Lifespan
│       ├── routes/
│       │   ├── simulation.py             # REST API Lifecycle & Scenario Routes
│       │   ├── fleet.py                  # REST API Master Templates & Armada
│       │   ├── routes_api.py             # REST API Dynamic Routing (OSRM)
│       │   └── export.py                 # REST API Unduh .jsonl & Ground Truth
│       ├── ws/
│       │   └── broadcaster.py            # WebSocket Hub & Broadcaster duplex 1 Hz
│       └── static/                       # Aset web antarmuka
│
├── main.py                               # Entry-Point CLI & Server Runner
└── requirements.txt                      # Dependensi Python
```

---

## 🛠️ Layanan Server (Systemd Background Service)

Backend FastAPI dikelola oleh systemd service `truck-simulator.service`:

```bash
# Cek status layanan
systemctl status truck-simulator

# Restart layanan
systemctl restart truck-simulator

# Melihat log streaming server
journalctl -u truck-simulator -f
```

---

## 📡 Panduan Konsumsi API & Telemetri via Postman

### 1. Dokumentasi Interaktif Swagger UI
Buka di browser atau Postman:
🔗 **`https://truck-simulator.devnap.cloud/docs`**

### 2. Konsumsi Streaming Telemetri Real-Time (WebSocket)
Di Postman, buat request baru dengan tipe **WebSocket Request**:
* **URL WebSocket**: 
  `wss://truck-simulator.devnap.cloud/ws/telemetry`  
  *(Atau khusus satu perjalanan: `wss://truck-simulator.devnap.cloud/ws/telemetry/TRIP-20261030-01`)*
* Klik **Connect**.
* Server akan otomatis mengalirkan paket data 25-field JSON setiap 1 detik.
* Kirim pesan teks `"ping"` untuk menerima balasan `"pong"` (*keepalive*).

### 3. Kontrol Siklus Simulasi (REST API)
* **Start Simulasi**:
  `POST https://truck-simulator.devnap.cloud/api/v1/simulation/start`
  Body (JSON): `{"trip_id": "TRIP-20261030-01"}`
* **Pause Simulasi**:
  `POST https://truck-simulator.devnap.cloud/api/v1/simulation/pause`
  Body (JSON): `{"trip_id": "TRIP-20261030-01"}`
* **Ambil Payload Terakhir**:
  `GET https://truck-simulator.devnap.cloud/api/v1/simulation/latest?trip_id=TRIP-20261030-01`
* **Injeksi Gangguan (Fault Injection)**:
  `POST https://truck-simulator.devnap.cloud/api/v1/simulation/inject-fault`
  Body (JSON): `{"trip_id": "TRIP-20261030-01", "anomaly_type": "DOOR_OPEN", "active": true}`
* **Kalkulasi Rute Dinamis (OSRM)**:
  `POST https://truck-simulator.devnap.cloud/api/v1/routes/generate`
  Body (JSON):
  ```json
  {
    "origin_name": "Subang Hatchery",
    "origin_lat": -6.5650,
    "origin_lng": 107.7600,
    "destination_name": "Bogor Farm",
    "destination_lat": -6.5980,
    "destination_lng": 106.7990,
    "route_type": "TOLL_HIGHWAY"
  }
  ```
* **Unduh Berkas Log Telemetri (.jsonl)**:
  `GET https://truck-simulator.devnap.cloud/api/v1/simulation/export/jsonl?trip_id=TRIP-20261030-01`

---

## 🚪 Gate 3 Checklist (Kriteria Kelulusan)

- [x] Database master SQLite `metadata.db` terbuat dan terisi otomatis dengan 6 Template Paten Industri dan Armada terdaftar.
- [x] Integrasi OSRM Routing dinamis mengembalikan GeoJSON koordinat jalan raya nyata (Tol vs Non-Tol).
- [x] Persamaan diferensial fisika termal (lumped ODE + regresi Audy Joinaldy) dan respirasi $CO_2$ berjalan akurat dan stabil.
- [x] Skema baku 25 field tervalidasi Pydantic v2 tanpa error.
- [x] Rantai integritas kriptografis SHA-256 terhitung kanonikal di setiap tick.
- [x] Log aliran telemetri append-only tertulis secara instan di berkas `.jsonl`.
- [x] Domain `truck-simulator.devnap.cloud` aktif dengan sertifikat SSL Let's Encrypt TLS v1.3.
- [x] WebSocket `wss://truck-simulator.devnap.cloud/ws/telemetry` terverifikasi dapat dikonsumsi real-time oleh Postman.

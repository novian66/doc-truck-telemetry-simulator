# Purwarupa Sistem Pemantauan Nyata & Console Simulasi Internal (Fase 1: Analisis Kebutuhan)

Arsitektur mockup dirancang dengan **pemisahan total antara aplikasi pemantau telemetri yang dilihat pengguna dengan simulator engine di balik layar**, serta telah direfaktor secara penuh ke **Standar Modular ECMAScript (ES Modules / ESM)** sehingga kode terstruktur rapi, *single-responsibility*, dan mudah diuji maupun dikembangkan lebih lanjut.

1. **Sistem Pemantauan Nyata (`monitor/` & Root URL)**:
   - Aplikasi telematika & cold-chain logistik produksi nyata yang dilihat oleh pengguna umum, manajemen armada, QA hatchery, dan peternakan penerima.
   - Truk langsung berjalan nyata di jalan (Subang Hatchery &rarr; Bogor Broiler Farm) memancarkan telemetri 1 Hz.
   - Tidak ada tautan atau tombol yang mengarah ke simulator.
2. **Simulator Engine Console (`config/`)**:
   - Instrumen pengujian backend / internal simulator testbed.
   - Digunakan oleh insinyur simulasi untuk mengendalikan fisika, mengatur cuaca, memicu rem mendadak, atau menginjeksi kerusakan (chiller breakdown, sensor drift/spike/null, blank spot 4G) di balik layar.

---

## 🌐 Tautan Akses Live (HTTPS & SSL Aktif)

- **Sistem Pemantauan Nyata (Aplikasi Utama)**:  
  [https://mockup-truck-simulator.devnap.cloud/](https://mockup-truck-simulator.devnap.cloud/) (atau langsung ke `/monitor/`)
- **Simulator Engine Console (Internal Testing)**:  
  [https://mockup-truck-simulator.devnap.cloud/config/](https://mockup-truck-simulator.devnap.cloud/config/)

---

## 📂 Struktur Direktori Standar Modular ECMAScript (ES Modules)

```text
mockup/
├── index.html                  # Entry point utama (auto-redirect ke sistem pemantauan nyata)
├── README.md                   # Dokumentasi arsitektur dan panduan pengembang
│
├── shared/                     # MODUL BERSAMA (SHARED DOMAIN & MATH UTILITIES)
│   ├── constants.js            # Konstanta penyimpanan, waypoints 145 km, profil jalan, armada default
│   ├── geo.js                  # Kinematika geodesik: Haversine distance, calculateBearing, interpolateDensePath
│   ├── biometrics.js           # Formulasi empiris: THI Index, Weight Loss %, evaluasi status mortalitas
│   └── crypto.js               # Hashing kriptografis kanonikal murni: sha256Sync (Paper 1 Metode 12)
│
├── monitor/                    # SISTEM PEMANTAUAN TELEMETRI NYATA (USER FACING)
│   ├── index.html              # HTML shell dengan <script type="module" src="app.js"></script>
│   ├── style.css               # Desain pusat komando telematika armada logistik terpadu
│   ├── app.js                  # Entry point ESM monitor, inisialisasi listener & event binding
│   └── modules/
│       ├── state.js            # State monitor, buffer riwayat grafik, tracking ekspedisi terpilih
│       ├── map.js              # Leaflet.js controller: custom rotated truck marker SVG & polylines
│       ├── chart.js            # Chart.js streaming: multi-zona temperature & tab kinematika
│       ├── trip-selector.js    # Pengelolaan dropdown pengiriman & sinkronisasi header summary
│       └── consumer.js         # Telemetry packet ingestion 25-field, kartu mikroklimat, autonomous tick
│
└── config/                     # SIMULATOR ENGINE CONSOLE (INTERNAL HARNESS)
    ├── index.html              # HTML shell dengan <script type="module" src="app.js"></script>
    ├── style.css               # Antarmuka panel operator simulasi internal
    ├── app.js                  # Entry point ESM config console, bootstrapper aplikasi
    └── modules/
        ├── state.js            # State runtime mesin, daftar armada, ekspedisi, kuota bahan bakar/baterai
        ├── engine.js           # Kinematika pergerakan, ODE termodinamika 3-zona, CO2, injeksi anomali
        ├── telemetry.js        # Pemancar paket telemetri 25-field baku via BroadcastChannel & LocalStorage
        └── ui.js               # Render tabel pengiriman/truk, rightbar kontrol, modals, dan aksi tombol
```

---

## 🔄 Pemisahan & Mekanisme Sinkronisasi

1. **Pengguna Umum / Klien (`/monitor/`)**:
   - Membuka `https://mockup-truck-simulator.devnap.cloud/` dan langsung disajikan layar pemantauan armada nyata.
   - Truk bergerak aktif di jalan raya (Subang ke Bogor), kecepatan dinamis, suhu kargo teratur, status kargo optimal.
   - Mengonsumsi paket telemetri 25-field terstruktur (data kargo, lingkungan, sub-sistem, keamanan sensor, dan hash kanonikal).
2. **Insinyur Simulasi (`/config/`)**:
   - Membuka `https://mockup-truck-simulator.devnap.cloud/config/` di sesi tersendiri.
   - Mengatur skenario ekspedisi, mengubah kondisi jalan 5 segmen, memodifikasi aktuator (kecepatan kipas, damper udara).
   - Melakukan *Controlled Fault Injection*:
     - Chiller breakdown / HVAC shutdown
     - Pintu belakang terbuka melebihi batas toleransi
     - Kegagalan ventilasi kargo (damper tertutup, penumpukan CO2)
     - Kemacetan mendadak / insiden lalu lintas
     - Kehabisan bahan bakar genset pendingin & baterai drop
     - Anomali sensor: Sensor Drift, Sensor Freeze, Spike Anomali, Sensor Null
     - Blank Spot sinyal seluler 4G (Gilbert-Elliott Channel Model)
     - Sequence gap injection (tampering test untuk audit blockchain)
   - Seluruh perubahan dipancarkan secara instan melalui browser IPC `BroadcastChannel("truck_telematics_stream")` dan disimpan ke `localStorage`.

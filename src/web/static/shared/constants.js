/**
 * Shared System Constants & Default Datasets
 * Sesuai acuan data_truck.md dan literatur empiris logistik DOC (Audy Joinaldy 2020, Yerpes 2021, Onuk 2023)
 */

export const STORAGE_KEYS = {
  VEHICLES: "truck_sim_vehicles",
  EXPEDITIONS: "truck_sim_expeditions",
  ACTIVE_TRIP: "truck_sim_active_trip_id",
  TELEMETRY: "truck_sim_telemetry"
};

export const BROADCAST_CHANNEL_NAME = "truck_telematics_stream";

// Dispatch Route Configuration (Toll Highway vs Arterial Non-Toll)
// Based on OSRM / OpenStreetMap Waypoint Specifications
export const ROUTES_CONFIG = {
  TOLL: {
    key: "TOLL",
    name: "Toll",
    shortName: "Toll",
    distanceKm: 145.0,
    icon: "🛣️",
    speedMultiplier: 1.0,
    baseSpeed: 75,
    baseVibration: 0.08,
    description: "Preferensi rute jalan tol (dihasilkan melalui OSRM API)",
    waypoints: [
      { lat: -6.5650, lng: 107.7600, seg: 0, name: "Subang Hatchery (KM 0)" },
      { lat: -6.5520, lng: 107.7200, seg: 0, name: "Arteri Subang" },
      { lat: -6.5380, lng: 107.6750, seg: 0, name: "Kalijati" },
      { lat: -6.4950, lng: 107.5600, seg: 0, name: "GT Kalijati (KM 25)" },
      { lat: -6.4680, lng: 107.5050, seg: 1, name: "Tol Cipali KM 89" },
      { lat: -6.4420, lng: 107.4500, seg: 1, name: "Tol Cipali KM 82" },
      { lat: -6.4180, lng: 107.4000, seg: 1, name: "Tol Cipali KM 74" },
      { lat: -6.4010, lng: 107.3800, seg: 1, name: "Dawuan (KM 65)" },
      { lat: -6.3680, lng: 107.3100, seg: 2, name: "Japek KM 57" },
      { lat: -6.3250, lng: 107.2100, seg: 2, name: "Karawang Barat" },
      { lat: -6.3000, lng: 107.1200, seg: 2, name: "Cikarang Timur" },
      { lat: -6.2650, lng: 107.0100, seg: 2, name: "Cibitung" },
      { lat: -6.2550, lng: 106.9600, seg: 2, name: "Cikunir (KM 105)" },
      { lat: -6.3100, lng: 106.8900, seg: 3, name: "Tol Jagorawi KM 7" },
      { lat: -6.3720, lng: 106.8950, seg: 3, name: "Cibubur" },
      { lat: -6.4500, lng: 106.8850, seg: 3, name: "Cimanggis" },
      { lat: -6.4950, lng: 106.8650, seg: 3, name: "Citeureup" },
      { lat: -6.5350, lng: 106.8550, seg: 3, name: "Sentul Selatan (KM 135)" },
      { lat: -6.5820, lng: 106.8250, seg: 4, name: "GT Baranangsiang Bogor" },
      { lat: -6.5920, lng: 106.8120, seg: 4, name: "Arteri Bogor" },
      { lat: -6.5980, lng: 106.7990, seg: 4, name: "Bogor Broiler Farm (KM 145)" }
    ],
    segments: [
      { id: 1, name: "KM 0-25: Arteri Subang", sub: "Hatchery Hulu", distKm: 25 },
      { id: 2, name: "KM 25-65: Tol Cipali", sub: "Jalur Tol Utama", distKm: 40 },
      { id: 3, name: "KM 65-105: Tol Japek", sub: "Area Padat Industri", distKm: 40 },
      { id: 4, name: "KM 105-135: Tol Jagorawi", sub: "Perbukitan & Terowongan", distKm: 30 },
      { id: 5, name: "KM 135-145: Arteri Bogor", sub: "Farm Kedatangan Hilir", distKm: 10 }
    ]
  },
  NON_TOLL: {
    key: "NON_TOLL",
    name: "Non Toll",
    shortName: "Non Toll",
    distanceKm: 172.0,
    icon: "🛤️",
    speedMultiplier: 0.7,
    baseSpeed: 45,
    baseVibration: 0.16,
    description: "Preferensi rute menghindari jalan tol (dihasilkan melalui OSRM API exclude=toll)",
    waypoints: [
      { lat: -6.5650, lng: 107.7600, seg: 0, name: "Subang Hatchery (KM 0)" },
      { lat: -6.5520, lng: 107.7200, seg: 0, name: "Arteri Subang - Kalijati" },
      { lat: -6.5380, lng: 107.6750, seg: 0, name: "Kalijati Barat" },
      { lat: -6.5300, lng: 107.6000, seg: 0, name: "Arteri Cipeundeuy" },
      { lat: -6.5050, lng: 107.4650, seg: 0, name: "Simpang Sadang Purwakarta (KM 35)" },
      { lat: -6.4450, lng: 107.4580, seg: 1, name: "Arteri Cikampek (KM 48)" },
      { lat: -6.3850, lng: 107.3950, seg: 1, name: "Jalur Pantura Kosambi" },
      { lat: -6.3450, lng: 107.3350, seg: 1, name: "Klari Karawang Timur" },
      { lat: -6.3050, lng: 107.2950, seg: 1, name: "Arteri Karawang Kota (KM 75)" },
      { lat: -6.2850, lng: 107.1850, seg: 2, name: "Lemahabang Cikarang" },
      { lat: -6.3350, lng: 107.1400, seg: 2, name: "Cikarang Selatan (Lippo Arteri)" },
      { lat: -6.3800, lng: 107.1100, seg: 2, name: "Serang Baru / Cibarusah" },
      { lat: -6.4250, lng: 107.0850, seg: 2, name: "Perbatasan Bekasi - Bogor (KM 115)" },
      { lat: -6.4670, lng: 107.0540, seg: 3, name: "Simpang Cibucil Jonggol (KM 125)" },
      { lat: -6.4350, lng: 107.0150, seg: 3, name: "Raya Jonggol - Cileungsi" },
      { lat: -6.3980, lng: 106.9750, seg: 3, name: "Cileungsi / Mekarsari" },
      { lat: -6.4450, lng: 106.9400, seg: 3, name: "Klapanunggal / Gunung Putri (KM 150)" },
      { lat: -6.4850, lng: 106.8550, seg: 4, name: "Cibinong (Jl. Raya Jakarta-Bogor)" },
      { lat: -6.5350, lng: 106.8350, seg: 4, name: "Kedunghalang Arteri" },
      { lat: -6.5750, lng: 106.8150, seg: 4, name: "Jl. Pajajaran Kota Bogor" },
      { lat: -6.5980, lng: 106.7990, seg: 4, name: "Bogor Broiler Farm (KM 172)" }
    ],
    segments: [
      { id: 1, name: "KM 0-35: Subang - Sadang Arterial", sub: "Upstream Arterial Corridor", distKm: 35 },
      { id: 2, name: "KM 35-75: Karawang Arterial", sub: "Industrial Corridor", distKm: 40 },
      { id: 3, name: "KM 75-115: Cibarusah Arterial", sub: "Heavy Freight Arterial", distKm: 40 },
      { id: 4, name: "KM 115-150: Jonggol - Cileungsi Arterial", sub: "Hilly & Rough Road Corridor", distKm: 35 },
      { id: 5, name: "KM 150-172: Cibinong - Bogor Arterial", sub: "Commercial Destination Corridor", distKm: 22 }
    ]
  }
};

// Backward-compatible exports
export const WAYPOINTS_RAW = ROUTES_CONFIG.TOLL.waypoints;
export const WAYPOINTS_TOLL = ROUTES_CONFIG.TOLL.waypoints;
export const WAYPOINTS_NON_TOLL = ROUTES_CONFIG.NON_TOLL.waypoints;

export function getRouteConfig(routeType = "TOLL") {
  return ROUTES_CONFIG[routeType] || ROUTES_CONFIG.TOLL;
}

export function getWaypointsForRoute(routeType = "TOLL") {
  return (ROUTES_CONFIG[routeType] || ROUTES_CONFIG.TOLL).waypoints;
}

export const ROAD_COLORS = {
  FREE_FLOW: "#10b981",
  CONGESTED: "#f59e0b",
  GRIDLOCK: "#dc2626",
  DAMAGED_ROAD: "#ea580c",
  FLOODED: "#06b6d4",
  DISASTER_BLOCKED: "#7c3aed"
};

export const ROAD_PARAMS = {
  FREE_FLOW: { targetSpeed: 75, baseVib: 0.08, label: "FREE FLOW (HIGHWAY)", class: "badge-flow" },
  CONGESTED: { targetSpeed: 25, baseVib: 0.12, label: "CONGESTED / SLOW", class: "badge-congested" },
  GRIDLOCK: { targetSpeed: 0, baseVib: 0.02, label: "GRIDLOCK TRAFFIC", class: "badge-gridlock" },
  DAMAGED_ROAD: { targetSpeed: 18, baseVib: 0.55, label: "DAMAGED / ROUGH ROAD", class: "badge-damaged" },
  FLOODED: { targetSpeed: 8, baseVib: 0.06, label: "FLOODED ROADWAY", class: "badge-flooded" },
  DISASTER_BLOCKED: { targetSpeed: 0, baseVib: 0.01, label: "BLOCKED / HAZARD", class: "badge-disaster" }
};

// 1. VEHICLE TEMPLATES DARI data_truck.md (Template Paten Vendor Industri & Riset Empiris)
export const VEHICLE_TEMPLATES = {
  hatchtech: {
    key: "hatchtech",
    model: "HatchTech HatchTraveller 38400 (Netherlands)",
    vendor: "HatchTech B.V.",
    country: "Netherlands",
    capacity: 38400,
    capacityFormatted: "38,400 DOC",
    airflow: "Laminar Airflow (15,000 m³/h)",
    freshAir: "2,800 m³/h (Controlled Automated Dampers)",
    setpoint: 25.0,
    coolingCapacity: "8.5 kW MicroClimer Cooling Unit",
    powerType: "Independent 24V Diesel Genset",
    fuelTank: 65,
    zones: "Independent 2-Zone (MicroClimer Front & Rear)",
    sensors: "8-Probe MicroClimer 2-Zone, CO2 NDIR, 3-Axis Accelerometer, Reed Switch",
    truckImage: "/assets/images/trucks/truck_hatchtech.png?v=2",
    sensorsImage: "/assets/images/sensors/sensors_hatchtech.png?v=2",
    sensorList: [
      "8x High-Precision MicroClimer PT100 Temperature Probes (4 front, 4 rear)",
      "SHT31 Digital Relative Humidity Sensor (0-100% RH Range)",
      "SenseAir S8 NDIR Carbon Dioxide Gas Sensor (ppm)",
      "3-Axis Shock & Vibration RMS Accelerometer (g-force)",
      "Rear Cargo Magnetic Reed Switch (Door Open/Close Detection)",
      "Multi-GNSS 1 Hz GPS Receiver (Lat, Lng, Speed, Bearing, Alt)"
    ],
    features: [
      "Uniform low-velocity laminar airflow across all DOC crate stacks",
      "8-probe grid eliminating hot spots and cold spots",
      "Independent dual-zone microclimate control with thermal insulation"
    ],
    reference: "references/HatchTech_HatchTraveller_38400.txt"
  },
  heering: {
    key: "heering",
    model: "Heering Link Telematics Chick Trailer (Netherlands)",
    vendor: "Heering Holland",
    country: "Netherlands",
    capacity: 50000,
    capacityFormatted: "50,000 DOC",
    airflow: "Multi-Fan Roof Array & Air Inlet Damper",
    freshAir: "3,200 m³/h (Motorized Proportional Damper)",
    setpoint: 25.0,
    coolingCapacity: "10.0 kW Multi-Fan Evaporator",
    powerType: "Independent 12V Diesel Genset",
    fuelTank: 80,
    zones: "3-Zone (Front, Center, Rear)",
    sensors: "Multi-point RHT, CO2 NDIR, Air Damper, Door Reed Switch, Genset Telemetry",
    truckImage: "/assets/images/trucks/truck_heering.png?v=2",
    sensorsImage: "/assets/images/sensors/sensors_heering.png?v=2",
    sensorList: [
      "Multi-point Digital Temperature & RH Probes (3-Zone)",
      "Industrial Optical NDIR CO2 Gas Analyzer",
      "Fresh Air Proportional Damper Angular Position Sensor (0-100%)",
      "Rear Cargo Door Magnetic Contact Switch",
      "Genset Fuel Level Sensor & Battery Voltage Telemetry",
      "Heering Link GPRS/LTE FMS Cellular Telematics Gateway"
    ],
    features: [
      "Purpose-built commercial telematics system for DOC logistics trailers",
      "Multi-point roof fan array with individual RPM tachometer monitoring",
      "Automated alarm dispatch streaming directly to operator console"
    ],
    reference: "references/Heering_Link_Telematics.txt"
  },
  thermoking: {
    key: "thermoking",
    model: "Thermo King UT-Series CargoWatch (Ireland)",
    vendor: "Thermo King",
    country: "Ireland",
    capacity: 60000,
    capacityFormatted: "60,000 DOC",
    airflow: "High-Pressure Evaporator (Dual Reefer)",
    freshAir: "3,500 m³/h (Pneumatic Controlled Venting)",
    setpoint: 25.0,
    coolingCapacity: "12.0 kW Heavy Under-mount Compressor",
    powerType: "Dual Reefer Engine PTO + Genset Standby",
    fuelTank: 90,
    zones: "Integrated 3-Zone (Front, Center, Rear)",
    sensors: "CargoWatch 6-probe logging, 4x Door switch, TracKing Satellite/Cellular",
    truckImage: "/assets/images/trucks/truck_thermoking.png?v=2",
    sensorsImage: "/assets/images/sensors/sensors_thermoking.png?v=2",
    sensorList: [
      "CargoWatch 6 Independent Pharma-Grade Cargo Temperature Probes",
      "4x Digital Door Status Switches (Rear & Side Doors)",
      "ServiceWatch Operational Audit Logger for Reefer Engine",
      "TracKing Real-Time Cellular & Satellite Telematics Module",
      "Refrigerant Pressure Sensor & Compressor Hour-Meter"
    ],
    features: [
      "Heavy under-mount compressor unit with ultra-high cooling capacity",
      "ServiceWatch encrypted operational audit history logging",
      "Dual fail-safe architecture safeguarding livestock under extreme ambient heat"
    ],
    reference: "references/ThermoKing_UT_Series_Operators_Manual_TK60652.pdf"
  },
  carrier: {
    key: "carrier",
    model: "Carrier Transicold Lynx Fleet Series (USA)",
    vendor: "Carrier Transicold",
    country: "United States",
    capacity: 45000,
    capacityFormatted: "45,000 DOC",
    airflow: "High-Efficiency Push Evaporator",
    freshAir: "3,000 m³/h (Automated Air Damper)",
    setpoint: 25.0,
    coolingCapacity: "9.5 kW Lynx Intelligent Reefer",
    powerType: "Independent 24V Diesel Genset",
    fuelTank: 75,
    zones: "3-Zone Microclimate",
    sensors: "Lynx Fleet Push API Gateway (1 Hz), 3-Zone Temp, RH, Battery/Fuel",
    truckImage: "/assets/images/trucks/truck_carrier.png?v=2",
    sensorsImage: "/assets/images/sensors/sensors_carrier.png?v=2",
    sensorList: [
      "3-Zone Digital Temperature & Relative Humidity Probes",
      "Carrier Lynx Fleet IoT Edge Gateway (Push API 1 Hz Event-driven)",
      "Ultrasonic Genset Fuel Tank Level Sensor",
      "24V Control Battery Voltage & Charging Current Sensor",
      "Door Transition Event Logger Switch",
      "High-Sensitivity Multi-GNSS Receiver with Dead Reckoning"
    ],
    features: [
      "Global industry-standard cold chain Webhook Push API architecture",
      "Energy-efficient management with automated cooling modulation",
      "Intelligent telematics cloud integration with predictive alarm codes"
    ],
    reference: "references/Carrier_Lynx_Fleet_Push_API.txt"
  },
  chengli: {
    key: "chengli",
    model: "Chengli Specialized Poultry Carrier (China)",
    vendor: "Chengli Special Automobile",
    country: "China",
    capacity: 30000,
    capacityFormatted: "30,000 DOC",
    airflow: "Lower Louver Blower & Roof Fan",
    freshAir: "Passive Lower Body Louvers + Roof Exhaust Fan",
    setpoint: 25.0,
    coolingCapacity: "6.5 kW Auxiliary Evaporator",
    powerType: "Truck Engine PTO + Cabin Battery",
    fuelTank: 50,
    zones: "Basic 3-Zone (Front, Center, Rear)",
    sensors: "3-Zone Temp, RH, Roof Exhaust Fan Status, Cabin Console",
    truckImage: "/assets/images/trucks/truck_chengli.png?v=2",
    sensorsImage: "/assets/images/sensors/sensors_chengli.png?v=2",
    sensorList: [
      "3-Zone Analog Thermocouple Temperature Sensors",
      "Standard Cargo Relative Humidity Sensor",
      "Roof Exhaust Fan RPM Tachometer Sensor",
      "Digital Monitoring Display Console in Driver Cabin",
      "Mechanical Door Contact Sensor",
      "Commercial GSM/GPS Vehicle Tracker"
    ],
    features: [
      "Economical fleet bodywork tailored for emerging agricultural markets",
      "Combination of roof suction ventilation and passive lower body louvers",
      "Auxiliary booster blower at rear door area for crate handling airflow"
    ],
    reference: "references/Chengli_DOC_Carrier_Truck.txt"
  },
  joinaldy: {
    key: "joinaldy",
    model: "Tropical Blower Modified Truck (Audy Joinaldy 2020)",
    vendor: "South Sulawesi Empirical Research (IPB)",
    country: "Indonesia (Empirical Research)",
    capacity: 36000,
    capacityFormatted: "36,000 DOC",
    airflow: "Non-AC Roof Blower Ventilation (South Sulawesi Model)",
    freshAir: "Non-Refrigerated Roof Blower Circulation",
    setpoint: 26.0,
    coolingCapacity: "0 kW (Non-AC, Ambient Air Circulation Dependent)",
    powerType: "Truck 12V DC Battery Blower",
    fuelTank: 45,
    zones: "2-Zone (Front & Rear)",
    sensors: "Ambient & Cargo Box Temp (Y=1.2385X - 6.2567), 45s Logging",
    truckImage: "/assets/images/trucks/truck_joinaldy.png?v=2",
    sensorsImage: "/assets/images/sensors/sensors_joinaldy.png?v=2",
    sensorList: [
      "External Tropical Ambient Air Temperature Sensor (X)",
      "Internal Cargo Box Core Temperature Sensor (Y)",
      "Audy Joinaldy (2020) Tropical Thermal Regression Model: Y = 1.2385X - 6.2567",
      "Relative Humidity Sensor (RH %) for Tropical THI Evaluation",
      "GS-105 Datalogger with 45-Second Periodic Sampling",
      "NMEA-0183 GPS Tracking Module"
    ],
    features: [
      "Empirical dissertation benchmark from IPB Business School by Audy Joinaldy (2020)",
      "Representative model of conventional non-refrigerated tropical poultry transport",
      "Demonstrates critical THI elevation (> 160) and mortality risk during heatwaves / traffic delays"
    ],
    reference: "references/K16180034_Audy Joinaldy.pdf"
  }
};

// Default Initial Vehicles (Registered Fleet - Based on Audy Joinaldy 2020 Empirical Research Template)
export const DEFAULT_VEHICLES = [
  {
    truckId: "TRUCK-AJ-36000-01",
    licensePlate: "DD 8741 XY",
    templateKey: "joinaldy",
    model: "Tropical Blower Modified Truck (Audy Joinaldy 2020)",
    airflow: "Non-AC Roof Blower Ventilation (South Sulawesi Model)",
    capacity: 36000,
    setpoint: 26.0,
    fuelTank: 45,
    powerType: "Truck 12V DC Battery Blower",
    sensors: "Ambient & Cargo Box Temp (Y=1.2385X - 6.2567), 45s Logging",
    status: "AVAILABLE",
    lastLatitude: -6.5650,
    lastLongitude: 107.7600,
    lastLocationName: "Subang Hatchery Pool",
    lastSpeedKmh: 0.0,
    isMoving: false
  },
  {
    truckId: "TRUCK-AJ-36000-02",
    licensePlate: "DD 8129 AB",
    templateKey: "joinaldy",
    model: "Tropical Blower Modified Truck (Audy Joinaldy 2020)",
    airflow: "Non-AC Roof Blower Ventilation (South Sulawesi Model)",
    capacity: 36000,
    setpoint: 26.0,
    fuelTank: 45,
    powerType: "Truck 12V DC Battery Blower",
    sensors: "Ambient & Cargo Box Temp (Y=1.2385X - 6.2567), 45s Logging",
    status: "AVAILABLE",
    lastLatitude: -6.5650,
    lastLongitude: 107.7600,
    lastLocationName: "Subang Hatchery Pool",
    lastSpeedKmh: 0.0,
    isMoving: false
  }
];

// Default Initial Expeditions (Empty by default)
export const DEFAULT_EXPEDITIONS = [];

// Contoh Payload Telemetri Resmi Setiap Template Truk Sesuai data_truck.md & Vendor Industri
export const TRUCK_PAYLOAD_EXAMPLES = {
  hatchtech: {
    key: "hatchtech",
    title: "HatchTech HatchTraveller 38400 (Netherlands)",
    vendor: "HatchTech B.V.",
    country: "Netherlands",
    capacityFormatted: "38,400 DOC",
    specSummary: "15,000 m³/h laminar airflow architecture, dual independent MicroClimer climate zones (front & rear), 8-probe precision sensor array, NDIR CO2 sensor, and patented 38,400 DOC capacity.",
    endpointType: "Unified Stream Endpoint (WebSocket: /ws/telemetry | MQTT: truck/TRUCK-HT-38400-01/telemetry)",
    payload: {
      "identity": {
        "truck_id": "TRUCK-HT-38400-01",
        "trip_id": "TRIP-20261030-01",
        "delivery_order": "DO-CPI-SBG-20261029-01",
        "driver_id": "DRV-HT-8821",
        "sequence_number": 1205,
        "timestamp": "2026-10-30T08:20:05.000Z"
      },
      "vehicle": {
        "latitude": -6.501234,
        "longitude": 107.612345,
        "speed_kmh": 74.5,
        "heading_deg": 284.0,
        "altitude_m": 128.5,
        "vibration_rms_g": 0.08
      },
      "microclimate": {
        "temp_zone_1_c": 25.15,
        "temp_zone_2_c": 25.80,
        "temp_box_core_c": 26.25,
        "humidity_pct": 64.2,
        "co2_ppm": 1180,
        "ambient_temp_c": 33.6,
        "ambient_humidity_pct": 72.0
      },
      "cargo_biometrics": {
        "strain": "Cobb 500",
        "quantity_doc": 38400,
        "avg_weight_g": 42.0,
        "total_biomass_kg": 1612.8,
        "thi_index": 139.4,
        "estimated_weight_loss_pct": 0.32,
        "welfare_status": "OPTIMAL"
      },
      "systems": {
        "ventilation": {
          "airflow_system": "LAMINAR_AIRFLOW",
          "blower_flow_m3h": 15000,
          "fresh_air_intake_m3h": 2800,
          "inlet_damper_status": "OPEN",
          "inlet_damper_pct": 45
        },
        "cooling": {
          "hvac_status": "COOLING",
          "cooling_capacity_kw": 8.5,
          "temperature_setpoint_c": 25.0,
          "chiller_circuit": "DUAL_INDEPENDENT"
        },
        "power": {
          "power_source": "AUX_GENSET_24V",
          "fuel_level_pct": 82.5,
          "battery_voltage_v": 24.2
        }
      },
      "safety": {
        "rear_door_open": false,
        "door_open_duration_s": 0,
        "alarm_code": "NORMAL",
        "sensor_status": "OK"
      }
    }
  },
  heering: {
    key: "heering",
    title: "Heering Link Telematics Chick Trailer (Netherlands)",
    vendor: "Heering Holland",
    country: "Netherlands",
    capacityFormatted: "50,000 DOC",
    specSummary: "Dedicated poultry transport telematics platform for 50,000 DOC trailers with multi-fan roof array (8 fans), proportional motorized dampers, 3-zone microclimate probes, and CO2 threshold alarms.",
    endpointType: "Unified Stream Endpoint (WebSocket: /ws/telemetry | MQTT: truck/TRUCK-HL-50000-01/telemetry)",
    payload: {
      "identity": {
        "truck_id": "TRUCK-HL-50000-01",
        "trip_id": "TRIP-20261030-02",
        "delivery_order": "DO-CPI-SBG-20261029-02",
        "driver_id": "DRV-HL-7732",
        "sequence_number": 984,
        "timestamp": "2026-10-30T08:20:05.000Z"
      },
      "vehicle": {
        "latitude": -6.498210,
        "longitude": 107.592100,
        "speed_kmh": 72.0,
        "heading_deg": 280.0,
        "altitude_m": 115.0,
        "vibration_rms_g": 0.10
      },
      "microclimate": {
        "temp_zone_1_c": 24.80,
        "temp_zone_2_c": 25.40,
        "temp_zone_3_c": 25.90,
        "humidity_pct": 63.5,
        "co2_ppm": 1320,
        "ambient_temp_c": 33.2,
        "ambient_humidity_pct": 71.0
      },
      "cargo_biometrics": {
        "strain": "Ross 308",
        "quantity_doc": 50000,
        "avg_weight_g": 41.8,
        "total_biomass_kg": 2090.0,
        "thi_index": 140.2,
        "estimated_weight_loss_pct": 0.35,
        "welfare_status": "OPTIMAL"
      },
      "systems": {
        "ventilation": {
          "roof_fan_speed": "HIGH",
          "active_roof_fans_count": 8,
          "air_inlet_damper_pct": 65,
          "air_inlet_status": "OPEN",
          "fresh_air_flow_m3h": 3200
        },
        "cooling": {
          "hvac_status": "COOLING",
          "cooling_capacity_kw": 10.0,
          "temperature_setpoint_c": 25.0,
          "operating_mode": "AUTOMATIC"
        },
        "power": {
          "power_source": "AUX_GENSET_12V",
          "fuel_level_pct": 76.0,
          "battery_voltage_v": 12.8
        }
      },
      "safety": {
        "rear_door_open": false,
        "door_open_duration_s": 0,
        "alarm_code": "NORMAL",
        "co2_alarm_triggered": false,
        "sensor_status": "OK"
      }
    }
  },
  thermoking: {
    key: "thermoking",
    title: "Thermo King UT-Series CargoWatch (Ireland)",
    vendor: "Thermo King",
    country: "Ireland",
    capacityFormatted: "60,000 DOC",
    specSummary: "Heavy undermount refrigeration system for 60,000 DOC with independent CargoWatch 6-probe logger, digital door switches, ServiceWatch audit trail, and TracKing satellite/4G telemetry.",
    endpointType: "Unified Stream Endpoint (WebSocket: /ws/telemetry | MQTT: truck/TRUCK-TK-60000-01/telemetry)",
    payload: {
      "identity": {
        "truck_id": "TRUCK-TK-60000-01",
        "trip_id": "TRIP-20261030-03",
        "delivery_order": "DO-CPI-SBG-20261029-03",
        "driver_id": "DRV-TK-4419",
        "sequence_number": 875,
        "timestamp": "2026-10-30T08:20:05.000Z"
      },
      "vehicle": {
        "latitude": -6.482150,
        "longitude": 107.568400,
        "speed_kmh": 78.0,
        "heading_deg": 286.0,
        "altitude_m": 108.0,
        "vibration_rms_g": 0.09
      },
      "microclimate": {
        "cargowatch_6_probes": {
          "probe_1_return_air_c": 25.80,
          "probe_2_discharge_air_c": 22.30,
          "probe_3_zone_front_c": 24.90,
          "probe_4_zone_mid_c": 25.35,
          "probe_5_zone_rear_c": 25.70,
          "probe_6_ambient_c": 33.80
        },
        "humidity_pct": 65.0,
        "co2_ppm": 1250
      },
      "cargo_biometrics": {
        "strain": "Cobb 500",
        "quantity_doc": 60000,
        "avg_weight_g": 42.1,
        "total_biomass_kg": 2526.0,
        "thi_index": 140.8,
        "estimated_weight_loss_pct": 0.30,
        "welfare_status": "OPTIMAL"
      },
      "systems": {
        "cooling": {
          "unit_model": "UT-1200",
          "hvac_status": "COOLING",
          "cooling_capacity_kw": 12.0,
          "temperature_setpoint_c": 25.0,
          "compressor_mode": "CONTINUOUS",
          "refrigerant_pressure_psi": 215,
          "engine_running_hours": 1420.5
        },
        "power": {
          "power_source": "DUAL_REEFER_PTO_GENSET",
          "fuel_level_pct": 86.5,
          "battery_voltage_v": 24.4
        }
      },
      "safety": {
        "rear_door_open": false,
        "side_door_open": false,
        "servicewatch_alarms": [],
        "tracking_comm_status": "SATELLITE_4G_ACTIVE",
        "sensor_status": "OK"
      }
    }
  },
  carrier: {
    key: "carrier",
    title: "Carrier Transicold Lynx Fleet Series (USA)",
    vendor: "Carrier Transicold",
    country: "United States",
    capacityFormatted: "45,000 DOC",
    specSummary: "Official Carrier Lynx Fleet Push API specification (1 Hz push Webhook) for 45,000 DOC fleets with intelligent power modulation, ultrasonic fuel level sensors, and cargo door event tracking.",
    endpointType: "Unified Stream Endpoint (WebSocket: /ws/telemetry | Webhook: /api/v1/lynx/push-event)",
    payload: {
      "header": {
        "device_id": "CR-LYNX-45000-01",
        "telemetry_protocol": "CARRIER_LYNX_PUSH_API_V1",
        "trip_id": "TRIP-20261030-04",
        "delivery_order": "DO-CPI-SBG-20261029-04",
        "sequence_number": 1102,
        "timestamp": "2026-10-30T08:20:05.000Z"
      },
      "telematics": {
        "latitude": -6.501234,
        "longitude": 107.612345,
        "speed_kmh": 74.2,
        "heading_deg": 285.0
      },
      "compartment": {
        "cargo_temperature_c": 25.25,
        "temp_zone_1_c": 25.10,
        "temp_zone_2_c": 25.60,
        "temp_zone_3_c": 26.05,
        "temperature_setpoint_c": 25.0,
        "relative_humidity_pct": 64.0,
        "co2_ppm": 1210,
        "ambient_temperature_c": 33.5
      },
      "cargo_biometrics": {
        "strain": "Hubbard Classic",
        "quantity_doc": 45000,
        "avg_weight_g": 42.0,
        "thi_index": 139.8,
        "estimated_weight_loss_pct": 0.28,
        "welfare_status": "OPTIMAL"
      },
      "reefer_unit": {
        "operating_mode": "COOL",
        "cooling_unit_power": true,
        "cooling_capacity_kw": 9.5,
        "fuel_level_pct": 78.5,
        "battery_voltage_v": 24.2,
        "engine_run_hours": 894.2
      },
      "events_and_safety": {
        "cargo_door_open": false,
        "door_events_count": 2,
        "active_alarm_codes": [
          "ALARM_00_NORMAL_OPERATION"
        ],
        "sensor_health": "OPTIMAL"
      }
    }
  },
  chengli: {
    key: "chengli",
    title: "Chengli Specialized Poultry Carrier (China)",
    vendor: "Chengli Special Automobile",
    country: "China",
    capacityFormatted: "30,000 DOC",
    specSummary: "Specialized DOC bodywork for developing markets (30,000 DOC capacity). Combines roof exhaust suction fans, passive lower body louvers, cabin console, and commercial GPS tracking.",
    endpointType: "Unified Stream Endpoint (WebSocket: /ws/telemetry | MQTT: truck/TRUCK-CL-30000-01/telemetry)",
    payload: {
      "identity": {
        "truck_id": "TRUCK-CL-30000-01",
        "trip_id": "TRIP-20261030-05",
        "delivery_order": "DO-CPI-SBG-20261029-05",
        "driver_id": "DRV-CL-1904",
        "sequence_number": 724,
        "timestamp": "2026-10-30T08:20:05.000Z"
      },
      "vehicle": {
        "latitude": -6.524100,
        "longitude": 107.641200,
        "speed_kmh": 65.0,
        "heading_deg": 278.0,
        "vibration_rms_g": 0.18
      },
      "microclimate": {
        "temp_zone_1_c": 26.20,
        "temp_zone_2_c": 26.85,
        "temp_zone_3_c": 27.40,
        "ambient_temp_c": 33.5,
        "humidity_pct": 68.5,
        "co2_ppm": 1450
      },
      "cargo_biometrics": {
        "strain": "Cobb 500",
        "quantity_doc": 30000,
        "avg_weight_g": 41.5,
        "total_biomass_kg": 1245.0,
        "thi_index": 144.1,
        "estimated_weight_loss_pct": 0.52,
        "welfare_status": "WARNING_MILD"
      },
      "systems": {
        "ventilation": {
          "roof_exhaust_fans_count": 4,
          "roof_fans_active": 4,
          "roof_fan_speed": "MEDIUM",
          "lower_louvers_status": "OPEN",
          "rear_booster_fan": "OFF"
        },
        "cooling": {
          "auxiliary_chiller_status": "STANDBY",
          "cooling_capacity_kw": 6.5,
          "temperature_setpoint_c": 25.0
        },
        "power": {
          "power_source": "ENGINE_PTO",
          "battery_voltage_v": 12.4
        }
      },
      "safety": {
        "mechanical_door_closed": true,
        "cabin_console_status": "NORMAL",
        "sensor_status": "OK"
      }
    }
  },
  joinaldy: {
    key: "joinaldy",
    title: "Tropical Non-AC Blower Truck (Audy Joinaldy 2020)",
    vendor: "IPB Empirical Field Research (Trans-Sulawesi)",
    country: "Indonesia (Research)",
    capacityFormatted: "36,000 DOC",
    specSummary: "Empirical model from IPB Business School dissertation by Audy Joinaldy (2020) with 36,000 DOC capacity. Non-AC roof blower ventilation, empirical thermal regression Y=1.2385X-6.2567, GS-105 datalogger, critical THI thresholds, and driver RFID verification.",
    endpointType: "Unified Stream Endpoint (WebSocket: /ws/telemetry | Datalogger GS-105 45s Sync)",
    payload: {
      "identity": {
        "truck_id": "TRUCK-AJ-36000-01",
        "trip_id": "TRIP-20261029-SULSEL-01",
        "delivery_order": "DO-CPI-SBG-20261029-01",
        "driver_id": "DRV-AJ-041",
        "driver_rfid_authenticated": true,
        "sequence_number": 412,
        "timestamp": "2026-10-29T11:20:00.000Z"
      },
      "vehicle": {
        "latitude": -5.147665,
        "longitude": 119.432732,
        "speed_kmh": 68.5,
        "heading_deg": 42.0,
        "altitude_m": 24.5,
        "vibration_rms_g": 0.42
      },
      "empirical_microclimate": {
        "ambient_temp_c_x": 34.50,
        "container_temp_c_y": 36.47,
        "joinaldy_regression_formula": "Y = 1.2385 * X - 6.2567",
        "temp_zone_1_c": 36.20,
        "temp_zone_2_c": 36.75,
        "humidity_pct": 78.4,
        "co2_ppm": 1680
      },
      "cargo_biometrics": {
        "strain": "Cobb 500",
        "quantity_doc": 36000,
        "avg_weight_initial_g": 42.0,
        "thi_index": 165.24,
        "cobb_vantress_sla_status": "CRITICAL_VIOLATION_THI",
        "estimated_weight_loss_pct": 4.91,
        "welfare_status": "CRITICAL_HEAT_STRESS"
      },
      "systems": {
        "ventilation": {
          "roof_blowers_count": 2,
          "roof_blowers_active": 2,
          "air_velocity_ms": 1.25,
          "ventilation_type": "PASSIVE_BLOWER_NON_AC"
        },
        "cooling": {
          "hvac_status": "NON_AC_VENTILATION_ONLY",
          "cooling_capacity_kw": 0.0,
          "target_setpoint_unmet": true
        },
        "power": {
          "power_source": "TRUCK_BATTERY_12V",
          "battery_voltage_v": 11.9
        }
      },
      "safety": {
        "driver_rfid_tag": "RFID-DRV-AJ-041",
        "panic_button_status": false,
        "container_seal_open": false,
        "datalogger_device": "GS-105",
        "logging_interval_s": 45,
        "sensor_status": "OK"
      }
    }
  }
};

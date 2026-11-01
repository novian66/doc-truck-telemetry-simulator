/**
 * Config Console State Management Module (ES Module)
 * Mengelola armada, daftar pengiriman, ekspedisi aktif, dan kondisi runtime simulasi
 */

import {
  STORAGE_KEYS,
  DEFAULT_VEHICLES,
  DEFAULT_EXPEDITIONS,
  VEHICLE_TEMPLATES
} from "../../shared/constants.js";

// Physical Runtime State for Active Expedition
export const runtime = {
  engineRunning: false,
  speedMultiplier: 1,
  tickerInterval: null,
  currentIdx: 0,
  elapsedSec: 0,
  speed: 0,
  vibration: 0.08,
  ambientTemp: 34.0,
  solarIrradiance: 850,
  distanceTraveledKm: 0,
  totalDistanceKm: 145.0,
  bearingDeg: 268,
  z1_temp: 25.2,
  z2_temp: 25.6,
  z3_temp: 25.9,
  z1_rh: 64.0,
  z2_rh: 63.5,
  z3_rh: 62.0,
  co2_ppm: 1150,

  // Sub-sistem daya & aktuator
  fuelLevelPct: 100.0,
  batteryVoltage: 24.2,
  powerStatus: "AUX_GENSET",
  fanSpeed: "HIGH",
  airInlet: "OPEN",
  hvacStatus: "COOLING",
  doorOpenDurationS: 0,

  // Jaringan telekomunikasi & sensor
  networkState: "GOOD",
  bufferedPacketsCount: 0,
  sensorStatus: "OK",
  alarmCode: "NORMAL",
  driftOffset: 0.0,
  stuckCO2Value: null,
  spikeActive: false,
  nullSensorActive: false,

  // Cryptographic hash chain integrity (Paper 1 & Paper 2)
  sequenceNumber: 1,
  prevHash: "0000000000000000000000000000000000000000000000000000000000000000",
  payloadHash: "",

  // Controlled Fault Injection Switches
  faults: {
    chillerFail: false,
    doorOpen: false,
    ventFail: false,
    trafficStop: false,
    fuelEmpty: false,
    lowBattery: false,
    sensorDrift: false,
    sensorFreeze: false,
    sensorSpike: false,
    sensorNull: false,
    blankSpot: false
  }
};

export let vehicles = [];
export let expeditions = [];
export let serverTemplates = [];
export let activeTripId = null;

export function mapServerVehicle(sv) {
  const tmpl = VEHICLE_TEMPLATES[sv.template_key] || {};
  return {
    truckId: sv.truck_id,
    licensePlate: sv.plate_number,
    templateKey: sv.template_key,
    model: sv.model_name || tmpl.model || sv.display_name,
    vendor: tmpl.vendor || "Vendor Industri",
    airflow: tmpl.airflow || (sv.thermal_mode === "REGRESSION" ? "Ventilasi Blower Atap Non-AC" : "Laminar Airflow"),
    capacity: sv.capacity_doc || tmpl.capacity || 36000,
    setpoint: sv.temperature_setpoint_c || tmpl.setpoint || 26.0,
    fuelTank: tmpl.fuelTank || 50,
    powerType: tmpl.powerType || "AUX_GENSET",
    sensors: tmpl.sensors || sv.sensor_suite_desc || "Dual Probe Ambien & Kontainer (RS-485)",
    status: sv.status || "AVAILABLE",
    notes: sv.notes || "",
    lastLatitude: typeof sv.last_latitude === "number" ? sv.last_latitude : -6.5650,
    lastLongitude: typeof sv.last_longitude === "number" ? sv.last_longitude : 107.7600,
    lastLocationName: sv.last_location_name || "Subang Hatchery Pool",
    lastSpeedKmh: typeof sv.last_speed_kmh === "number" ? sv.last_speed_kmh : 0.0,
    lastTelemetryAt: sv.last_telemetry_at || null,
    isMoving: !!sv.is_moving,
    headingDeg: sv.heading_deg || 0.0,
    activeTripId: sv.active_trip_id || null
  };
}

/**
 * Memuat data kendaraan dan pengiriman dari LocalStorage
 */
export function loadConfigData() {
  const vSaved = localStorage.getItem(STORAGE_KEYS.VEHICLES);
  if (vSaved) {
    try {
      const parsed = JSON.parse(vSaved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        vehicles.splice(0, vehicles.length, ...parsed);
      } else {
        vehicles.splice(0, vehicles.length, ...DEFAULT_VEHICLES);
      }
    } catch (e) {
      vehicles.splice(0, vehicles.length, ...DEFAULT_VEHICLES);
    }
  } else {
    vehicles.splice(0, vehicles.length, ...DEFAULT_VEHICLES);
  }
  localStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));

  const eSaved = localStorage.getItem(STORAGE_KEYS.EXPEDITIONS);
  if (eSaved) {
    try {
      const parsed = JSON.parse(eSaved);
      if (Array.isArray(parsed)) {
        // Hapus TRIP-20261030-01 dari localStorage jika masih tersisa
        const cleaned = parsed.filter(e => e.tripId !== "TRIP-20261030-01");
        if (cleaned.length !== parsed.length) {
          localStorage.setItem(STORAGE_KEYS.EXPEDITIONS, JSON.stringify(cleaned));
          if (localStorage.getItem(STORAGE_KEYS.ACTIVE_TRIP) === "TRIP-20261030-01") {
            localStorage.removeItem(STORAGE_KEYS.ACTIVE_TRIP);
          }
        }
        expeditions.splice(0, expeditions.length, ...cleaned);
      } else {
        expeditions.splice(0, expeditions.length);
      }
    } catch (e) {
      expeditions.splice(0, expeditions.length);
    }
  } else {
    expeditions.splice(0, expeditions.length);
  }

  // Pastikan data ekspedisi lama memiliki atribut empiris lengkap (backward-compatibility)
  expeditions.forEach(exp => {
    if (!exp.deliveryOrder) exp.deliveryOrder = `DO-CPI-SBG-${exp.tripId.replace("TRIP-", "")}`;
    if (!exp.strain) exp.strain = "Cobb 500";
    if (!exp.averageWeightGrams) exp.averageWeightGrams = 42.0;
    if (!exp.breederAge) exp.breederAge = "Prime (30 - 50 Minggu)";
    if (!exp.gender) exp.gender = "As-Hatched (Campur 50:50)";
    if (!exp.boxType) exp.boxType = "Boks Plastik Berventilasi (Crate)";
    if (!exp.chicksPerBox) exp.chicksPerBox = 100;
    if (!exp.targetRH) exp.targetRH = 65;
    if (!exp.fuelLevelPct) exp.fuelLevelPct = 100.0;
    if (!exp.batteryVoltage) exp.batteryVoltage = 24.2;
    if (!exp.signalSegments) exp.signalSegments = ["GOOD", "GOOD", "GOOD", "BAD", "GOOD"];
    if (!exp.routeType) exp.routeType = "TOLL";
    if (!exp.totalDistanceKm) exp.totalDistanceKm = exp.routeType === "NON_TOLL" ? 172.0 : 145.0;
  });

  const aSaved = localStorage.getItem(STORAGE_KEYS.ACTIVE_TRIP);
  if (aSaved && expeditions.some(e => e.tripId === aSaved)) {
    activeTripId = aSaved;
  } else if (expeditions.length > 0) {
    activeTripId = expeditions[0].tripId;
  } else {
    activeTripId = null;
  }

  const activeExp = expeditions.find(e => e.tripId === activeTripId);
  if (activeExp) {
    runtime.totalDistanceKm = activeExp.totalDistanceKm || (activeExp.routeType === "NON_TOLL" ? 172.0 : 145.0);
  }

  saveConfigData();
}

/**
 * Sinkronisasi data real-time langsung dari backend database SQLite (FastAPI):
 * 1. Template Spesifikasi Paten Truk (GET /api/v1/simulation/templates)
 * 2. Daftar Armada Truk Terdaftar (GET /api/v1/simulation/vehicles)
 * 3. Daftar Rencana Pengiriman (GET /api/v1/simulation/trips)
 */
export async function syncConfigFromBackend() {
  try {
    // 1. Ambil Master Template Spesifikasi Paten Truk via API
    const tmplRes = await fetch("/api/v1/simulation/templates");
    if (tmplRes.ok) {
      const tmplData = await tmplRes.json();
      if (tmplData && Array.isArray(tmplData.templates)) {
        serverTemplates.splice(0, serverTemplates.length, ...tmplData.templates);
        serverTemplates.forEach(st => {
          const k = st.template_key;
          if (VEHICLE_TEMPLATES[k]) {
            VEHICLE_TEMPLATES[k].model = st.model_name || VEHICLE_TEMPLATES[k].model;
            VEHICLE_TEMPLATES[k].vendor = st.vendor || VEHICLE_TEMPLATES[k].vendor;
            VEHICLE_TEMPLATES[k].country = st.country || VEHICLE_TEMPLATES[k].country;
            VEHICLE_TEMPLATES[k].capacity = st.capacity_doc || VEHICLE_TEMPLATES[k].capacity;
            VEHICLE_TEMPLATES[k].setpoint = st.temperature_setpoint_c || VEHICLE_TEMPLATES[k].setpoint;
            VEHICLE_TEMPLATES[k].coolingCapacity = st.cooling_capacity_kw > 0 ? `${st.cooling_capacity_kw} kW Unit` : "Blower Ventilasi";
            VEHICLE_TEMPLATES[k].sensors = st.sensor_suite_desc || VEHICLE_TEMPLATES[k].sensors;
            if (Array.isArray(st.features)) {
              VEHICLE_TEMPLATES[k].features = st.features;
            }
          }
        });
        const bTmpl = document.getElementById("badgeTemplateCount");
        if (bTmpl) bTmpl.innerText = serverTemplates.length;
      }
    }

    // 2. Ambil Daftar Armada Truk Terdaftar via API
    const vehRes = await fetch("/api/v1/simulation/vehicles");
    if (vehRes.ok) {
      const vehData = await vehRes.json();
      if (vehData && Array.isArray(vehData.vehicles) && vehData.vehicles.length > 0) {
        const mapped = vehData.vehicles.map(mapServerVehicle);
        vehicles.splice(0, vehicles.length, ...mapped);
        localStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));
        const bVeh = document.getElementById("badgeVehicleCount");
        if (bVeh) bVeh.innerText = vehicles.length;
      }
    }

    // 3. Ambil Daftar Rencana Pengiriman Logistik via API
    const tripsRes = await fetch("/api/v1/simulation/trips");
    if (tripsRes.ok) {
      const tripsData = await tripsRes.json();
      if (tripsData && Array.isArray(tripsData.trips)) {
        const mappedTrips = tripsData.trips.map(st => ({
          tripId: st.trip_id,
          routeId: st.route_id,
          deliveryOrder: st.delivery_order || `DO-CPI-SBG-${st.trip_id.replace("TRIP-", "")}`,
          title: st.title || `Dispatch ${st.origin_name || "Origin"} to ${st.destination_name || "Destination"} (${st.truck_id})`,
          routeType: (st.route_type && st.route_type.includes("NON_TOLL")) || (st.route_id && st.route_id.includes("NON_TOLL")) ? "NON_TOLL" : "TOLL",
          totalDistanceKm: st.total_distance_km || 145.0,
          truckId: st.truck_id,
          driverName: st.driver_name,
          strain: st.cargo_strain || "Cobb 500",
          averageWeightGrams: st.average_weight_g || 42.0,
          quantity: st.cargo_quantity || 36000,
          boxType: st.box_type || "PLASTIC_CRATE",
          chicksPerBox: st.chicks_per_box || 100,
          departureDate: st.departure_date || (st.created_at ? st.created_at.slice(0, 10) : "2026-10-31"),
          departureTime: st.departure_time || "08:00",
          timeOfDay: (st.departure_time && (parseInt(st.departure_time.split(":")[0], 10) >= 18 || parseInt(st.departure_time.split(":")[0], 10) < 6)) ? "NIGHT" : "DAY",
          weather: st.weather || "SUNNY",
          status: st.status || "SCHEDULED",
          createdAt: st.created_at,
          origin: { name: st.origin_name || "Origin Facility", lat: st.origin_lat || -6.5650, lng: st.origin_lng || 107.7600 },
          destination: { name: st.destination_name || "Destination Farm", lat: st.destination_lat || -6.5980, lng: st.destination_lng || 106.7990 }
        }));
        expeditions.splice(0, expeditions.length, ...mappedTrips);
        localStorage.setItem(STORAGE_KEYS.EXPEDITIONS, JSON.stringify(expeditions));
        const bExp = document.getElementById("badgeExpeditionCount");
        if (bExp) bExp.innerText = expeditions.length;

        // Pastikan activeTripId valid
        if (!expeditions.some(e => e.tripId === activeTripId) && expeditions.length > 0) {
          const running = expeditions.find(e => e.status === "RUNNING");
          activeTripId = running ? running.tripId : expeditions[0].tripId;
        }

        const curExp = expeditions.find(e => e.tripId === activeTripId);
        if (curExp) {
          runtime.totalDistanceKm = curExp.totalDistanceKm || 145.0;
          if (curExp.status === "RUNNING") {
            runtime.engineRunning = true;
          } else if (curExp.status === "PAUSED" || curExp.status === "COMPLETED") {
            runtime.engineRunning = false;
          }
        }
      }
    }

    // Ambil data telemetri live real-time terbaru trip aktif dari backend FastAPI
    if (activeTripId) {
      try {
        const latestRes = await fetch(`/api/v1/simulation/latest?trip_id=${encodeURIComponent(activeTripId)}`);
        if (latestRes.ok) {
          const lData = await latestRes.json();
          applyTelemetryToRuntime(lData);
        }
      } catch (err) {}
    }

    saveConfigData();
  } catch (err) {
    console.warn("syncConfigFromBackend error:", err);
  }
}

/**
 * Menyimpan data kendaraan dan pengiriman ke LocalStorage & memperbarui badge counter
 */
export function saveConfigData() {
  localStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));
  localStorage.setItem(STORAGE_KEYS.EXPEDITIONS, JSON.stringify(expeditions));
  localStorage.setItem(STORAGE_KEYS.ACTIVE_TRIP, activeTripId);

  // Update badge counter di sidebar jika elemen ada
  const bVeh = document.getElementById("badgeVehicleCount");
  if (bVeh) bVeh.innerText = vehicles.length;

  const bExp = document.getElementById("badgeExpeditionCount");
  if (bExp) bExp.innerText = expeditions.length;
}

export function setActiveTripId(tripId) {
  activeTripId = tripId;
  const activeExp = expeditions.find(e => e.tripId === activeTripId);
  if (activeExp) {
    runtime.totalDistanceKm = activeExp.totalDistanceKm || (activeExp.routeType === "NON_TOLL" ? 172.0 : 145.0);
  }
  saveConfigData();
}

export function getActiveExpedition() {
  if (!activeTripId || expeditions.length === 0) {
    return expeditions[0] || null;
  }
  return expeditions.find(e => e.tripId === activeTripId) || expeditions[0] || null;
}

export function getActiveVehicle() {
  const exp = getActiveExpedition();
  if (!exp) return vehicles[0] || { licensePlate: "-", model: "-" };
  return (
    vehicles.find(v => v.truckId === exp.truckId) ||
    vehicles[0] || { licensePlate: "-", model: "-" }
  );
}

export function addExpedition(newExp) {
  expeditions.unshift(newExp);
  activeTripId = newExp.tripId;
  saveConfigData();
}

export function addVehicle(newVeh) {
  vehicles.push(newVeh);
  saveConfigData();
}

/**
 * Terapkan paket telemetri 25-field dari backend (WebSocket/REST) langsung ke runtime simulator
 */
export function applyTelemetryToRuntime(p) {
  if (!p) return;
  const tripId = p.identity?.trip_id;
  if (tripId && activeTripId && tripId !== activeTripId) return;

  if (p.engineRunning != null) {
    runtime.engineRunning = Boolean(p.engineRunning);
  }
  const curExp = expeditions.find(e => e.tripId === (tripId || activeTripId));
  if (p.tripStatus && curExp) {
    curExp.status = p.tripStatus;
  }
  if (p.identity?.sequence_number != null) {
    runtime.sequenceNumber = p.identity.sequence_number;
  }

  if (p.vehicle) {
    if (typeof p.vehicle.speed_kmh === "number") runtime.speed = p.vehicle.speed_kmh;
    if (typeof p.vehicle.distance_traveled_km === "number") runtime.distanceTraveledKm = p.vehicle.distance_traveled_km;
    if (typeof p.vehicle.total_distance_km === "number") runtime.totalDistanceKm = p.vehicle.total_distance_km;
    if (typeof p.vehicle.heading_deg === "number") runtime.bearingDeg = p.vehicle.heading_deg;
    if (typeof p.vehicle.vibration_rms_g === "number") runtime.vibration = p.vehicle.vibration_rms_g;
  }

  if (p.microclimate) {
    if (typeof p.microclimate.temp_zone_1_c === "number") runtime.z1_temp = p.microclimate.temp_zone_1_c;
    if (typeof p.microclimate.temp_zone_2_c === "number") runtime.z2_temp = p.microclimate.temp_zone_2_c;
    if (typeof p.microclimate.temp_zone_3_c === "number") runtime.z3_temp = p.microclimate.temp_zone_3_c;
    if (typeof p.microclimate.humidity_pct === "number") runtime.z2_rh = p.microclimate.humidity_pct;
    if (typeof p.microclimate.co2_ppm === "number") runtime.co2_ppm = p.microclimate.co2_ppm;
    if (typeof p.microclimate.ambient_temp_c === "number") runtime.ambientTemp = p.microclimate.ambient_temp_c;
    if (typeof p.microclimate.solar_irradiance_wm2 === "number") runtime.solarIrradiance = p.microclimate.solar_irradiance_wm2;
  }

  if (p.systems) {
    if (p.systems.power) {
      if (typeof p.systems.power.fuel_level_pct === "number") runtime.fuelLevelPct = p.systems.power.fuel_level_pct;
      if (typeof p.systems.power.battery_voltage_v === "number") runtime.batteryVoltage = p.systems.power.battery_voltage_v;
      if (p.systems.power.power_status) runtime.powerStatus = p.systems.power.power_status;
    }
    if (p.systems.ventilation) {
      if (p.systems.ventilation.fan_status) runtime.fanSpeed = p.systems.ventilation.fan_status;
      if (p.systems.ventilation.air_inlet_status) runtime.airInlet = p.systems.ventilation.air_inlet_status;
    }
    if (p.systems.cooling?.hvac_status) {
      runtime.hvacStatus = p.systems.cooling.hvac_status;
    }
  }

  if (p.safety) {
    if (p.safety.rear_door_open != null) runtime.faults.doorOpen = p.safety.rear_door_open;
    if (p.safety.network_connection) {
      runtime.networkState = p.safety.network_connection.includes("ONLINE") ? "GOOD" : "BAD";
    }
    if (p.safety.alarm_code) runtime.alarmCode = p.safety.alarm_code;
    if (p.safety.sensor_status) runtime.sensorStatus = p.safety.sensor_status;
  }
}

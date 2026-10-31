/**
 * Config Console Telemetry Dispatcher (ES Module)
 * Membangun paket telemetri 25-field baku Paper 1 & data_truck.md,
 * memancarkannya via BroadcastChannel & LocalStorage dengan status jaringan Gilbert-Elliott
 */

import {
  STORAGE_KEYS,
  BROADCAST_CHANNEL_NAME
} from "../../shared/constants.js";
import { sha256Sync } from "../../shared/crypto.js";
import {
  runtime,
  getActiveExpedition,
  getActiveVehicle
} from "./state.js";
import { getDensePath } from "./engine.js";

const broadcast =
  typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel(BROADCAST_CHANNEL_NAME)
    : null;

/**
 * Memancarkan paket telemetri 25-field ke BroadcastChannel dan LocalStorage
 */
export function broadcastTelemetry(thi = 141.2, eci = 71.4, weightLoss = 0.5) {
  const exp = getActiveExpedition();
  if (!exp) return;

  const vehicle = getActiveVehicle();
  const densePath = getDensePath();
  const currentPt = densePath[runtime.currentIdx] || densePath[0] || {
    lat: -6.5650,
    lng: 107.7600,
    seg: 0,
    name: "Subang Hatchery (KM 0)"
  };
  const segIdx = currentPt.seg || 0;
  const currentCondition = (exp.segments && exp.segments[segIdx]) ? exp.segments[segIdx] : "FREE_FLOW";

  // Pembacaan sensor dengan injeksi anomali
  let readZ1 = parseFloat((runtime.z1_temp + runtime.driftOffset + (runtime.spikeActive ? 50.0 : 0.0)).toFixed(1));
  let readZ2 = parseFloat((runtime.z2_temp + runtime.driftOffset).toFixed(1));
  let readZ3 = parseFloat((runtime.z3_temp + runtime.driftOffset).toFixed(1));
  let readCO2 = runtime.stuckCO2Value !== null ? runtime.stuckCO2Value : Math.round(runtime.co2_ppm);

  if (runtime.nullSensorActive) {
    readZ1 = null;
    readZ2 = null;
    readZ3 = null;
    readCO2 = null;
  }

  // Hitung initial hash jika belum ada
  if (!runtime.payloadHash) {
    const initCanonical = `${exp.tripId}|${runtime.sequenceNumber}|${currentPt.lat.toFixed(4)},${currentPt.lng.toFixed(4)}|${runtime.z2_temp.toFixed(2)}|${runtime.co2_ppm}|${runtime.fuelLevelPct.toFixed(1)}|${runtime.prevHash}`;
    runtime.payloadHash = sha256Sync(initCanonical);
  }

  const chickQty = exp.quantity || 38400;
  const avgW = exp.averageWeightGrams || 42.0;
  const totalBiomass = parseFloat(((chickQty * avgW) / 1000).toFixed(1));

  // Paket Telemetri 25-Field Baku Sesuai Spesifikasi data_truck.md & Paper 1
  const packet = {
    // 1. Identitas & Urutan Paket
    identity: {
      truck_id: vehicle.truckId,
      trip_id: exp.tripId,
      delivery_order: exp.deliveryOrder || `DO-CPI-SBG-${exp.tripId.replace("TRIP-", "")}`,
      driver_name: exp.driverName,
      sequence_number: runtime.sequenceNumber,
      timestamp: new Date().toISOString()
    },

    // 2. Kinematika Kendaraan
    vehicle: {
      latitude: currentPt.lat,
      longitude: currentPt.lng,
      speed_kmh: Math.round(runtime.speed),
      heading_deg: runtime.bearingDeg,
      altitude_m: 125,
      vibration_rms_g: parseFloat(runtime.vibration.toFixed(2)),
      lateral_accel_g: runtime.lateralAccelG || 0.0,
      curve_radius_m: runtime.curveRadiusM || 5000,
      distance_traveled_km: parseFloat(runtime.distanceTraveledKm.toFixed(1)),
      total_distance_km: runtime.totalDistanceKm
    },

    // 3. Multi-Zone Cargo Microclimate
    microclimate: {
      temp_zone_1_c: readZ1,
      temp_zone_2_c: readZ2,
      temp_box_core_c: readZ2,
      temp_zone_3_c: readZ3,
      humidity_pct: parseFloat(runtime.z2_rh.toFixed(1)),
      co2_ppm: readCO2,
      ambient_temp_c: parseFloat(runtime.ambientTemp.toFixed(1)),
      ambient_humidity_pct: 74.5,
      solar_irradiance_wm2: Math.round(runtime.solarIrradiance),

      // Compatibility Object for Consumer Dashboard Leaflet/Chart.js
      zone_1_front: {
        temperature_c: readZ1 !== null ? readZ1 : 25.2,
        humidity_rh: parseFloat(runtime.z1_rh.toFixed(1))
      },
      zone_2_middle: {
        temperature_c: readZ2 !== null ? readZ2 : 25.6,
        humidity_rh: parseFloat(runtime.z2_rh.toFixed(1))
      },
      zone_3_rear: {
        temperature_c: readZ3 !== null ? readZ3 : 25.9,
        humidity_rh: parseFloat(runtime.z3_rh.toFixed(1))
      }
    },

    // 4. Indeks Biometrik Unggas (Paper 1 Model 5 & 6)
    biometrics: {
      strain: exp.strain || "Cobb 500",
      chick_quantity: chickQty,
      average_weight_g: avgW,
      total_biomass_kg: totalBiomass,
      thi_index: parseFloat(thi.toFixed(1)),
      eci_enthalpy_kj_kg: parseFloat(eci.toFixed(1)),
      estimated_weight_loss_pct: parseFloat(weightLoss.toFixed(2))
    },

    // 5. Aktuator & Sistem Tata Udara (data_truck.md Bagian 3)
    systems: {
      ventilation: {
        fan_status: runtime.fanSpeed,
        air_inlet_status: runtime.airInlet,
        roof_exhaust_active: runtime.fanSpeed === "HIGH"
      },
      cooling: {
        hvac_status: runtime.hvacStatus,
        temperature_setpoint_c: exp.setpoint || 25.0
      },
      power: {
        power_status: runtime.powerStatus,
        fuel_level_pct: parseFloat(runtime.fuelLevelPct.toFixed(1)),
        battery_voltage_v: parseFloat(runtime.batteryVoltage.toFixed(1))
      }
    },

    // 6. Keamanan & Keandalan Sensor (Paper 1 Bagian IV & Skenario D)
    safety: {
      rear_door_open: runtime.faults.doorOpen,
      door_open_duration_s: runtime.doorOpenDurationS,
      alarm_code: runtime.alarmCode,
      sensor_status: runtime.sensorStatus,
      network_connection: runtime.networkState === "GOOD" ? "ONLINE_4G_LTE" : "OFFLINE_LOCAL_BUFFER"
    },

    // Field Kompatibilitas dengan Antarmuka Monitor Eksisting (Backward Compatibility)
    engineRunning: runtime.engineRunning,
    elapsedSeconds: runtime.elapsedSec,
    chickCargo: {
      quantity: chickQty,
      strain: exp.strain || "Cobb 500",
      averageWeightGrams: avgW,
      totalBiomassKg: totalBiomass,
      breederAge: exp.breederAge || "Prime (30 - 50 Minggu)",
      gender: exp.gender || "As-Hatched (Campur 50:50)",
      boxType: exp.boxType || "Boks Plastik Berventilasi (Crate)",
      chicksPerBox: exp.chicksPerBox || 100
    },
    chickQuantity: chickQty,
    chillerSetpoint: exp.setpoint || 25.0,
    targetRH: exp.targetRH || 65,
    speedMultiplier: runtime.speedMultiplier,
    location: {
      latitude: currentPt.lat,
      longitude: currentPt.lng,
      altitude_m: 125,
      bearing_deg: runtime.bearingDeg,
      name: currentPt.name
    },
    kinematics: {
      speed_kmh: Math.round(runtime.speed),
      vibration_g: parseFloat(runtime.vibration.toFixed(2)),
      distanceTraveledKm: parseFloat(runtime.distanceTraveledKm.toFixed(1)),
      totalDistanceKm: runtime.totalDistanceKm
    },
    environment: {
      timeOfDay: exp.timeOfDay,
      weather: exp.weather,
      routeType: exp.routeType || "TOLL",
      ambientTemperature_c: parseFloat(runtime.ambientTemp.toFixed(1)),
      solarIrradiance_wm2: Math.round(runtime.solarIrradiance),
      currentRoadCondition: currentCondition,
      segments: exp.segments,
      signalSegments: exp.signalSegments
    },
    microclimate_legacy: {
      zone_1_front: { temperature_c: readZ1 || 25.2, humidity_rh: runtime.z1_rh },
      zone_2_middle: { temperature_c: readZ2 || 25.6, humidity_rh: runtime.z2_rh },
      zone_3_rear: { temperature_c: readZ3 || 25.9, humidity_rh: runtime.z3_rh },
      co2_ppm: readCO2 || 1150
    },
    subsystems: {
      chillerActive: runtime.hvacStatus === "COOLING",
      rearDoorOpen: runtime.faults.doorOpen,
      ventilationActive: runtime.fanSpeed !== "OFF",
      trafficStopActive: runtime.faults.trafficStop
    },
    expedition: {
      tripId: exp.tripId,
      deliveryOrder: exp.deliveryOrder || `DO-CPI-SBG-${exp.tripId.replace("TRIP-", "")}`,
      title: exp.title,
      routeType: exp.routeType || "TOLL",
      status: exp.status,
      origin: exp.origin,
      destination: exp.destination,
      departureTime: exp.departureTime
    },
    truck: {
      truckId: vehicle.truckId,
      licensePlate: vehicle.licensePlate,
      model: vehicle.model,
      capacity: vehicle.capacity,
      airflow: vehicle.airflow
    },
    driverName: exp.driverName
  };

  // Telemetri resmi dihasilkan secara otoritatif oleh backend FastAPI via WebSocket/REST.
  // Hindari menimpa telemetri riil dengan mock lokal.
}

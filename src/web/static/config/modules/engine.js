/**
 * Config Console Physics & Discrete Simulation Engine (ES Module)
 * Mengelola kalkulasi kinematika, termodinamika multi-zona, akumulasi CO2,
 * model kanal Gilbert-Elliott, dan siklus hidup discrete tick simulasi
 */

import {
  WAYPOINTS_RAW,
  ROAD_PARAMS,
  getRouteConfig,
  getWaypointsForRoute
} from "../../shared/constants.js";
import {
  calculateBearing,
  interpolateDensePath,
  getLookaheadCurveSpeed
} from "../../shared/geo.js";
import { sha256Sync } from "../../shared/crypto.js";
import {
  runtime,
  getActiveExpedition,
  getActiveVehicle,
  saveConfigData,
  expeditions
} from "./state.js";
import { broadcastTelemetry } from "./telemetry.js";
import {
  updateEngineUI,
  updateRightbar,
  renderExpeditionsTable,
  updateFaultUI
} from "./ui.js";

let densePath = [];

/**
 * Inisialisasi lintasan padat (interpolasi waypoints rute Tol atau Non-Tol)
 */
export function initDensePath(routeType = null) {
  const exp = getActiveExpedition();
  const currentRouteType = routeType || exp?.routeType || "TOLL";
  const waypoints = getWaypointsForRoute(currentRouteType);
  densePath = interpolateDensePath(waypoints, 10);
  const routeCfg = getRouteConfig(currentRouteType);
  if (exp && typeof exp.totalDistanceKm === "number" && exp.totalDistanceKm > 0) {
    runtime.totalDistanceKm = exp.totalDistanceKm;
  } else {
    runtime.totalDistanceKm = routeCfg.distanceKm;
  }
  return densePath;
}

/**
 * Mengambil lintasan padat aktif
 */
export function getDensePath() {
  if (!densePath || densePath.length === 0) {
    initDensePath();
  }
  return densePath;
}

const FAULT_API_MAP = {
  chillerFail: "CHILLER_FAIL",
  doorOpen: "DOOR_OPEN",
  ventFail: "VENT_STOP",
  trafficStop: "TRAFFIC_JAM",
  fuelEmpty: "FUEL_EMPTY",
  lowBattery: "LOW_BATTERY",
  blankSpot: "BLANK_SPOT",
  sensorDrift: "SENSOR_DRIFT",
  sensorFreeze: "SENSOR_FREEZE",
  sensorSpike: "SENSOR_SPIKE",
  sensorNull: "SENSOR_NULL"
};

// Sinkronisasi otomatis ke backend server FastAPI
export async function syncBackendStart(exp) {
  try {
    await fetch("/api/v1/simulation/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trip_id: exp.tripId,
        truck_id: exp.truckId || "TRUCK-AJ-36000-01",
        delivery_order: exp.deliveryOrder,
        driver_name: exp.driverName,
        route_type: exp.routeType || "TOLL",
        cargo_strain: exp.strain || "Cobb 500",
        cargo_quantity: exp.quantity || 36000,
        departure_date: exp.departureDate || "2026-10-31",
        departure_time: exp.departureTime || "08:00",
        weather: exp.weather || "SUNNY",
        speed_multiplier: runtime.speedMultiplier || 1.0
      })
    });
  } catch (e) {
    console.warn("Backend start sync warning:", e);
  }
}

export async function syncBackendPause(tripId) {
  try {
    await fetch("/api/v1/simulation/pause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: tripId })
    });
  } catch (e) {
    console.warn("Backend pause sync warning:", e);
  }
}

export async function syncBackendReset(tripId) {
  try {
    await fetch("/api/v1/simulation/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: tripId })
    });
  } catch (e) {
    console.warn("Backend reset sync warning:", e);
  }
}

export async function syncBackendSpeed(tripId, multiplier) {
  try {
    await fetch("/api/v1/simulation/speed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: tripId, multiplier: parseFloat(multiplier) })
    });
  } catch (e) {
    console.warn("Backend speed sync warning:", e);
  }
}

export async function syncBackendActuator(tripId, actuators) {
  try {
    await fetch("/api/v1/simulation/actuator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: tripId, ...actuators })
    });
  } catch (e) {
    console.warn("Backend actuator sync warning:", e);
  }
}

export async function syncBackendFault(tripId, anomalyType, active) {
  try {
    await fetch("/api/v1/simulation/inject-fault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: tripId, anomaly_type: anomalyType, active: active })
    });
  } catch (e) {
    console.warn("Backend fault sync warning:", e);
  }
}

export async function syncBackendSegments(tripId, segments) {
  try {
    const segMap = {};
    if (Array.isArray(segments)) {
      segments.forEach((seg, idx) => {
        segMap[idx.toString()] = seg;
      });
    } else if (typeof segments === "object" && segments !== null) {
      Object.assign(segMap, segments);
    }
    await fetch("/api/v1/simulation/configure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: tripId, route_segments: segMap })
    });
  } catch (e) {
    console.warn("Backend segment sync warning:", e);
  }
}

/**
 * Menghidupkan mesin dan memulai discrete ticker
 */
export function startEngine() {
  const exp = getActiveExpedition();
  if (!exp) {
    alert("⚠️ No registered dispatch manifests found. Please create a new dispatch manifest first.");
    return;
  }

  runtime.engineRunning = true;
  if (exp && exp.status !== "COMPLETED") {
    exp.status = "RUNNING";
    saveConfigData();
    renderExpeditionsTable();
    syncBackendStart(exp);
  }

  updateEngineUI();
  clearInterval(runtime.tickerInterval);
  runtime.tickerInterval = setInterval(
    simulationTick,
    Math.round(1000 / runtime.speedMultiplier)
  );
}

/**
 * Mematikan mesin dan menghentikan pergerakan
 */
export function stopEngine() {
  runtime.engineRunning = false;
  runtime.speed = 0;
  clearInterval(runtime.tickerInterval);

  const exp = getActiveExpedition();
  if (exp) {
    syncBackendPause(exp.tripId);
  }

  updateEngineUI();
  broadcastTelemetry();
}

/**
 * Reset posisi perjalanan kembali ke titik awal (Subang Hatchery)
 */
export function resetTrip() {
  stopEngine();
  const exp = getActiveExpedition();
  if (exp) {
    syncBackendReset(exp.tripId);
  }
  const routeCfg = getRouteConfig(exp?.routeType || "TOLL");
  initDensePath(exp?.routeType || "TOLL");

  runtime.currentIdx = 0;
  runtime.elapsedSec = 0;
  runtime.speed = 0;
  runtime.distanceTraveledKm = 0;
  runtime.totalDistanceKm = routeCfg.distanceKm;

  runtime.z1_temp = 25.2;
  runtime.z2_temp = 25.6;
  runtime.z3_temp = 25.9;
  runtime.z1_rh = 64.0;
  runtime.z2_rh = 63.5;
  runtime.z3_rh = 62.0;
  runtime.co2_ppm = 1150;

  runtime.fuelLevelPct = 100.0;
  runtime.batteryVoltage = 24.2;
  runtime.powerStatus = "AUX_GENSET";
  runtime.fanSpeed = "HIGH";
  runtime.airInlet = "OPEN";
  runtime.hvacStatus = "COOLING";
  runtime.doorOpenDurationS = 0;
  runtime.networkState = "GOOD";
  runtime.bufferedPacketsCount = 0;
  runtime.sensorStatus = "OK";
  runtime.alarmCode = "NORMAL";
  runtime.driftOffset = 0.0;
  runtime.stuckCO2Value = null;
  runtime.spikeActive = false;
  runtime.nullSensorActive = false;
  runtime.curveRadiusM = 5000;
  runtime.lateralAccelG = 0.0;
  runtime.driverNoise = 0.0;
  runtime.sequenceNumber = 1;
  runtime.prevHash = "0000000000000000000000000000000000000000000000000000000000000000";

  runtime.faults = {
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
  };

  updateFaultUI();
  updateRightbar();
  broadcastTelemetry();
}

/**
 * Mengatur kelipatan kecepatan simulasi (1x, 2x, 5x, 10x, 20x)
 */
export function setSpeedMultiplier(mult) {
  runtime.speedMultiplier = parseInt(mult, 10) || 1;
  const exp = getActiveExpedition();
  if (exp) {
    syncBackendSpeed(exp.tripId, runtime.speedMultiplier);
  }
  if (runtime.engineRunning) {
    clearInterval(runtime.tickerInterval);
    runtime.tickerInterval = setInterval(
      simulationTick,
      Math.round(1000 / runtime.speedMultiplier)
    );
  }
}

/**
 * Toggle kondisi fault injection
 */
export function toggleFault(faultKey) {
  if (faultKey in runtime.faults) {
    runtime.faults[faultKey] = !runtime.faults[faultKey];
    updateFaultUI();
    broadcastTelemetry();

    const exp = getActiveExpedition();
    if (exp && FAULT_API_MAP[faultKey]) {
      syncBackendFault(exp.tripId, FAULT_API_MAP[faultKey], runtime.faults[faultKey]);
    }
  }
}

/**
 * Discrete Tick Simulasi Fisika & Persamaan Diferensial Terkopel
 */
export function simulationTick() {
  if (!runtime.engineRunning) return;
  // Jika stream WebSocket aktif terhubung ke backend FastAPI, biarkan backend yang menghitung secara otoritatif
  if (typeof window !== "undefined" && window.__wsActive) return;
  runtime.elapsedSec++;

  const exp = getActiveExpedition();
  if (!exp) return;

  const vehicle = getActiveVehicle();
  const path = getDensePath();
  const currentPt = path[runtime.currentIdx] || path[0];
  const nextPt = path[Math.min(runtime.currentIdx + 1, path.length - 1)];
  const segIdx = currentPt.seg || 0;
  const currentCondition = (exp.segments && exp.segments[segIdx]) ? exp.segments[segIdx] : "FREE_FLOW";
  const roadParams = ROAD_PARAMS[currentCondition] || ROAD_PARAMS.FREE_FLOW;

  // A. KINEMATIKA & PROFIL KECEPATAN ADAPTIF (Model 10)
  // 1. Kecepatan dasar ruas jalan (Tol vs Non-Tol) & Modulator Jam Sibuk (Rush Hour Modulator)
  let vRoad = roadParams.targetSpeed;
  if (exp.routeType === "NON_TOLL") {
    vRoad = Math.round(vRoad * 0.68); // Batas kecepatan arteri komersial non-tol
  }

  // Modulator Jam Sibuk (Rush Hour Modulator)
  const depTimeParts = (exp.departureTime || "08:00").split(":");
  const depHour = parseFloat(depTimeParts[0]) || 8.0;
  const depMin = parseFloat(depTimeParts[1]) || 0.0;
  const simSeconds = (depHour * 3600 + depMin * 60 + (runtime.elapsedSec || 0)) % 86400;
  const simHour = simSeconds / 3600.0;

  const mornDip = 0.35 * Math.exp(-Math.pow(simHour - 7.5, 2) / (2.0 * Math.pow(0.9, 2)));
  const eveDip = 0.40 * Math.exp(-Math.pow(simHour - 17.5, 2) / (2.0 * Math.pow(1.1, 2)));
  const midDip = 0.08 * Math.exp(-Math.pow(simHour - 12.5, 2) / (2.0 * Math.pow(1.5, 2)));
  let rushDip = mornDip + eveDip + midDip;
  if (exp.routeType === "NON_TOLL") rushDip *= 1.25;
  const rushFactor = Math.max(0.45, Math.min(1.0, 1.0 - rushDip));
  runtime.rushHourFactor = Math.round(rushFactor * 100) / 100;
  vRoad = vRoad * rushFactor;

  if (runtime.faults.trafficStop) vRoad = 0;
  if (exp.weather === "HEAVY_STORM") vRoad = Math.max(0, vRoad * 0.6);

  const s = runtime.distanceTraveledKm || 0;

  // 2. First-Mile Departure Ramp-Up (Keberangkatan Subang Hatchery KM 0 - 3)
  // v_dep = 25.0 + (s / 3.0) * (v_road - 25.0)
  let vDep = vRoad;
  if (s < 3.0 && vRoad > 25.0) {
    vDep = 25.0 + (s / 3.0) * (vRoad - 25.0);
  }

  // 3. Last-Mile Arrival Slowdown (Kedatangan Broiler Farm Bogor 3.5 KM terakhir)
  // v_arr = 20.0 + (d_rem / 3.5) * (v_road - 20.0)
  const dRem = (runtime.totalDistanceKm || 145.0) - s;
  let vArr = vRoad;
  if (dRem <= 3.5 && vRoad > 20.0) {
    vArr = 20.0 + (Math.max(0, dRem) / 3.5) * (vRoad - 20.0);
  }

  // 4. Curve Governor & Deselerasi Prediktif Lookahead (a_lat_max <= 1.8 m/s^2)
  const curveInfo = getLookaheadCurveSpeed(path, runtime.currentIdx, 0.5, 1.2, 1.8);
  const vCurve = curveInfo.governedSpeedKmh;
  runtime.curveRadiusM = curveInfo.currentCurveRadiusM;

  // Gabungan batas deterministik
  const vDeterministic = Math.min(vRoad, vDep, vArr, vCurve);

  // 5. Stochastic Driver Micro-Fluctuations (Throttle Breathing η ∈ [-2.5, +2.5] km/h)
  let targetSpeed = vDeterministic;
  if (vDeterministic > 8.0) {
    const pulse = (Math.random() - 0.5) * 5.0;
    runtime.driverNoise = (runtime.driverNoise || 0) * 0.88 + 0.12 * pulse;
    targetSpeed = Math.max(5.0, vDeterministic + runtime.driverNoise);
  } else {
    runtime.driverNoise = 0;
  }

  // 6. Laju percepatan (4.0 km/h/s) dan pengereman (8.0 km/h/s)
  const accelRate = 4.0;
  const decelRate = 8.0;
  if (runtime.speed < targetSpeed) {
    runtime.speed = Math.min(targetSpeed, runtime.speed + accelRate);
  } else if (runtime.speed > targetSpeed) {
    runtime.speed = Math.max(targetSpeed, runtime.speed - decelRate);
  }

  // 7. Kalkulasi G-Force Akselerasi Lateral Sentripetal (kesejahteraan DOC)
  const vMs = runtime.speed / 3.6;
  if (runtime.curveRadiusM && runtime.curveRadiusM < 4500) {
    const aLat = (vMs * vMs) / runtime.curveRadiusM;
    runtime.lateralAccelG = Math.round((aLat / 9.81) * 1000) / 1000;
  } else {
    runtime.lateralAccelG = 0.0;
  }

  runtime.bearingDeg = Math.round(
    calculateBearing(currentPt.lat, currentPt.lng, nextPt.lat, nextPt.lng)
  );

  if (runtime.speed > 0) {
    const dtSeconds = 1.0;
    const distanceStepKm = (runtime.speed / 3600.0) * dtSeconds;
    runtime.distanceTraveledKm = Math.min(
      runtime.totalDistanceKm,
      runtime.distanceTraveledKm + distanceStepKm
    );
    runtime.currentIdx = Math.min(
      path.length - 1,
      Math.floor((runtime.distanceTraveledKm / runtime.totalDistanceKm) * (path.length - 1))
    );

    if (runtime.distanceTraveledKm >= runtime.totalDistanceKm) {
      stopEngine();
      exp.status = "COMPLETED";
      saveConfigData();
      renderExpeditionsTable();
      const routeCfg = getRouteConfig(exp.routeType || "TOLL");
      alert(`🎉 Dispatch ${exp.tripId} has arrived at destination (${exp.destination ? exp.destination.name : 'Bogor Broiler Farm'}) via ${routeCfg.name}! Journey of ${runtime.totalDistanceKm} km completed.`);
      return;
    }
  }

  // B. GETARAN RMS PERMUKAAN JALAN (Model 7)
  let noise = (Math.random() - 0.5) * 0.04;
  const nonTollVibBonus = exp.routeType === "NON_TOLL" ? 0.06 : 0.0;
  if (currentCondition === "DAMAGED_ROAD") {
    noise = (Math.random() - 0.5) * 0.40;
    runtime.vibration = Math.max(0.20, roadParams.baseVib + nonTollVibBonus + noise);
  } else if (runtime.speed === 0) {
    runtime.vibration = 0.02 + Math.random() * 0.01;
  } else {
    runtime.vibration = Math.max(0.04, roadParams.baseVib + nonTollVibBonus + noise);
  }

  // C. DINAMIKA CUACA & LINGKUNGAN AMBIEN
  if (exp.timeOfDay === "DAY") {
    runtime.ambientTemp = 34.0 + Math.sin(runtime.elapsedSec / 100) * 1.5;
    runtime.solarIrradiance = exp.weather === "SUNNY" ? 850 : (exp.weather === "LIGHT_RAIN" ? 350 : 150);
    if (exp.weather === "LIGHT_RAIN") runtime.ambientTemp -= 3.0;
    if (exp.weather === "HEAVY_STORM") runtime.ambientTemp -= 5.0;
  } else {
    runtime.ambientTemp = 24.5 - Math.min(2, runtime.elapsedSec / 300);
    runtime.solarIrradiance = 0;
    if (exp.weather === "HEAVY_STORM") runtime.ambientTemp -= 2.5;
  }

  // D. KONTROL PINTU & DURASI BUKAAN (Model 3)
  if (runtime.faults.doorOpen) {
    runtime.doorOpenDurationS++;
  } else {
    runtime.doorOpenDurationS = 0;
  }

  // E. SUB-SISTEM DAYA, GENSET & KELISTRIKAN
  if (runtime.faults.fuelEmpty) {
    runtime.fuelLevelPct = 0.0;
  } else {
    // Konsumsi bahan bakar genset pendingin: 0.005% per detik saat berjalan
    runtime.fuelLevelPct = Math.max(0, runtime.fuelLevelPct - 0.005);
  }

  if (runtime.faults.lowBattery) {
    runtime.batteryVoltage = 10.8 + (Math.random() * 0.3);
  } else {
    runtime.batteryVoltage = 24.2 + (Math.random() - 0.5) * 0.15;
  }

  // F. STATUS HVAC & INTERLOCK SISTEM
  const isChillerPowered = runtime.fuelLevelPct > 0 && runtime.batteryVoltage >= 11.5;
  if (!isChillerPowered || runtime.faults.chillerFail) {
    runtime.hvacStatus = "STANDBY";
  } else {
    runtime.hvacStatus = "COOLING";
  }

  // G. AKTUATOR VENTILASI (KIPAS & DAMPER)
  if (runtime.faults.ventFail) {
    runtime.fanSpeed = "OFF";
    runtime.airInlet = "CLOSED";
  }

  let fanCoolingCoeff = 1.0;
  let fanVentCoeff = 1.0;
  if (runtime.fanSpeed === "MED") {
    fanCoolingCoeff = 0.75;
    fanVentCoeff = 0.70;
  } else if (runtime.fanSpeed === "LOW") {
    fanCoolingCoeff = 0.45;
    fanVentCoeff = 0.40;
  } else if (runtime.fanSpeed === "OFF") {
    fanCoolingCoeff = 0.05;
    fanVentCoeff = 0.02;
  }

  // H. TERMODINAMIKA MIKROKLIMAT KARGO 3-ZONA (Model 1, Model 2, Model 3)
  const chickQuantity = exp.quantity || 38400;
  const chickMetabolicHeat = 0.025 * (chickQuantity / 38400);
  const solarFactor = (runtime.solarIrradiance / 1000) * 0.03;
  const doorInflowZ3 = runtime.faults.doorOpen ? (runtime.ambientTemp - runtime.z3_temp) * 0.08 : 0.0;
  const doorInflowZ1 = runtime.faults.doorOpen ? (runtime.ambientTemp - runtime.z1_temp) * 0.015 : 0.0;

  if (runtime.hvacStatus === "STANDBY") {
    // Mode Kerusakan / Truk Modifikasi Blower Tropis Audy Joinaldy (2020)
    if (vehicle.model && vehicle.model.includes("Audy Joinaldy")) {
      const targetRegressT = 1.2385 * runtime.ambientTemp - 6.2567;
      runtime.z2_temp += (targetRegressT - runtime.z2_temp) * 0.035;
      runtime.z1_temp += (targetRegressT - 0.4 - runtime.z1_temp) * 0.035;
      runtime.z3_temp += (targetRegressT + 0.6 - runtime.z3_temp) * 0.035;
    } else {
      runtime.z1_temp += (chickMetabolicHeat * 0.8) + (solarFactor * 0.5) + doorInflowZ1;
      runtime.z2_temp += (chickMetabolicHeat * 1.2) + (solarFactor * 0.9);
      runtime.z3_temp += (chickMetabolicHeat * 1.0) + (solarFactor * 1.3) + doorInflowZ3;
    }
  } else {
    // Mode Pendingin Normal Sesuai Setpoint
    const setpoint = exp.setpoint || 25.0;
    const coolingRate = 0.045 * fanCoolingCoeff;

    runtime.z1_temp += (chickMetabolicHeat * 0.7) + (solarFactor * 0.4) - (coolingRate * 1.2) + doorInflowZ1;
    runtime.z2_temp += (chickMetabolicHeat * 1.1) + (solarFactor * 0.8) - (coolingRate * 0.95);
    runtime.z3_temp += (chickMetabolicHeat * 0.9) + (solarFactor * 1.1) - (coolingRate * 0.75) + doorInflowZ3;

    // Tarik mendekati setpoint
    runtime.z1_temp += (setpoint - runtime.z1_temp) * 0.025;
    runtime.z2_temp += (setpoint + 0.5 - runtime.z2_temp) * 0.020;
    runtime.z3_temp += (setpoint + 0.8 - runtime.z3_temp) * 0.018;
  }

  // Batas fisik suhu kargo
  runtime.z1_temp = Math.max(18.0, Math.min(42.0, runtime.z1_temp + (Math.random() - 0.5) * 0.04));
  runtime.z2_temp = Math.max(18.5, Math.min(44.0, runtime.z2_temp + (Math.random() - 0.5) * 0.04));
  runtime.z3_temp = Math.max(19.0, Math.min(45.0, runtime.z3_temp + (Math.random() - 0.5) * 0.04));

  // I. NERACA MASSA UAP AIR & KELEMBAPAN RELATIF (Model 8)
  const targetRH = exp.targetRH || 65;
  if (runtime.hvacStatus === "STANDBY" && runtime.fanSpeed === "OFF") {
    // Evaporasi dari DOC menumpuk kelembapan
    runtime.z1_rh = Math.min(95, runtime.z1_rh + 0.06);
    runtime.z2_rh = Math.min(95, runtime.z2_rh + 0.08);
    runtime.z3_rh = Math.min(95, runtime.z3_rh + 0.07);
  } else {
    runtime.z1_rh += (targetRH - runtime.z1_rh) * 0.02;
    runtime.z2_rh += (targetRH - 2.0 - runtime.z2_rh) * 0.02;
    runtime.z3_rh += (targetRH - 3.5 - runtime.z3_rh) * 0.02;
  }

  // J. DINAMIKA GAS CO2 & INDUKSI RAM-AIR (Model 4)
  const ramAirBonus =
    runtime.airInlet === "OPEN"
      ? (runtime.speed / 80) * 12
      : (runtime.airInlet === "PARTIAL" ? (runtime.speed / 80) * 6 : 0);

  if (runtime.fanSpeed === "OFF" || (runtime.speed === 0 && runtime.airInlet === "CLOSED")) {
    runtime.co2_ppm = Math.min(5000, runtime.co2_ppm + 16);
  } else {
    const targetCO2 = 1050 - (ramAirBonus * 10);
    runtime.co2_ppm += (targetCO2 - runtime.co2_ppm) * (0.04 * fanVentCoeff) + (Math.random() - 0.5) * 6;
  }

  // K. INJEKSI ANOMALI SENSOR (Model 11 & Paper 1 Metode 10)
  if (runtime.faults.sensorDrift) {
    runtime.driftOffset += 0.008; // Akumulasi drift perlahan naik
  } else {
    runtime.driftOffset = 0.0;
  }

  if (runtime.faults.sensorFreeze) {
    if (runtime.stuckCO2Value === null) runtime.stuckCO2Value = Math.round(runtime.co2_ppm);
  } else {
    runtime.stuckCO2Value = null;
  }

  runtime.spikeActive = runtime.faults.sensorSpike && (runtime.elapsedSec % 8 === 0);
  runtime.nullSensorActive = runtime.faults.sensorNull;

  // Evaluasi Status Sensor
  if (runtime.nullSensorActive) {
    runtime.sensorStatus = "FAULT";
  } else if (runtime.faults.sensorDrift || runtime.faults.sensorFreeze || runtime.faults.sensorSpike) {
    runtime.sensorStatus = "DEGRADED";
  } else {
    runtime.sensorStatus = "OK";
  }

  // L. EVALUASI ALARM KESELAMATAN & KODE PERINGATAN
  if (runtime.fuelLevelPct < 15) {
    runtime.alarmCode = "ALARM_LOW_FUEL";
  } else if (runtime.batteryVoltage < 11.5) {
    runtime.alarmCode = "ALARM_LOW_BATTERY";
  } else if (runtime.co2_ppm > 2500) {
    runtime.alarmCode = "ALARM_CO2_CRITICAL";
  } else if (runtime.z2_temp > 29.5) {
    runtime.alarmCode = "ALARM_TEMP_VIOLATION";
  } else if (runtime.doorOpenDurationS > 300) {
    runtime.alarmCode = "ALARM_DOOR_BREACH";
  } else if (runtime.sensorStatus !== "OK") {
    runtime.alarmCode = "ALARM_SENSOR_DEGRADED";
  } else {
    runtime.alarmCode = "NORMAL";
  }

  // M. MODEL KANAL JARINGAN GILBERT-ELLIOTT (Model 9 & Paper 1 Metode 9)
  const isBadSignal = runtime.faults.blankSpot || (exp.signalSegments && exp.signalSegments[segIdx] === "BAD");
  const isFadingSignal = exp.signalSegments && exp.signalSegments[segIdx] === "FADING";

  if (isBadSignal) {
    runtime.networkState = "BAD";
    runtime.bufferedPacketsCount++;
  } else if (isFadingSignal) {
    if (Math.random() < 0.3) {
      runtime.networkState = "BAD";
      runtime.bufferedPacketsCount++;
    } else {
      runtime.networkState = "GOOD";
    }
  } else {
    runtime.networkState = "GOOD";
    runtime.bufferedPacketsCount = 0;
  }

  // N. INDEKS BIOMETRIK UNGGAS REAL-TIME (Model 5 & Model 6)
  const avgTemp = (runtime.z1_temp + runtime.z2_temp + runtime.z3_temp) / 3;
  const avgRH = (runtime.z1_rh + runtime.z2_rh + runtime.z3_rh) / 3;
  const thi = 0.8 * avgTemp + (avgRH / 100) * (avgTemp - 14.4) + 46.4;

  const satVapor = 0.61078 * Math.exp((17.27 * avgTemp) / (avgTemp + 237.3));
  const actualVapor = (avgRH / 100) * satVapor;
  const specHumidityW = (0.622 * actualVapor) / (101.325 - actualVapor);
  const eci = 1.006 * avgTemp + specHumidityW * (2501 + 1.805 * avgTemp);

  const hours = runtime.elapsedSec / 3600;
  const phiStress =
    thi < 142 ? 1.0 : (thi < 160 ? 1.0 + 0.015 * (thi - 142) : 1.27 + 0.035 * (thi - 160));
  const weightLossPct = Math.min(
    15.0,
    (0.38 * Math.pow(Math.max(0.01, hours), 0.65) + 0.0045 * runtime.distanceTraveledKm) * phiStress
  );

  // O. KRIPTOGRAFI MONOTONIK & MERKLE HASH CHAINING (Model 12 & Paper 1 Metode 12)
  runtime.sequenceNumber++;
  const canonicalString = `${exp.tripId}|${runtime.sequenceNumber}|${currentPt.lat.toFixed(4)},${currentPt.lng.toFixed(4)}|${avgTemp.toFixed(2)}|${runtime.co2_ppm}|${runtime.fuelLevelPct.toFixed(1)}|${runtime.prevHash}`;
  const currentHash = sha256Sync(canonicalString);
  runtime.payloadHash = currentHash;
  runtime.prevHash = currentHash;

  updateRightbar();
  broadcastTelemetry(thi, eci, weightLossPct);
}

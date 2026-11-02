/**
 * Monitor Telemetry Ingestion & Consumer Module (ES Module)
 * Mengonsumsi data stream telemetri 1 Hz dari backend FastAPI (WebSocket / REST),
 * memperbarui DOM kartu telemetri, evaluasi kesejahteraan unggas (welfare index),
 * grafik sliding window, dan terminal raw JSON.
 */

import {
  WAYPOINTS_RAW,
  ROAD_PARAMS,
  getRouteConfig
} from "../../shared/constants.js";
import { evaluateWelfareStatus } from "../../shared/biometrics.js";
import {
  selectedTripId,
  expeditions,
  vehicles,
  packetCounter,
  incrementPacketCounter,
  registerNewPacket,
  lastNewPacketWallTime,
  isWsConnected,
  lastKnownTruckPositions
} from "./state.js";
import { updateTruckPosition, renderSegmentPolylines, clearTrail, updateRouteSegmentColors } from "./map.js";
import { pushChartSample, clearChartHistory } from "./chart.js";
import { updateTripStatusPill } from "./trip-selector.js";

/**
 * Format timestamp simulasi ISO ke jam dan tanggal lokal dunia simulasi (WIB)
 */
export function formatSimulationClock(isoTimestamp, fallbackDate = null, fallbackTime = null) {
  if (isoTimestamp && typeof isoTimestamp === "string" && isoTimestamp.includes("T")) {
    const [datePart, timeRaw] = isoTimestamp.split("T");
    const timeClean = timeRaw ? timeRaw.replace("Z", "").slice(0, 8) : "08:00:00";
    return {
      time: `${timeClean} WIB`,
      date: datePart,
      timeRaw: timeClean
    };
  }
  const d = fallbackDate || "2026-11-01";
  const t = (fallbackTime ? (fallbackTime.length === 5 ? `${fallbackTime}:00` : fallbackTime) : "08:00:00");
  return {
    time: `${t} WIB`,
    date: d,
    timeRaw: t
  };
}

/**
 * Konsumsi dan render paket telemetri masuk ke dashboard DOM
 * Mendukung format 25-field baku FastAPI (identity, vehicle, microclimate, biometrics, systems, safety)
 * serta kompatibilitas backward BroadcastChannel simulator.
 */
export function consumePacket(p) {
  if (!p) return;
  const seq = p.identity?.sequence_number;
  const ts = p.identity?.timestamp;
  const isNew = registerNewPacket(seq, ts);
  const currentCounter = isNew ? incrementPacketCounter() : packetCounter;

  // 1. Ekstraksi Identitas & Ekspedisi Terkait
  const tripId = p.identity?.trip_id || p.expedition?.tripId || selectedTripId;
  const exp = expeditions.find(e => e.tripId === tripId) || expeditions.find(e => e.tripId === selectedTripId);
  const truckId = p.identity?.truck_id || p.truck?.truckId || exp?.truckId || "TRUCK-AJ-36000-01";
  const vehicle = vehicles.find(v => v.truckId === truckId) || (vehicles.length > 0 ? vehicles[0] : null);

  // Simpan posisi terakhir dari paket telemetri jika valid
  if (p.vehicle && p.vehicle.latitude != null && p.vehicle.longitude != null) {
    const pos = {
      lat: p.vehicle.latitude,
      lng: p.vehicle.longitude,
      heading: p.vehicle.heading_deg != null ? p.vehicle.heading_deg : 0,
      distanceKm: p.vehicle.distance_traveled_km != null ? p.vehicle.distance_traveled_km : 0,
      locationName: p.vehicle.location_name || ""
    };
    lastKnownTruckPositions[tripId] = pos;
    if (truckId) lastKnownTruckPositions[truckId] = pos;
  }

  // 2. Deteksi Status Operasional Mesin / Simulasi
  // Prioritas utama: jika stream aktif menyatakan engineRunning === true atau tripStatus === "RUNNING", mesin AKTIF berjalan!
  const isStreamActive = p.engineRunning === true || p.tripStatus === "RUNNING";
  const isCompleted = p.tripStatus === "COMPLETED" || exp?.status === "COMPLETED";
  const isEngineRunning = !isCompleted && (isStreamActive || (exp?.status === "RUNNING" && p.engineRunning !== false));
  const isPaused = !isCompleted && !isEngineRunning && (p.tripStatus === "PAUSED" || exp?.status === "PAUSED");
  const isScheduled = !isCompleted && !isEngineRunning && !isPaused;

  // Sinkronkan status ekspedisi jika payload menyatakan running atau paused
  if (isEngineRunning && exp && exp.status !== "RUNNING") {
    exp.status = "RUNNING";
    updateTripStatusPill();
  } else if (isPaused && exp && exp.status !== "PAUSED") {
    exp.status = "PAUSED";
    updateTripStatusPill();
  }

  // Jika mesin mati (SCHEDULED, PAUSED, atau engineRunning === false dan bukan COMPLETED),
  // kosongkan seluruh sensor telemetri, tetapi kunci posisi truk pada state/posisi terakhir
  if (!isEngineRunning && !isCompleted) {
    renderStandbyState(exp, p);
    return;
  }

  // 3. Tampilkan / Sembunyikan Banner Status Mesin
  const banner = document.getElementById("engineOffBanner");
  if (banner) {
    if (isEngineRunning) {
      banner.classList.add("hidden");
    } else {
      banner.classList.remove("hidden");
      const bTitle = document.getElementById("bannerTitle");
      const bDesc = document.getElementById("bannerDesc");
      if (isCompleted) {
        if (bTitle) bTitle.innerText = "Delivery Completed (Archived History)";
        if (bDesc) bDesc.innerText = `Cargo delivered to destination (${exp?.destination?.name || "Bogor Broiler Farm"}). All telematics data securely archived.`;
      } else if (isPaused) {
        if (bTitle) bTitle.innerText = "Simulation Paused (Engine Inactive)";
        if (bDesc) bDesc.innerText = "Telemetry streaming paused. Press 'Start Engine' on simulator control console to resume transit.";
      } else {
        if (bTitle) bTitle.innerText = "Vehicle Parked / Engine Inactive";
        if (bDesc) bDesc.innerText = `Fleet vehicle ${truckId} is currently on standby at ${exp?.origin?.name || "origin depot"}.`;
      }
    }
  }

  // 4. Timer / Waktu Tempuh Simulasi & Jam Realtime Dunia Simulasi
  const elapsed = p.elapsedSeconds != null 
    ? p.elapsedSeconds 
    : (p.identity?.sequence_number || 0);
  const hrs = String(Math.floor(elapsed / 3600)).padStart(2, "0");
  const mins = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
  const secs = String(elapsed % 60).padStart(2, "0");
  const timerEl = document.getElementById("tripTimer");
  if (timerEl) timerEl.innerText = `${hrs}:${mins}:${secs}`;

  const rawSimTs = p.identity?.timestamp || p.timestamp;
  const simClock = formatSimulationClock(rawSimTs, exp?.departureDate, exp?.departureTime);
  const simTimeEl = document.getElementById("simClockTime");
  if (simTimeEl) simTimeEl.innerText = simClock.time;
  const simDateEl = document.getElementById("simClockDate");
  if (simDateEl) simDateEl.innerText = simClock.date;
  const barSimClock = document.getElementById("barSimClock");
  if (barSimClock) barSimClock.innerText = simClock.time;

  // 5. Cargo Summary Header (Top Summary Bar)
  const doCode = p.identity?.delivery_order || p.expedition?.deliveryOrder || exp?.deliveryOrder || `DO-CPI-SBG-${tripId?.replace("TRIP-", "") || "01"}`;
  const doEl = document.getElementById("barDO");
  if (doEl) doEl.innerText = doCode;

  const truckEl = document.getElementById("barTruckId");
  if (truckEl) {
    const plate = vehicle?.licensePlate || p.truck?.licensePlate || "DD 8741 XY";
    truckEl.innerText = `${truckId} (${plate})`;
  }

  const modelEl = document.getElementById("barModel");
  if (modelEl) {
    modelEl.innerText = vehicle?.model || p.truck?.model || "Tropical Blower Modified Truck";
  }

  const strain = p.biometrics?.strain || p.chickCargo?.strain || exp?.strain || "Cobb 500";
  const biomass = p.biometrics?.total_biomass_kg || p.chickCargo?.totalBiomassKg || ((exp?.quantity || 36000) * 0.042);
  const strainEl = document.getElementById("barStrain");
  if (strainEl) {
    strainEl.innerText = `${strain} (${Math.round(biomass).toLocaleString("en-US")} kg)`;
  }

  const drvEl = document.getElementById("barDriver");
  if (drvEl) drvEl.innerText = p.identity?.driver_name || p.driverName || exp?.driverName || "Rahmat Santoso";

  const qty = p.biometrics?.chick_quantity || p.chickQuantity || exp?.quantity || 36000;
  const loadEl = document.getElementById("barLoad");
  if (loadEl) loadEl.innerText = `${qty.toLocaleString("en-US")} DOC`;

  const packagingEl = document.getElementById("barPackaging");
  if (packagingEl) {
    const bType = p.chickCargo?.boxType || exp?.boxType || "Ventilated Plastic Crates";
    const shortBox = bType.includes("Plastic") || bType.includes("Plastik") ? "Plastic Crate" : "Cardboard Box";
    const perBox = p.chickCargo?.chicksPerBox || exp?.chicksPerBox || 100;
    packagingEl.innerText = `${shortBox} (${perBox}/box)`;
  }

  // 6. Route, Distance & Environment
  const routeType = exp?.routeType || "TOLL";
  const totalDist = p.vehicle?.total_distance_km || exp?.totalDistanceKm || 146.91;

  const pillRoute = document.getElementById("pillRouteType");
  if (pillRoute) {
    const isNT = routeType === "NON_TOLL";
    const icon = isNT ? "🛤️" : "🛣️";
    const name = isNT ? `Non-Toll (${totalDist} km)` : `Toll (${totalDist} km)`;
    pillRoute.innerHTML = `<span class="icon">${icon}</span> Route: <strong id="barRouteType">${name}</strong>`;
  }

  // Dispatch Manifest Departure Schedule (Real Date & Time)
  const depDate = exp?.departureDate || (p.identity?.timestamp ? p.identity.timestamp.slice(0, 10) : "2026-10-31");
  const depTime = exp?.departureTime || "08:00";
  const hour = parseInt(depTime.split(":")[0]) || 8;
  const isDay = hour >= 6 && hour < 18;
  const timeLabel = `${depDate} • ${depTime} WIB (${isDay ? "Daytime" : "Nighttime"})`;
  const pillTime = document.getElementById("pillTime");
  if (pillTime) {
    pillTime.innerHTML = `<span class="icon">${isDay ? "☀️" : "🌙"}</span> Schedule: <strong>${timeLabel}</strong>`;
  }

  // Weather (extracted from dispatch manifest)
  const rawWeather = exp?.weather || p.weather || "SUNNY";
  const weatherLabel =
    rawWeather === "SUNNY"
      ? "Clear"
      : rawWeather === "LIGHT_RAIN"
      ? "Light Rain"
      : rawWeather === "HEAVY_STORM"
      ? "Heavy Storm"
      : rawWeather;
  const weatherIcon = rawWeather === "SUNNY" ? "☀️" : (rawWeather === "LIGHT_RAIN" ? "🌧️" : "⛈️");
  const pillWeather = document.getElementById("pillWeather");
  if (pillWeather) {
    pillWeather.innerHTML = `<span class="icon">${weatherIcon}</span> Weather: <strong>${weatherLabel}</strong>`;
  }

  // Traffic / Roadway Conditions (evaluated from live vehicle speed & Rush Hour Modulator)
  const currentSpeed = isEngineRunning ? (p.vehicle?.speed_kmh != null ? p.vehicle.speed_kmh : 0) : 0;
  
  let isRushHour = false;
  let rushName = "";
  if (p.identity?.timestamp) {
    try {
      const dtObj = new Date(p.identity.timestamp);
      const h = dtObj.getUTCHours() + (dtObj.getUTCMinutes() / 60.0);
      if (h >= 6.5 && h <= 9.0) {
        isRushHour = true;
        rushName = "JAM SIBUK PAGI";
      } else if (h >= 16.0 && h <= 19.0) {
        isRushHour = true;
        rushName = "JAM SIBUK SORE";
      }
    } catch (e) {}
  }

  let roadLabel = "FREE FLOW (EXPRESSWAY)";
  let roadClass = "badge-flow";
  if (!isEngineRunning) {
    roadLabel = isCompleted ? "ARRIVED AT DESTINATION" : (isPaused ? "SIMULATION PAUSED" : "PARKED / ENGINE OFF");
    roadClass = "badge-gridlock";
  } else if (currentSpeed === 0) {
    roadLabel = "STOPPED (0 km/h)";
    roadClass = "badge-gridlock";
  } else if (isRushHour && currentSpeed < 60) {
    roadLabel = `RUSH HOUR ${rushName} (${Math.round(currentSpeed)} km/h)`;
    roadClass = "badge-congested";
  } else if (currentSpeed < 40) {
    roadLabel = `CONGESTED / SLOW (${Math.round(currentSpeed)} km/h)`;
    roadClass = "badge-congested";
  } else {
    const isNT = routeType === "NON_TOLL";
    roadLabel = isNT ? `FREE FLOW (${Math.round(currentSpeed)} km/h)` : `FREE FLOW (EXPRESSWAY ${Math.round(currentSpeed)} km/h)`;
    roadClass = "badge-flow";
  }
  const roadBadge = document.getElementById("currentRoadBadge");
  if (roadBadge) {
    roadBadge.innerText = roadLabel;
    roadBadge.className = roadClass;
  }

  // Sinkronkan warna segmen jalan, zona bottleneck, dan gangguan sinyal setiap 10 tick telemetri
  if (p.identity?.sequence_number && p.identity.sequence_number % 10 === 0 && selectedTripId) {
    fetch(`/api/v1/simulation/status?trip_id=${encodeURIComponent(selectedTripId)}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data && data.road_conditions) {
          updateRouteSegmentColors(
            data.road_conditions,
            data.road_hazard_zones,
            data.signal_conditions,
            data.signal_hazard_zones
          );
        }
      })
      .catch(() => {});
  }

  // 7. Kinematika Truk (Kecepatan, Guncangan, Jarak Tempuh)
  const speed = currentSpeed;
  const vibration = p.vehicle?.vibration_rms_g != null ? p.vehicle.vibration_rms_g : 0.08;
  const distTraveled = p.vehicle?.distance_traveled_km != null ? p.vehicle.distance_traveled_km : 0;
  const ambTemp = p.microclimate?.ambient_temp_c != null ? p.microclimate.ambient_temp_c : 32.0;
  const solarIrr = p.microclimate?.solar_irradiance_wm2 != null ? p.microclimate.solar_irradiance_wm2 : 850;

  const spdEl = document.getElementById("valSpeed");
  if (spdEl) spdEl.innerHTML = `${Math.round(speed)} <small>km/h</small>`;

  const vibEl = document.getElementById("valVibration");
  if (vibEl) vibEl.innerHTML = `${vibration.toFixed(2)} <small>g</small>`;

  const ambEl = document.getElementById("valAmbient");
  if (ambEl) ambEl.innerHTML = `${ambTemp.toFixed(1)} <small>°C</small>`;

  const distEl = document.getElementById("valDistance");
  if (distEl) distEl.innerHTML = `${distTraveled.toFixed(1)} <small>/ ${totalDist} km</small>`;

  const odoEl = document.getElementById("subOdo");
  if (odoEl) odoEl.innerText = `Odometer: ${distTraveled.toFixed(1)} km`;

  const solEl = document.getElementById("subSolar");
  if (solEl) solEl.innerText = `Radiation: ${Math.round(solarIrr)} W/m²`;

  const pct = Math.min(100, Math.round((distTraveled / (totalDist || 145)) * 100));
  const progEl = document.getElementById("subProgress");
  if (progEl) progEl.innerText = `Progress: ${pct}%`;

  const subVibEl = document.getElementById("subVibStatus");
  if (subVibEl) {
    if (vibration > 0.40) {
      subVibEl.innerText = "⚠️ Severe Vibration!";
      subVibEl.style.color = "#ea580c";
    } else {
      subVibEl.innerText = "Normal (Smooth Ride)";
      subVibEl.style.color = "#64748b";
    }
  }

  // 8. Pembaruan Posisi GPS di Peta Leaflet
  const lat = p.vehicle?.latitude != null ? p.vehicle.latitude : (p.location?.latitude || -6.5650);
  const lng = p.vehicle?.longitude != null ? p.vehicle.longitude : (p.location?.longitude || 107.7600);
  const bearing = p.vehicle?.heading_deg != null ? p.vehicle.heading_deg : (p.location?.bearing_deg || 0);

  const coordBadge = document.getElementById("gpsCoordBadge");
  if (coordBadge) coordBadge.innerText = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;

  const bearBadge = document.getElementById("bearingBadge");
  if (bearBadge) bearBadge.innerText = `Bearing: ${Math.round(bearing)}°`;

  updateTruckPosition(lat, lng, bearing, isEngineRunning);

  // 9. 3-Zona Suhu & Kelembaban Mikroklimat Kargo DOC
  const z1Temp = p.microclimate?.temp_zone_1_c != null ? p.microclimate.temp_zone_1_c : (p.microclimate?.zone_1_front?.temperature_c ?? 25.5);
  const z2Temp = p.microclimate?.temp_zone_2_c != null ? p.microclimate.temp_zone_2_c : (p.microclimate?.zone_2_middle?.temperature_c ?? 25.8);
  const z3Temp = p.microclimate?.temp_zone_3_c != null ? p.microclimate.temp_zone_3_c : (p.microclimate?.zone_3_rear?.temperature_c ?? 26.0);
  const rhVal = p.microclimate?.humidity_pct != null ? p.microclimate.humidity_pct : (p.microclimate?.zone_1_front?.humidity_rh ?? 65.0);
  const co2Ppm = p.microclimate?.co2_ppm != null ? p.microclimate.co2_ppm : 950;

  renderZoneCard(1, z1Temp, rhVal);
  renderZoneCard(2, z2Temp, rhVal);
  renderZoneCard(3, z3Temp, rhVal);

  // 10. Evaluasi Indeks Kesejahteraan (Welfare Evaluation)
  const maxTemp = Math.max(z1Temp, z2Temp, z3Temp);
  const minTemp = Math.min(z1Temp, z2Temp, z3Temp);
  const welfare = evaluateWelfareStatus(maxTemp, minTemp, co2Ppm);
  const welfareEl = document.getElementById("welfareBadge");
  if (welfareEl) {
    welfareEl.innerText = welfare.label;
    welfareEl.className = welfare.statusClass;
  }

  // 11. Bar Karbon Dioksida (CO2)
  const co2ValEl = document.getElementById("valCO2");
  if (co2ValEl) co2ValEl.innerText = `${co2Ppm} ppm`;
  const co2Pct = Math.min(100, Math.round((co2Ppm / 3000) * 100));
  const co2Bar = document.getElementById("barCO2");
  if (co2Bar) {
    co2Bar.style.width = `${co2Pct}%`;
    co2Bar.style.backgroundColor = co2Ppm > 2000 ? "#ef4444" : (co2Ppm > 1500 ? "#f59e0b" : "#3b82f6");
  }

  // 12. Status Chiller / HVAC
  const chillerPill = document.getElementById("chillerStatusPill");
  if (chillerPill) {
    const coolingSys = p.systems?.cooling;
    const isChillerOn = coolingSys ? coolingSys.hvac_status === "COOLING" : false;
    const isNonAC = vehicle?.templateKey === "joinaldy" || (vehicle?.model && vehicle.model.toLowerCase().includes("blower"));
    if (isNonAC) {
      chillerPill.innerText = "💨 Ventilation: ACTIVE (Ambient Airflow)";
      chillerPill.className = "subsystem-pill";
    } else if (!isChillerOn) {
      chillerPill.innerText = "❌ Chiller: STANDBY / OFF";
      chillerPill.className = "subsystem-pill chiller-off";
    } else {
      const sp = coolingSys?.temperature_setpoint_c || 25.0;
      chillerPill.innerText = `❄️ Chiller: ON (Set ${sp.toFixed(1)}°C)`;
      chillerPill.className = "subsystem-pill";
    }
  }

  // 13. Pembaruan Sampel Grafik Chart.js (hanya pada paket baru)
  if (isNew) {
    pushChartSample(elapsed, z1Temp, z2Temp, z3Temp, ambTemp, speed, vibration);
  }

  // 14. Terminal Raw Stream Telemetri JSON
  const timestampStr = p.identity?.timestamp || p.timestamp || new Date().toISOString();
  const tsEl = document.getElementById("packetTs");
  if (tsEl) tsEl.innerText = `Timestamp: ${timestampStr}`;

  const jsonEl = document.getElementById("jsonPayloadDisplay");
  if (jsonEl) jsonEl.innerText = JSON.stringify(p, null, 2);

  // Animasi detak indikator live stream jika data baru
  const pulseEl = document.getElementById("streamPulse");
  if (pulseEl && isNew) {
    pulseEl.style.opacity = "1";
    pulseEl.style.transform = "scale(1.3)";
    setTimeout(() => {
      pulseEl.style.transform = "scale(1.0)";
    }, 180);
  }

  // Perbarui indikator visual watchdog streaming
  updateWatchdogUI();
}

/**
 * Perbarui indikator visual status streaming (Watchdog / Heartbeat)
 * Mendeteksi apakah stream telemetri aktif, terhenti (stale), dijeda (paused), atau terputus
 */
export function updateWatchdogUI() {
  const exp = expeditions.find(e => e.tripId === selectedTripId);
  const tripStatus = exp?.status || "SCHEDULED";
  const now = Date.now();
  const timeSinceNew = lastNewPacketWallTime > 0 ? (now - lastNewPacketWallTime) : Infinity;

  const badgeEl = document.getElementById("liveStreamBadge");
  const textEl = document.getElementById("liveStreamText");
  const timeEl = document.getElementById("liveStreamTime");
  const streamPulseEl = document.getElementById("streamPulse");
  const streamMetaEl = document.getElementById("streamMeta");

  let state = "live";
  let label = "LIVE 1.0 Hz";
  let timeText = "";

  if (tripStatus === "COMPLETED") {
    state = "completed";
    label = "COMPLETED (ARCHIVED)";
    timeText = "";
  } else if (tripStatus === "SCHEDULED") {
    // Engine off / pre-departure: Pure STANDBY status without false stale timer
    state = "standby";
    label = "DEPOT STANDBY";
    timeText = "";
  } else if (tripStatus === "PAUSED") {
    state = "paused";
    label = "SIMULATION PAUSED";
    timeText = "";
  } else if (!isWsConnected && timeSinceNew > 3500) {
    state = "disconnected";
    label = "DISCONNECTED";
    const sec = Math.round(timeSinceNew / 1000);
    timeText = sec < 60 ? `${sec}s ago` : `${Math.floor(sec / 60)}m ago`;
  } else if (timeSinceNew > 3000) {
    state = "stale";
    label = "STALE TELEMETRY";
    const sec = Math.round(timeSinceNew / 1000);
    timeText = sec < 60 ? `${sec}s ago` : `${Math.floor(sec / 60)}m ago`;
  } else {
    state = "live";
    label = "LIVE 1.0 Hz";
    timeText = "";
  }

  // Update Header Badge
  if (badgeEl) {
    badgeEl.className = `live-stream-badge ${state}`;
  }
  if (textEl) {
    textEl.innerText = label;
  }
  if (timeEl) {
    if (timeText) {
      timeEl.innerText = `• ${timeText}`;
      timeEl.classList.remove("hidden");
    } else {
      timeEl.innerText = "";
      timeEl.classList.add("hidden");
    }
  }

  // Update Bottom Stream Inspector
  if (streamPulseEl) {
    streamPulseEl.className = `pulse-indicator ${state}`;
  }

  if (streamMetaEl) {
    const proto = isWsConnected ? "WebSocket 1 Hz (WSS)" : "REST Polling";
    if (state === "live") {
      streamMetaEl.innerText = `Packets Ingested: ${packetCounter.toLocaleString()} • Protocol: ${proto} (Active)`;
    } else if (state === "stale") {
      streamMetaEl.innerText = `Packets Ingested: ${packetCounter.toLocaleString()} • Stale Telemetry (${timeText})`;
    } else if (state === "disconnected") {
      streamMetaEl.innerText = `Packets Ingested: ${packetCounter.toLocaleString()} • Connection Lost (${timeText})`;
    } else if (state === "paused") {
      streamMetaEl.innerText = `Packets Ingested: ${packetCounter.toLocaleString()} • Simulation Paused (${timeText})`;
    } else if (state === "completed") {
      streamMetaEl.innerText = `Packets Ingested: ${packetCounter.toLocaleString()} • Delivery Completed`;
    } else if (state === "standby") {
      streamMetaEl.innerText = `Status: Depot Standby (Engine Inactive) • Awaiting ignition`;
    } else {
      streamMetaEl.innerText = `Packets Ingested: ${packetCounter.toLocaleString()} • Status: ${label}`;
    }
  }
}

/**
 * Render keadaan murni Standby (Mesin Mati / Belum Dihidupkan)
 * Mengosongkan seluruh pembacaan sensor telemetri ke state default (--), kecepatan 0,
 * TETAPI mengunci posisi dan arah marker truk pada koordinat state terakhir.
 */
export function renderStandbyState(exp, lastPayload = null) {
  if (!exp) return;
  const tripId = exp.tripId || selectedTripId;
  const truckId = exp.truckId || "TRUCK-AJ-36000-01";
  const vehicle = vehicles.find(v => v.truckId === truckId) || (vehicles.length > 0 ? vehicles[0] : null);
  const routeType = exp.routeType || "TOLL";
  const totalDist = exp.totalDistanceKm || (routeType === "NON_TOLL" ? 172.0 : 146.91);

  // Simpan koordinat payload jika disediakan
  if (lastPayload?.vehicle && lastPayload.vehicle.latitude != null && lastPayload.vehicle.longitude != null) {
    const pos = {
      lat: lastPayload.vehicle.latitude,
      lng: lastPayload.vehicle.longitude,
      heading: lastPayload.vehicle.heading_deg != null ? lastPayload.vehicle.heading_deg : 0,
      distanceKm: lastPayload.vehicle.distance_traveled_km != null ? lastPayload.vehicle.distance_traveled_km : 0,
      locationName: lastPayload.vehicle.location_name || ""
    };
    lastKnownTruckPositions[tripId] = pos;
    if (truckId) lastKnownTruckPositions[truckId] = pos;
  }

  // 1. Ekstraksi Posisi & Jarak Terakhir Truk (State Terakhir)
  const cachedPos = lastKnownTruckPositions[tripId] || (truckId ? lastKnownTruckPositions[truckId] : null);
  const lastLat = Number(
    lastPayload?.vehicle?.latitude 
    ?? cachedPos?.lat 
    ?? vehicle?.lastLatitude 
    ?? vehicle?.last_latitude 
    ?? WAYPOINTS_RAW[0]?.lat 
    ?? -6.5650
  );
  const lastLng = Number(
    lastPayload?.vehicle?.longitude 
    ?? cachedPos?.lng 
    ?? vehicle?.lastLongitude 
    ?? vehicle?.last_longitude 
    ?? WAYPOINTS_RAW[0]?.lng 
    ?? 107.7600
  );
  const lastHeading = Number(
    lastPayload?.vehicle?.heading_deg 
    ?? cachedPos?.heading 
    ?? vehicle?.headingDeg 
    ?? vehicle?.heading_deg 
    ?? 0
  );
  const lastDistance = Number(
    lastPayload?.vehicle?.distance_traveled_km 
    ?? cachedPos?.distanceKm 
    ?? 0.0
  );

  // 2. Timer & Jam Realtime Dunia Simulasi saat Standby
  const elapsed = lastDistance > 0.05
    ? (lastPayload?.elapsedSeconds != null ? lastPayload.elapsedSeconds : (lastPayload?.identity?.sequence_number || 0))
    : 0;
  const hrs = String(Math.floor(elapsed / 3600)).padStart(2, "0");
  const mins = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
  const secs = String(elapsed % 60).padStart(2, "0");
  const timerEl = document.getElementById("tripTimer");
  if (timerEl) timerEl.innerText = `${hrs}:${mins}:${secs}`;

  const simClock = formatSimulationClock(lastPayload?.identity?.timestamp, exp.departureDate, exp.departureTime);
  const simTimeEl = document.getElementById("simClockTime");
  if (simTimeEl) simTimeEl.innerText = simClock.time;
  const simDateEl = document.getElementById("simClockDate");
  if (simDateEl) simDateEl.innerText = simClock.date;
  const barSimClock = document.getElementById("barSimClock");
  if (barSimClock) barSimClock.innerText = simClock.time;

  // 3. Cargo Summary Header (Standby Metadata)
  const doCode = exp.deliveryOrder || `DO-CPI-SBG-${tripId?.replace("TRIP-", "") || "01"}`;
  const doEl = document.getElementById("barDO");
  if (doEl) doEl.innerText = doCode;

  const truckEl = document.getElementById("barTruckId");
  if (truckEl) {
    const plate = vehicle?.licensePlate || "DD 8741 XY";
    truckEl.innerText = `${truckId} (${plate})`;
  }

  const modelEl = document.getElementById("barModel");
  if (modelEl) {
    modelEl.innerText = vehicle?.model || "Tropical Blower Modified Truck";
  }

  const strainEl = document.getElementById("barStrain");
  if (strainEl) {
    const biomass = ((exp.quantity || 36000) * (exp.averageWeightGrams || 42.0)) / 1000.0;
    strainEl.innerText = `${exp.strain || "Cobb 500"} (${Math.round(biomass).toLocaleString("en-US")} kg)`;
  }

  const drvEl = document.getElementById("barDriver");
  if (drvEl) drvEl.innerText = exp.driverName || "Fleet Driver";

  const loadEl = document.getElementById("barLoad");
  if (loadEl) loadEl.innerText = `${(exp.quantity || 36000).toLocaleString("en-US")} DOC`;

  const packagingEl = document.getElementById("barPackaging");
  if (packagingEl) {
    const bType = exp.boxType || "Ventilated Plastic Crates";
    const shortBox = bType.includes("Plastic") || bType.includes("Plastik") ? "Plastic Crate" : "Cardboard Box";
    packagingEl.innerText = `${shortBox} (${exp.chicksPerBox || 100}/box)`;
  }

  const pillRoute = document.getElementById("pillRouteType");
  if (pillRoute) {
    const isNT = routeType === "NON_TOLL";
    const icon = isNT ? "🛤️" : "🛣️";
    const name = isNT ? `Non-Toll (${totalDist} km)` : `Toll (${totalDist} km)`;
    pillRoute.innerHTML = `<span class="icon">${icon}</span> Route: <strong id="barRouteType">${name}</strong>`;
  }

  const depDate = exp.departureDate || "2026-10-31";
  const depTime = exp.departureTime || "08:00";
  const hour = parseInt(depTime.split(":")[0], 10) || 8;
  const isDay = hour >= 6 && hour < 18;
  const timeLabel = `${depDate} • ${depTime} UTC+7 (${isDay ? "Daytime" : "Nighttime"})`;
  const pillTime = document.getElementById("pillTime");
  if (pillTime) {
    pillTime.innerHTML = `<span class="icon">${isDay ? "☀️" : "🌙"}</span> Schedule: <strong>${timeLabel}</strong>`;
  }

  const rawWeather = exp.weather || "SUNNY";
  const weatherLabel = rawWeather === "SUNNY" ? "Clear" : (rawWeather === "LIGHT_RAIN" ? "Light Rain" : "Heavy Storm");
  const weatherIcon = rawWeather === "SUNNY" ? "☀️" : "🌧️";
  const pillWeather = document.getElementById("pillWeather");
  if (pillWeather) {
    pillWeather.innerHTML = `<span class="icon">${weatherIcon}</span> Weather: <strong>${weatherLabel}</strong>`;
  }

  // 4. Status Kinematika: Kecepatan 0 km/h, Getaran -- g, Ambient -- °C
  const roadBadge = document.getElementById("currentRoadBadge");
  if (roadBadge) {
    if (lastDistance > 0.5) {
      roadBadge.innerText = `STOPPED (KM ${lastDistance.toFixed(1)} - ENGINE OFF)`;
    } else {
      roadBadge.innerText = "DEPOT STANDBY (ENGINE OFF)";
    }
    roadBadge.className = "badge-gridlock";
  }

  const spdEl = document.getElementById("valSpeed");
  if (spdEl) spdEl.innerHTML = `0 <small>km/h</small>`;

  const vibEl = document.getElementById("valVibration");
  if (vibEl) vibEl.innerHTML = `-- <small>g</small>`;

  const ambEl = document.getElementById("valAmbient");
  if (ambEl) ambEl.innerHTML = `-- <small>°C</small>`;

  const distEl = document.getElementById("valDistance");
  if (distEl) distEl.innerHTML = `${lastDistance.toFixed(1)} <small>/ ${totalDist} km</small>`;

  const odoEl = document.getElementById("subOdo");
  if (odoEl) {
    odoEl.innerText = lastDistance > 0.05 ? `Odometer: KM ${lastDistance.toFixed(1)} (Engine Off)` : "Odometer: Standby";
  }

  const solEl = document.getElementById("subSolar");
  if (solEl) solEl.innerText = "Radiation: -- W/m²";

  const progPct = Math.min(100, Math.round((lastDistance / totalDist) * 100));
  const progEl = document.getElementById("subProgress");
  if (progEl) progEl.innerText = `Progress: ${progPct}%`;

  const subVibEl = document.getElementById("subVibStatus");
  if (subVibEl) {
    subVibEl.innerText = "Stationary (Engine Off)";
    subVibEl.style.color = "#64748b";
  }

  // 5. Koordinat & Peta: Posisi Truk Berada di State Terakhir (Tidak reset ke pangkalan)
  const coordBadge = document.getElementById("gpsCoordBadge");
  if (coordBadge) coordBadge.innerText = `Lat: ${lastLat.toFixed(4)}, Lng: ${lastLng.toFixed(4)}`;

  const bearBadge = document.getElementById("bearingBadge");
  if (bearBadge) bearBadge.innerText = `Heading: ${Math.round(lastHeading)}° (Engine Off)`;

  updateTruckPosition(lastLat, lastLng, lastHeading, false, true);

  // Bersihkan jejak hanya jika truk belum pernah bergerak dari KM 0
  if (lastDistance <= 0.05) {
    clearTrail();
  }
  clearChartHistory();

  // 6. Mikroklimat: Semua Zona Bersih / Standby (--°C dan --%)
  for (let z = 1; z <= 3; z++) {
    const box = document.getElementById(`zoneBox${z}`);
    const tempEl = document.getElementById(`tempZ${z}`);
    const gaugeEl = document.getElementById(`gaugeZ${z}`);
    const rhEl = document.getElementById(`rhZ${z}`);
    if (box) box.className = "zone-box";
    if (tempEl) {
      tempEl.innerText = "--°C";
      tempEl.className = "zone-temp";
    }
    if (gaugeEl) {
      gaugeEl.style.width = "0%";
      gaugeEl.style.backgroundColor = "#475569";
    }
    if (rhEl) rhEl.innerText = "RH: --%";
  }

  // 7. Indeks Kesejahteraan & CO2
  const welfareEl = document.getElementById("welfareBadge");
  if (welfareEl) {
    welfareEl.innerText = exp.status === "PAUSED" ? "SIMULATION PAUSED (ENGINE OFF)" : "DEPOT STANDBY (PRE-DEPARTURE)";
    welfareEl.className = "badge-normal";
  }

  const co2ValEl = document.getElementById("valCO2");
  if (co2ValEl) co2ValEl.innerText = "-- ppm";
  const co2Bar = document.getElementById("barCO2");
  if (co2Bar) {
    co2Bar.style.width = "0%";
    co2Bar.style.backgroundColor = "#475569";
  }

  // 8. Chiller / Blower Pill
  const chillerPill = document.getElementById("chillerStatusPill");
  if (chillerPill) {
    chillerPill.innerText = "💨 Ventilation Blower: OFF (Engine Inactive)";
    chillerPill.className = "subsystem-pill chiller-off";
  }

  // 9. Banner Mesin Mati
  const banner = document.getElementById("engineOffBanner");
  if (banner) {
    banner.classList.remove("hidden");
    const bTitle = document.getElementById("bannerTitle");
    const bDesc = document.getElementById("bannerDesc");
    const isPaused = exp.status === "PAUSED";
    if (bTitle) bTitle.innerText = isPaused ? "Simulation Paused (Engine Inactive)" : "Vehicle Parked / Engine Inactive";
    if (bDesc) {
      if (lastDistance > 0.5) {
        bDesc.innerText = `Fleet vehicle ${truckId} is currently stopped at KM ${lastDistance.toFixed(1)}. Engine is inactive, telematics telemetry stream offline until ignition.`;
      } else {
        bDesc.innerText = `Fleet vehicle ${truckId} is currently on standby at ${exp?.origin?.name || "origin depot"}. Sensors remain offline until ignition.`;
      }
    }
  }

  // 10. Raw Stream Inspector Terminal
  const tsEl = document.getElementById("packetTs");
  if (tsEl) tsEl.innerText = "Timestamp: -- (Engine Off)";

  const jsonEl = document.getElementById("jsonPayloadDisplay");
  if (jsonEl) {
    jsonEl.innerText = JSON.stringify({
      status: exp.status === "PAUSED" ? "SIMULATION_PAUSED" : "DEPOT_STANDBY",
      engine: "OFF",
      last_known_position: {
        latitude: lastLat,
        longitude: lastLng,
        heading_deg: lastHeading,
        distance_traveled_km: lastDistance
      },
      message: "Fleet vehicle engine is inactive. Telematics sensor stream is offline. GPS coordinates locked at last verified location."
    }, null, 2);
  }

  // 11. Update Watchdog UI
  updateWatchdogUI();
}

/**
 * Render visual kartu zona 1/2/3 mikroklimat kargo
 */
export function renderZoneCard(zoneNum, temp, rh) {
  const box = document.getElementById(`zoneBox${zoneNum}`);
  const tempEl = document.getElementById(`tempZ${zoneNum}`);
  const gaugeEl = document.getElementById(`gaugeZ${zoneNum}`);
  const rhEl = document.getElementById(`rhZ${zoneNum}`);

  if (rhEl && rh != null) {
    rhEl.innerText = `RH: ${Math.round(rh)}%`;
  }

  if (!box || !tempEl || !gaugeEl) return;

  tempEl.innerText = `${temp != null ? temp.toFixed(1) : "--"}°C`;
  box.className = "zone-box";
  tempEl.className = "zone-temp";

  if (temp > 38.0 || temp < 20.0) {
    box.classList.add("critical");
    tempEl.classList.add("critical");
    gaugeEl.style.backgroundColor = "#ef4444";
  } else if (temp > 29.5 || temp < 22.0) {
    box.classList.add("warning");
    tempEl.classList.add("warning");
    gaugeEl.style.backgroundColor = "#f59e0b";
  } else {
    gaugeEl.style.backgroundColor = "#10b981";
  }

  const gaugePct = Math.max(5, Math.min(100, (((temp || 25) - 18) / (42 - 18)) * 100));
  gaugeEl.style.width = `${gaugePct}%`;
}

// Stub backward-compatibility jika ada pemanggil lama
export function startAutonomousTelemetryEngine() {}
export function renderAutonomousTick() {}

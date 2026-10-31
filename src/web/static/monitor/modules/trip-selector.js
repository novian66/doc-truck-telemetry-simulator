/**
 * Monitor Expedition Selector & Summary Bar Controller (ES Module)
 * Mengelola pilihan dropdown pengiriman dan ringkasan metadata kargo pada header monitor
 */

import {
  expeditions,
  vehicles,
  selectedTripId,
  setSelectedTripId,
  resetPacketTracking
} from "./state.js";
import { getRouteConfig } from "../../shared/constants.js";
import { renderSegmentPolylines, renderRealOsrmRoute, setTruckMarkerToEnd, updateTruckPosition, clearTrail } from "./map.js";
import { clearChartHistory } from "./chart.js";
import { renderStandbyState } from "./consumer.js";

/**
 * Mengisi dropdown pilihan ekspedisi
 */
export function populateExpeditionSelector() {
  const sel = document.getElementById("expeditionSelector");
  if (!sel) return;
  sel.innerHTML = "";

  if (expeditions.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.innerText = "No Dispatch Manifests Registered";
    sel.appendChild(opt);
    updateTripStatusPill();
    return;
  }

  expeditions.forEach(exp => {
    const opt = document.createElement("option");
    opt.value = exp.tripId;
    let icon = "⚪";
    if (exp.status === "RUNNING") icon = "🟢";
    else if (exp.status === "COMPLETED") icon = "🔵";

    const isNonToll = exp.routeType === "NON_TOLL";
    const routeTag = isNonToll ? "Non-Toll" : "Toll";
    // Compact option text to prevent overflow on mobile displays
    opt.innerText = `${icon} ${exp.tripId} (${routeTag})`;
    opt.title = `${exp.tripId} [${routeTag}] - ${exp.title || "DOC Dispatch"}${exp.deliveryOrder ? ` • ${exp.deliveryOrder}` : ""}`;
    if (exp.tripId === selectedTripId) opt.selected = true;
    sel.appendChild(opt);
  });

  updateTripStatusPill();
}

/**
 * Memperbarui badge status pengiriman (SEDANG BERJALAN, SELESAI, STANDBY)
 */
export function updateTripStatusPill() {
  const exp = expeditions.find(e => e.tripId === selectedTripId);
  const pill = document.getElementById("selectedTripStatusPill");
  if (!exp || !pill) return;

  pill.className = "trip-status-pill";
  if (exp.status === "RUNNING") {
    pill.classList.add("running");
    pill.innerText = "EN ROUTE (LIVE 1.0 Hz)";
  } else if (exp.status === "COMPLETED") {
    pill.classList.add("completed");
    pill.innerText = "COMPLETED (ARCHIVED)";
  } else {
    pill.classList.add("ready");
    pill.innerText = "DEPOT STANDBY";
  }
}

/**
 * Handler saat pengiriman baru dipilih dari dropdown
 */
export function onExpeditionSelected(tripId) {
  setSelectedTripId(tripId);
  resetPacketTracking();
  updateTripStatusPill();
  clearTrail();
  clearChartHistory();

  const exp = expeditions.find(e => e.tripId === tripId);
  if (!exp) return;

  const routeType = exp.routeType || "TOLL";
  const routeCfg = getRouteConfig(routeType);
  const distKm = exp.totalDistanceKm || routeCfg.distanceKm;

  const vehicle =
    vehicles.find(v => v.truckId === exp.truckId) || {
      licensePlate: "B 9842 KCK",
      model: "HatchTech HatchTraveller"
    };

  // Update top summary bar
  const doEl = document.getElementById("barDO");
  if (doEl) doEl.innerText = exp.deliveryOrder || `DO-CPI-SBG-${exp.tripId.replace("TRIP-", "")}`;

  const truckEl = document.getElementById("barTruckId");
  if (truckEl) truckEl.innerText = `${exp.truckId} (${vehicle.licensePlate})`;

  const modelEl = document.getElementById("barModel");
  if (modelEl) modelEl.innerText = vehicle.model || "HatchTech";

  const strainEl = document.getElementById("barStrain");
  if (strainEl) {
    const qty = exp.quantity || 40000;
    const w = exp.averageWeightGrams || 42.0;
    const biomassKg = ((qty * w) / 1000).toLocaleString("id-ID", { maximumFractionDigits: 0 });
    strainEl.innerText = `${exp.strain || "Cobb 500"} (${biomassKg} kg)`;
  }

  const driverEl = document.getElementById("barDriver");
  if (driverEl) driverEl.innerText = exp.driverName;

  const loadEl = document.getElementById("barLoad");
  if (loadEl) loadEl.innerText = `${(exp.quantity || 40000).toLocaleString("id-ID")} DOC`;

  const packagingEl = document.getElementById("barPackaging");
  if (packagingEl) {
    const bType = exp.boxType && exp.boxType.includes("Plastik") ? "Perforated Plastic Crate" : "Cardboard Box";
    packagingEl.innerText = `${bType} (${exp.chicksPerBox || 100}/box)`;
  }

  const pillRoute = document.getElementById("pillRouteType");
  if (pillRoute) {
    const isNT = routeType === "NON_TOLL";
    const icon = isNT ? "🛤️" : "🛣️";
    const name = isNT ? `Non-Tollway (${distKm} km)` : `Tollway (${distKm} km)`;
    pillRoute.innerHTML = `<span class="icon">${icon}</span> Route: <strong id="barRouteType">${name}</strong>`;
  }

  const depDate = exp.departureDate ? `${exp.departureDate}` : "";
  const depTime = exp.departureTime ? `${exp.departureTime} WIB` : "";
  const timeLabel = exp.timeOfDay === "DAY" ? "Daytime" : "Nighttime";
  const pillTime = document.getElementById("pillTime");
  if (pillTime) {
    const timeDetail = [depDate, depTime ? `${depTime} (${timeLabel})` : timeLabel].filter(Boolean).join(" • ");
    pillTime.innerHTML = `<span class="icon">${exp.timeOfDay === "DAY" ? "☀️" : "🌙"}</span> Departure: <strong>${timeDetail}</strong>`;
  }

  const weatherLabel =
    exp.weather === "SUNNY"
      ? "Clear / Sunny"
      : exp.weather === "LIGHT_RAIN"
      ? "Light Rain"
      : "Heavy Rain / Storm";
  const pillWeather = document.getElementById("pillWeather");
  if (pillWeather) {
    pillWeather.innerHTML = `<span class="icon">🌤️</span> Weather: <strong>${weatherLabel}</strong>`;
  }

  // Render rute: prioritaskan kurva jalan riil OSRM dari backend
  if (exp.routeId) {
    renderRealOsrmRoute(exp.routeId, routeType).then(loaded => {
      if (!loaded && exp.segments) {
        renderSegmentPolylines(exp.segments, routeType);
      }
    });
  } else if (exp.segments) {
    renderSegmentPolylines(exp.segments, routeType);
  }

  const banner = document.getElementById("engineOffBanner");
  const bTitle = document.getElementById("bannerTitle");
  const bDesc = document.getElementById("bannerDesc");

  if (exp.status === "COMPLETED") {
    if (banner) banner.classList.remove("hidden");
    if (bTitle) bTitle.innerText = "Delivery Completed (Archived History)";
    if (bDesc) {
      bDesc.innerText = `Cargo delivered to destination (${exp.destination ? exp.destination.name : "Bogor Broiler Farm"}). All DOC delivery handovers verified 100%.`;
    }
    setTruckMarkerToEnd(routeType);

    const dVal = document.getElementById("valDistance");
    if (dVal) dVal.innerHTML = `${distKm.toFixed(1)} <small>/ ${distKm} km</small>`;
    const sProg = document.getElementById("subProgress");
    if (sProg) sProg.innerText = `Progress: 100%`;
    const vSpd = document.getElementById("valSpeed");
    if (vSpd) vSpd.innerHTML = `0 <small>km/h</small>`;
  } else if (exp.status === "RUNNING") {
    // Pengiriman aktif berjalan
    if (banner) banner.classList.add("hidden");
  } else {
    // Pengiriman standby / belum jalan: Tampilkan status standby bersih tanpa sisa nilai telemetri
    renderStandbyState(exp);
  }
}

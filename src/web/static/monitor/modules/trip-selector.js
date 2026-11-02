/**
 * Monitor Expedition Selector & Collapsible Fleet Drawer Controller (ES Module)
 * Concept C: Collapsible Fleet Drawer / Sidebar List with URL Parameter Synchronization
 */

import {
  expeditions,
  vehicles,
  selectedTripId,
  setSelectedTripId,
  resetPacketTracking,
  setUrlTripId
} from "./state.js";
import { getRouteConfig } from "../../shared/constants.js";
import { renderSegmentPolylines, renderRealOsrmRoute, setTruckMarkerToEnd, clearTrail } from "./map.js";
import { clearChartHistory } from "./chart.js";
import { renderStandbyState } from "./consumer.js";

let activeFleetFilter = "ALL";
let fleetSearchQuery = "";
let isDrawerInitialized = false;

/**
 * Membuka drawer panel armada
 */
export function openFleetDrawer() {
  const drawer = document.getElementById("fleetDrawer");
  const backdrop = document.getElementById("fleetDrawerBackdrop");
  if (drawer) drawer.classList.add("open");
  if (backdrop) backdrop.classList.remove("hidden");
  const searchInput = document.getElementById("fleetSearchInput");
  if (searchInput) {
    setTimeout(() => searchInput.focus(), 150);
  }
}

/**
 * Menutup drawer panel armada
 */
export function closeFleetDrawer() {
  const drawer = document.getElementById("fleetDrawer");
  const backdrop = document.getElementById("fleetDrawerBackdrop");
  if (drawer) drawer.classList.remove("open");
  if (backdrop) backdrop.classList.add("hidden");
}

/**
 * Toggle buka/tutup drawer armada
 */
export function toggleFleetDrawer() {
  const drawer = document.getElementById("fleetDrawer");
  if (drawer && drawer.classList.contains("open")) {
    closeFleetDrawer();
  } else {
    openFleetDrawer();
  }
}

/**
 * Render kartu-kartu ekspedisi di dalam drawer (Concept C)
 */
export function renderFleetCards() {
  const container = document.getElementById("fleetCardsList");
  if (!container) return;
  container.innerHTML = "";

  // Kalkulasi jumlah berdasarkan status
  const total = expeditions.length;
  const liveCount = expeditions.filter(e => e.status === "RUNNING").length;
  const doneCount = expeditions.filter(e => e.status === "COMPLETED").length;
  const standbyCount = expeditions.filter(e => e.status !== "RUNNING" && e.status !== "COMPLETED").length;

  const cAll = document.getElementById("countAll");
  const cLive = document.getElementById("countLive");
  const cStandby = document.getElementById("countStandby");
  const cDone = document.getElementById("countDone");
  if (cAll) cAll.innerText = total;
  if (cLive) cLive.innerText = liveCount;
  if (cStandby) cStandby.innerText = standbyCount;
  if (cDone) cDone.innerText = doneCount;

  // Filter daftar ekspedisi
  let filtered = [...expeditions];
  if (activeFleetFilter === "RUNNING") {
    filtered = filtered.filter(e => e.status === "RUNNING");
  } else if (activeFleetFilter === "SCHEDULED") {
    filtered = filtered.filter(e => e.status !== "RUNNING" && e.status !== "COMPLETED");
  } else if (activeFleetFilter === "COMPLETED") {
    filtered = filtered.filter(e => e.status === "COMPLETED");
  }

  if (fleetSearchQuery) {
    const q = fleetSearchQuery.toLowerCase();
    filtered = filtered.filter(e => {
      const v = vehicles.find(veh => veh.truckId === e.truckId);
      const searchTarget = [
        e.tripId,
        e.deliveryOrder,
        e.truckId,
        v?.licensePlate,
        e.driverName,
        e.title,
        e.strain,
        e.routeType
      ].filter(Boolean).join(" ").toLowerCase();
      return searchTarget.includes(q);
    });
  }

  const showingEl = document.getElementById("fleetShowingCount");
  if (showingEl) showingEl.innerText = filtered.length;

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "fleet-empty-state";
    empty.innerHTML = `
      <div class="empty-icon">📭</div>
      <div class="empty-title">No Matching Dispatches</div>
      <div class="empty-desc">${fleetSearchQuery ? "Try refining your search keyword" : "No dispatches in this category"}</div>
    `;
    container.appendChild(empty);
    return;
  }

  filtered.forEach(exp => {
    const card = document.createElement("div");
    card.className = "fleet-card";
    const isActive = exp.tripId === selectedTripId;
    if (isActive) card.classList.add("active");

    const vehicle = vehicles.find(v => v.truckId === exp.truckId) || {
      licensePlate: "DD 8741 XY",
      model: "HatchTraveller"
    };

    const isNonToll = exp.routeType === "NON_TOLL";
    const routeTag = isNonToll ? "Non-Toll" : "Toll";
    const routeIcon = isNonToll ? "🛤️" : "🛣️";
    const distKm = exp.totalDistanceKm || (isNonToll ? 172.0 : 145.0);

    let statusHtml = "";
    if (exp.status === "RUNNING") {
      statusHtml = `<span class="card-status-pill running"><span class="pulse-dot-mini"></span> EN ROUTE (LIVE 1.0 Hz)</span>`;
    } else if (exp.status === "COMPLETED") {
      statusHtml = `<span class="card-status-pill completed">COMPLETED</span>`;
    } else {
      statusHtml = `<span class="card-status-pill standby">STANDBY</span>`;
    }

    card.innerHTML = `
      <div class="fleet-card-top">
        ${statusHtml}
        <span class="card-route-tag ${isNonToll ? "non-toll" : "toll"}">${routeIcon} ${routeTag} (${distKm} km)</span>
      </div>
      <div class="fleet-card-header">
        <div class="fleet-card-trip-id">${exp.tripId} ${isActive ? '<span class="active-indicator-badge">ACTIVE</span>' : ""}</div>
        <div class="fleet-card-do">${exp.deliveryOrder || "DO-MANIFEST"}</div>
      </div>
      <div class="fleet-card-body">
        <div class="fleet-card-row">
          <span class="icon">🚚</span>
          <strong>${exp.truckId}</strong>
          <span class="badge-plate">${vehicle.licensePlate}</span>
        </div>
        <div class="fleet-card-row">
          <span class="icon">👤</span>
          <span>${exp.driverName || "Assigned Driver"}</span>
          <span class="sub-sep">•</span>
          <span>🐥 ${(exp.quantity || 40000).toLocaleString("id-ID")} DOC</span>
        </div>
        <div class="fleet-card-row subtle">
          <span class="icon">📦</span>
          <span>${exp.boxType && exp.boxType.includes("Plastik") ? "Perforated Plastic Crate" : "Cardboard Box"} (${exp.chicksPerBox || 100}/box)</span>
        </div>
      </div>
    `;

    card.addEventListener("click", () => {
      if (selectedTripId !== exp.tripId) {
        onExpeditionSelected(exp.tripId);
        window.dispatchEvent(new CustomEvent("trip:selected", { detail: { tripId: exp.tripId } }));
      }
      closeFleetDrawer();
    });

    container.appendChild(card);
  });
}

/**
 * Memperbarui tampilan tombol trigger drawer di header
 */
export function updateFleetTriggerButton(tripId) {
  const countBadge = document.getElementById("fleetCountBadge");
  if (countBadge) countBadge.innerText = expeditions.length;

  const tripNameEl = document.getElementById("fleetActiveTripName");
  const dotEl = document.getElementById("fleetActiveDot");
  const exp = expeditions.find(e => e.tripId === tripId);

  if (tripNameEl) {
    if (exp) {
      const isNT = exp.routeType === "NON_TOLL";
      tripNameEl.innerText = `${exp.tripId} (${isNT ? "Non-Toll" : "Toll"})`;
    } else {
      tripNameEl.innerText = "No Dispatch Selected";
    }
  }

  if (dotEl) {
    dotEl.className = "active-dot";
    if (exp?.status === "RUNNING") dotEl.classList.add("running");
    else if (exp?.status === "COMPLETED") dotEl.classList.add("completed");
    else dotEl.classList.add("standby");
  }
}

/**
 * Mengisi dropdown pilihan ekspedisi & merender komponen Concept C
 */
export function populateExpeditionSelector() {
  const sel = document.getElementById("expeditionSelector");
  if (sel) {
    sel.innerHTML = "";
    if (expeditions.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.innerText = "No Dispatch Manifests Registered";
      sel.appendChild(opt);
    } else {
      expeditions.forEach(exp => {
        const opt = document.createElement("option");
        opt.value = exp.tripId;
        const isNonToll = exp.routeType === "NON_TOLL";
        opt.innerText = `${exp.tripId} (${isNonToll ? "Non-Toll" : "Toll"})`;
        if (exp.tripId === selectedTripId) opt.selected = true;
        sel.appendChild(opt);
      });
    }
  }

  updateFleetTriggerButton(selectedTripId);
  updateTripStatusPill();
  renderFleetCards();
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
 * Handler saat pengiriman baru dipilih
 */
export function onExpeditionSelected(tripId) {
  setSelectedTripId(tripId, true);
  resetPacketTracking();
  updateTripStatusPill();
  updateFleetTriggerButton(tripId);
  renderFleetCards();
  clearTrail();
  clearChartHistory();

  // Sinkronkan elemen select cadangan jika ada
  const sel = document.getElementById("expeditionSelector");
  if (sel && sel.value !== tripId) {
    sel.value = tripId;
  }

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
    // Pengiriman standby / belum jalan
    renderStandbyState(exp);
  }
}

/**
 * Inisialisasi event listener interaktif Drawer Armada (Concept C)
 */
export function initFleetDrawerEvents() {
  if (isDrawerInitialized) return;
  isDrawerInitialized = true;

  const openBtn = document.getElementById("openFleetDrawerBtn");
  const closeBtn = document.getElementById("closeFleetDrawerBtn");
  const backdrop = document.getElementById("fleetDrawerBackdrop");
  const searchInput = document.getElementById("fleetSearchInput");
  const searchClear = document.getElementById("fleetSearchClear");

  if (openBtn) {
    openBtn.addEventListener("click", e => {
      e.preventDefault();
      toggleFleetDrawer();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", e => {
      e.preventDefault();
      closeFleetDrawer();
    });
  }

  if (backdrop) {
    backdrop.addEventListener("click", () => {
      closeFleetDrawer();
    });
  }

  // Keyboard shortcut: Esc to close, T to toggle
  window.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeFleetDrawer();
    } else if ((e.key === "t" || e.key === "T") && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      toggleFleetDrawer();
    }
  });

  // Filter Tabs
  document.querySelectorAll(".fleet-tab").forEach(tab => {
    tab.addEventListener("click", e => {
      document.querySelectorAll(".fleet-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      activeFleetFilter = tab.getAttribute("data-filter") || "ALL";
      renderFleetCards();
    });
  });

  // Search Input
  if (searchInput) {
    searchInput.addEventListener("input", e => {
      fleetSearchQuery = e.target.value.trim();
      if (searchClear) {
        if (fleetSearchQuery) searchClear.classList.remove("hidden");
        else searchClear.classList.add("hidden");
      }
      renderFleetCards();
    });
  }

  if (searchClear && searchInput) {
    searchClear.addEventListener("click", () => {
      searchInput.value = "";
      fleetSearchQuery = "";
      searchClear.classList.add("hidden");
      renderFleetCards();
      searchInput.focus();
    });
  }
}

/**
 * Config Console UI Rendering & Event Handling Module (ES Module)
 * Mengelola render tabel ekspedisi, armada truk, rightbar kontrol, dialog modal, dan event listener
 */

import {
  STORAGE_KEYS,
  VEHICLE_TEMPLATES,
  TRUCK_PAYLOAD_EXAMPLES,
  getRouteConfig
} from "../../shared/constants.js";
import {
  runtime,
  vehicles,
  expeditions,
  serverTemplates,
  activeTripId,
  setActiveTripId,
  saveConfigData,
  getActiveExpedition,
  getActiveVehicle,
  loadConfigData,
  syncConfigFromBackend,
  applyTelemetryToRuntime
} from "./state.js";
import { broadcastTelemetry } from "./telemetry.js";
import {
  startEngine,
  stopEngine,
  resetTrip,
  setSpeedMultiplier,
  toggleFault,
  initDensePath,
  syncBackendActuator,
  syncBackendSegments
} from "./engine.js";
import { initRoutePickerMap } from "./map-picker.js";
import {
  initFleetMap,
  renderFleetMap,
  focusTruckOnMap,
  fitFleetMapBounds
} from "./fleet-map.js";

/**
 * Render Tabel Rencana Pengiriman
 */
export function renderExpeditionsTable(filter = "ALL") {
  const tbody = document.getElementById("expeditionsTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const filtered = expeditions.filter(e => {
    if (filter === "ALL") return true;
    return e.status === filter;
  });

  // Update badge count
  const bExp = document.getElementById("badgeExpeditionCount");
  if (bExp) bExp.innerText = expeditions.length;
  const bVeh = document.getElementById("badgeVehicleCount");
  if (bVeh) bVeh.innerText = vehicles.length;

  if (filtered.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td colspan="8" style="text-align: center; padding: 3rem 1.5rem; color: #94a3b8;">
        <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">🚚</div>
        <strong style="color: #f1f5f9; font-size: 1.05rem;">No dispatch manifests registered.</strong>
        <p style="margin: 0.5rem 0 1rem; font-size: 0.875rem; color: #64748b;">
          All previous dispatch records have been cleared. You can create a new dispatch manifest for testing.
        </p>
        <button type="button" class="btn btn-primary btn-sm" id="btnEmptyCreateTrip">
          <span>+</span> Create New Dispatch Manifest
        </button>
      </td>
    `;
    tbody.appendChild(tr);

    const btnEmptyCreate = document.getElementById("btnEmptyCreateTrip");
    if (btnEmptyCreate) {
      btnEmptyCreate.addEventListener("click", () => {
        const btnOpenExp = document.getElementById("btnOpenNewExpeditionModal");
        if (btnOpenExp) btnOpenExp.click();
      });
    }
    return;
  }

  filtered.forEach(exp => {
    const isCurrent = exp.tripId === activeTripId;
    const tr = document.createElement("tr");
    if (isCurrent) tr.className = "row-active-trip";

    let statusPillClass = "ready";
    let statusLabel = "SCHEDULED / READY";
    if (exp.status === "RUNNING") {
      statusPillClass = "running";
      statusLabel = "IN TRANSIT";
    } else if (exp.status === "COMPLETED") {
      statusPillClass = "completed";
      statusLabel = "COMPLETED (ARCHIVED)";
    }

    const depDateStr = exp.departureDate ? `📅 ${exp.departureDate}` : "";
    const depTimeStr = exp.departureTime ? `⏰ ${exp.departureTime} WIB` : "";
    const scheduleStr = [depDateStr, depTimeStr].filter(Boolean).join(" &bull; ");
    const timeLabel = exp.timeOfDay === "DAY" ? "☀️ Daytime" : "🌙 Nighttime";
    const weatherLabel =
      exp.weather === "SUNNY"
        ? "🌤️ Clear"
        : exp.weather === "LIGHT_RAIN"
        ? "🌧️ Rain"
        : "⛈️ Storm";
    const strainInfo = exp.strain
      ? `<small style="color:#38bdf8;">${exp.strain} &bull; ${exp.averageWeightGrams || 42}g</small>`
      : "";
    const packagingInfo = exp.boxType
      ? `<small style="color:#94a3b8;">${exp.boxType.includes("Plastik") || exp.boxType.includes("Plastic") ? "Crate" : "Corrugated"} (${exp.chicksPerBox || 100}/box)</small>`
      : "";
    const doCode = exp.deliveryOrder || `DO-CPI-SBG-${exp.tripId.replace("TRIP-", "")}`;
    const routeLabel = `${exp.origin ? exp.origin.name.split(" ")[0] : "Subang"} &rarr; ${exp.destination ? exp.destination.name.split(" ")[0] : "Bogor"}`;
    const isNonToll = exp.routeType === "NON_TOLL";
    const routeDistKm = exp.totalDistanceKm || (isNonToll ? 172 : 145);
    const routeTag = isNonToll
      ? `<span class="route-badge nontoll">🛤️ Non-Toll (${routeDistKm} km)</span>`
      : `<span class="route-badge toll">🛣️ Toll (${routeDistKm} km)</span>`;

    tr.innerHTML = `
      <td>
        <strong>${exp.tripId}</strong><br>
        <span class="delivery-order-tag">${doCode}</span>
        ${isCurrent ? '<br><span style="color:#38bdf8;font-size:10px;font-weight:700;">★ Selected (Rightbar)</span>' : ""}
      </td>
      <td>
        <strong>${exp.title}</strong><br>
        <small style="color:#94a3b8;">${routeLabel}</small> &bull; ${routeTag}<br>
        ${strainInfo}
      </td>
      <td><code>${exp.truckId}</code></td>
      <td>${exp.driverName}</td>
      <td>
        <strong>${(exp.quantity || 38400).toLocaleString("en-US")} DOC</strong><br>
        ${packagingInfo}
      </td>
      <td>${scheduleStr ? `<strong>${scheduleStr}</strong><br>` : ""}${timeLabel} &bull; ${weatherLabel}</td>
      <td><span class="status-pill ${statusPillClass}">${statusLabel}</span></td>
      <td style="white-space:nowrap;">
        ${
          !isCurrent
            ? `<button class="btn btn-outline btn-sm btn-select-trip" data-id="${exp.tripId}">⚙️ Open Controls</button>`
            : '<button class="btn btn-primary btn-sm btn-select-trip" data-id="' + exp.tripId + '">✓ Open Controls (Active)</button>'
        }
        <button class="btn btn-outline btn-sm btn-delete-trip" data-id="${exp.tripId}" title="Delete this dispatch" style="color:#ef4444; border-color:#ef4444; margin-left:4px;">🗑️</button>
      </td>
    `;

    tr.addEventListener("click", async () => {
      setActiveTripId(exp.tripId);
      initDensePath(exp.routeType || "TOLL");
      if (exp.status === "RUNNING") {
        runtime.engineRunning = true;
      } else if (exp.status === "PAUSED" || exp.status === "COMPLETED") {
        runtime.engineRunning = false;
        runtime.speed = 0;
      }
      try {
        const res = await fetch(`/api/v1/simulation/latest?trip_id=${encodeURIComponent(exp.tripId)}`);
        if (res.ok) {
          const data = await res.json();
          applyTelemetryToRuntime(data);
        }
        const sRes = await fetch(`/api/v1/simulation/status?trip_id=${encodeURIComponent(exp.tripId)}`);
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData && sData.road_conditions) {
            exp.segments = [
              sData.road_conditions["0"] || sData.road_conditions[0] || "FREE_FLOW",
              sData.road_conditions["1"] || sData.road_conditions[1] || "FREE_FLOW",
              sData.road_conditions["2"] || sData.road_conditions[2] || "CONGESTED",
              sData.road_conditions["3"] || sData.road_conditions[3] || "FREE_FLOW",
              sData.road_conditions["4"] || sData.road_conditions[4] || "FREE_FLOW"
            ];
          }
        }
      } catch (e) {}
      saveConfigData();
      updateRightbar();
      updateEngineUI();
      renderExpeditionsTable(filter);
      broadcastTelemetry();
      openRightbar();
    });

    tbody.appendChild(tr);
  });

  // Event listener tombol hapus pengiriman per baris
  tbody.querySelectorAll(".btn-delete-trip").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const tid = btn.getAttribute("data-id");
      if (confirm(`Delete dispatch manifest ${tid}?`)) {
        try {
          await fetch(`/api/v1/simulation/trips/${tid}`, { method: "DELETE" });
        } catch (err) {}
        const idx = expeditions.findIndex(x => x.tripId === tid);
        if (idx !== -1) {
          expeditions.splice(idx, 1);
        }
        if (activeTripId === tid) {
          setActiveTripId(expeditions[0]?.tripId || null);
        }
        saveConfigData();
        renderExpeditionsTable(filter);
        updateRightbar();
      }
    });
  });
}

/**
 * Render Registered Fleet Vehicles Table (Synchronized Real-Time via API /api/v1/simulation/vehicles)
 */
export function renderVehiclesTable() {
  const tbody = document.getElementById("vehiclesTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  vehicles.forEach(v => {
    const tmplKey = v.templateKey || detectTemplateKey(v);
    const tmpl = VEHICLE_TEMPLATES[tmplKey] || {};

    const lat = typeof v.lastLatitude === "number" ? v.lastLatitude.toFixed(4) : (v.lastLatitude || "-6.5650");
    const lng = typeof v.lastLongitude === "number" ? v.lastLongitude.toFixed(4) : (v.lastLongitude || "107.7600");
    const locName = v.lastLocationName || "Subang Hatchery Pool";
    const speed = typeof v.lastSpeedKmh === "number" ? v.lastSpeedKmh.toFixed(1) : "0.0";
    const isMoving = v.isMoving || (parseFloat(speed) > 0);
    
    let movementTag = "";
    if (isMoving) {
      movementTag = `<span style="color:#4ade80; font-weight:600; font-size:11px;">🟢 In Motion (${speed} km/h)</span>`;
    } else if (v.status === "ON_TRIP") {
      movementTag = `<span style="color:#fbbf24; font-weight:600; font-size:11px;">🟡 Stationary Stop (0 km/h)</span>`;
    } else {
      movementTag = `<span style="color:#94a3b8; font-weight:600; font-size:11px;">🅿️ Depot Standby</span>`;
    }

    const gpsCell = `
      <div style="display:flex; flex-direction:column; gap:2px; min-width:180px;">
        <span style="font-family:monospace; font-size:11px; color:#38bdf8;">📍 ${lat}, ${lng}</span>
        <strong style="color:#f1f5f9; font-size:11.5px;">${locName}</strong>
        ${movementTag}
      </div>
    `;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${v.truckId}</strong></td>
      <td><code>${v.licensePlate}</code></td>
      <td><strong>${v.model || tmpl.model || "DOC Logistics Truck"}</strong><br><small style="color:#94a3b8;">${v.vendor || tmpl.vendor || "Industry Vendor"}</small></td>
      <td>${v.airflow || tmpl.airflow || "Laminar Airflow"}</td>
      <td>${(v.capacity || tmpl.capacity || 36000).toLocaleString("en-US")} DOC</td>
      <td>${(v.setpoint || tmpl.setpoint || 26.0).toFixed(1)}°C</td>
      <td><span style="color:#38bdf8;">${v.sensors || tmpl.sensors || "Dual Probe Ambient & Cargo (RS-485)"}</span></td>
      <td>${gpsCell}</td>
      <td><span class="status-pill active-truck">${v.status || "AVAILABLE"}</span></td>
      <td style="white-space: nowrap;">
        <button type="button" class="btn btn-xs btn-outline btn-vehicle-spec" data-template="${tmplKey}">
          🔍 Patent Specs
        </button>
        <button type="button" class="btn btn-xs btn-outline btn-locate-truck" data-truck="${v.truckId}" style="margin-left: 4px; border-color: #38bdf8; color: #38bdf8;" title="Pusatkan posisi armada pada peta">
          📍 Peta
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Event listener for locate truck on map button
  tbody.querySelectorAll(".btn-locate-truck").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const tid = btn.getAttribute("data-truck");
      if (tid) focusTruckOnMap(tid);
    });
  });

  // Event listener for patent specs button in table rows
  tbody.querySelectorAll(".btn-vehicle-spec").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const tmplKey = btn.getAttribute("data-template") || "joinaldy";
      openSpecModal(tmplKey);
    });
  });
}

/**
 * Render Vendor Cards Grid for Master Patented Fleet Templates (data_truck.md)
 * Consumes dynamic data from API (GET /api/v1/simulation/templates)
 */
export function renderTemplatesGrid() {
  const container = document.querySelector("#view-templates .vendor-cards-grid");
  if (!container) return;

  const list = serverTemplates.length > 0
    ? serverTemplates
    : Object.keys(VEHICLE_TEMPLATES).map(k => ({
        template_key: k,
        model_name: VEHICLE_TEMPLATES[k].model,
        vendor: VEHICLE_TEMPLATES[k].vendor,
        country: VEHICLE_TEMPLATES[k].country,
        features: VEHICLE_TEMPLATES[k].features,
        airflow_m3h: null,
        sensor_zones: [1, 2, 3]
      }));

  container.innerHTML = "";

  list.forEach(st => {
    const k = st.template_key;
    const tmpl = VEHICLE_TEMPLATES[k] || {};
    const card = document.createElement("div");
    card.className = "vendor-card";

    const countryName = (st.country || tmpl.country || "INTERNATIONAL").toUpperCase();
    const badgeType = k === "joinaldy" ? "EMPIRICAL RESEARCH" : "PATENT";
    const badgeText = `${countryName} &bull; ${badgeType}`;
    const modelName = st.model_name || tmpl.model || k;
    const desc = (st.features && st.features[0]) || tmpl.features?.[0] || "Standard international DOC cold-chain fleet specification.";
    const airflowText = st.airflow_m3h ? `${st.airflow_m3h.toLocaleString("en-US")} m³/h` : (tmpl.airflow || "Standard");
    const zonesText = st.sensor_zones ? `${st.sensor_zones.length}-Zone` : (tmpl.zones || "Multi-Zone");
    const metaText = `Circulation: ${airflowText} &bull; ${zonesText}`;

    card.innerHTML = `
      <div class="vendor-img-wrapper" style="cursor: pointer;" title="Click to view fleet patent specifications">
        <img src="/assets/images/trucks/truck_${k}.png?v=2" alt="${modelName}" class="vendor-card-img" onerror="this.onerror=null; this.src='/assets/images/trucks/truck_${k}.jpg';">
      </div>
      <div>
        <div class="vendor-badge">${badgeText}</div>
        <h4>${modelName}</h4>
        <p>${desc}</p>
        <div class="vendor-meta">${metaText}</div>
      </div>
      <div class="vendor-card-actions">
        <button type="button" class="btn btn-sm btn-outline btn-view-spec" data-template="${k}">🔍 Patent Specs</button>
        <button type="button" class="btn btn-sm btn-primary btn-view-payload" data-template="${k}">📦 Example Payload</button>
      </div>
    `;

    // Click on image opens spec modal
    const imgWrap = card.querySelector(".vendor-img-wrapper");
    if (imgWrap) {
      imgWrap.addEventListener("click", () => openSpecModal(k));
    }

    // Button: Patent Specs
    const btnSpec = card.querySelector(".btn-view-spec");
    if (btnSpec) {
      btnSpec.addEventListener("click", e => {
        e.stopPropagation();
        openSpecModal(k);
      });
    }

    // Button: Example Payload
    const btnPayload = card.querySelector(".btn-view-payload");
    if (btnPayload) {
      btnPayload.addEventListener("click", e => {
        e.stopPropagation();
        openPayloadModal(k);
      });
    }

    container.appendChild(card);
  });
}

/**
 * Deteksi template key dari objek kendaraan
 */
export function detectTemplateKey(v) {
  if (v.templateKey && VEHICLE_TEMPLATES[v.templateKey]) return v.templateKey;
  if (!v || !v.model) return "hatchtech";
  const m = v.model.toLowerCase();
  const id = (v.truckId || "").toLowerCase();
  if (m.includes("hatchtech") || id.includes("ht")) return "hatchtech";
  if (m.includes("heering") || id.includes("hl")) return "heering";
  if (m.includes("thermo") || id.includes("tk")) return "thermoking";
  if (m.includes("carrier") || id.includes("cr")) return "carrier";
  if (m.includes("chengli") || id.includes("cl")) return "chengli";
  if (m.includes("joinaldy") || m.includes("blower") || id.includes("aj")) return "joinaldy";
  return "hatchtech";
}

let currentSpecTemplateKey = "hatchtech";

/**
 * Membuka Modal Lembar Spesifikasi Paten Truk (Read-Only)
 */
export function openSpecModal(templateKey) {
  currentSpecTemplateKey = templateKey;
  const tmpl = VEHICLE_TEMPLATES[templateKey] || VEHICLE_TEMPLATES.hatchtech;
  const modal = document.getElementById("modalViewSpec");
  const titleEl = document.getElementById("specModalTitle");
  const bodyEl = document.getElementById("specModalBody");

  if (!modal || !titleEl || !bodyEl) return;

  titleEl.innerText = tmpl.model;

  const sensorItemsHtml = (tmpl.sensorList || [tmpl.sensors])
    .map(s => `<li class="spec-list-item"><span class="spec-check">✓</span> <span>${s}</span></li>`)
    .join("");

  const featureItemsHtml = (tmpl.features || [])
    .map(f => `<li class="spec-list-item"><span class="spec-bullet">•</span> <span>${f}</span></li>`)
    .join("");

  bodyEl.innerHTML = `
    <div class="spec-header-card">
      <div class="spec-header-top">
        <span class="spec-country-pill">${tmpl.country}</span>
      </div>
      <h3>${tmpl.model}</h3>
      <p class="spec-desc">${tmpl.description || "Standard international industrial specification for refrigerated DOC logistics."}</p>
      <div class="spec-ref-row">
        <span>📄 Research / Vendor Literature Reference:</span>
        <code>${tmpl.reference}</code>
      </div>
    </div>

    <!-- Patented Fleet Visualization -->
    <div class="spec-truck-visual-card">
      <div class="spec-truck-img-wrapper">
        <img src="${tmpl.truckImage}" alt="${tmpl.model}" class="spec-truck-img" onerror="this.onerror=null; this.src='${tmpl.truckImage.replace('.png', '.jpg')}';">
        <span class="spec-img-badge">🚚 PATENTED VEHICLE: ${tmpl.model}</span>
      </div>
    </div>

    <div class="spec-section-title">📐 PHYSICAL DIMENSIONS & AIRFLOW SYSTEM ENGINEERING</div>
    <div class="spec-grid-layout">
      <div class="spec-card-cell">
        <span class="spec-cell-label">Maximum Capacity</span>
        <strong class="spec-cell-value accent-amber">${tmpl.capacityFormatted || (tmpl.capacity.toLocaleString("en-US") + " DOC")}</strong>
        <small class="spec-cell-note">Constrained by metabolic heat</small>
      </div>

      <div class="spec-card-cell">
        <span class="spec-cell-label">Target Temperature Setpoint</span>
        <strong class="spec-cell-value accent-cyan">${tmpl.setpoint.toFixed(1)}°C</strong>
        <small class="spec-cell-note">SLA safety threshold: 23.0°C – 27.0°C</small>
      </div>

      <div class="spec-card-cell">
        <span class="spec-cell-label">Air Circulation System</span>
        <strong class="spec-cell-value">${tmpl.airflow}</strong>
        <small class="spec-cell-note">Internal cargo envelope airflow</small>
      </div>

      <div class="spec-card-cell">
        <span class="spec-cell-label">Fresh Air Intake</span>
        <strong class="spec-cell-value">${tmpl.freshAir || "Automatically controlled"}</strong>
        <small class="spec-cell-note">Mitigates CO2 accumulation</small>
      </div>

      <div class="spec-card-cell">
        <span class="spec-cell-label">Cooling Power (HVAC)</span>
        <strong class="spec-cell-value">${tmpl.coolingCapacity || "Reefer Compressor"}</strong>
        <small class="spec-cell-note">Heat absorption capacity</small>
      </div>

      <div class="spec-card-cell">
        <span class="spec-cell-label">Auxiliary Power & Genset</span>
        <strong class="spec-cell-value">${tmpl.powerType} (${tmpl.fuelTank} Liters)</strong>
        <small class="spec-cell-note">Autonomous off-engine runtime</small>
      </div>
    </div>

    <div class="spec-section-title">📡 INSTALLED TELEMETRY SENSOR INSTRUMENTATION SUITE (PATENTED)</div>
    <div class="spec-sensors-layout">
      <div class="spec-sensors-img-card">
        <div class="spec-sensor-img-wrapper">
          <img src="${tmpl.sensorsImage}" alt="Sensor Suite ${tmpl.model}" class="spec-sensor-img" onerror="this.onerror=null; this.src='data:image/svg+xml;charset=UTF-8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'400\\' height=\\'200\\' viewBox=\\'0 0 400 200\\'><rect fill=\\'%23111827\\' width=\\'400\\' height=\\'200\\'/><text fill=\\'%236b7280\\' font-family=\\'sans-serif\\' font-size=\\'14\\' dy=\\'10.5\\' font-weight=\\'bold\\' x=\\'50%\\' y=\\'50%\\' text-anchor=\\'middle\\'>Installed Sensor Instrumentation</text></svg>'">
          <span class="spec-img-badge">📡 INSTALLED IOT SENSORS</span>
        </div>
      </div>
      <div class="spec-sensors-container" style="margin-bottom: 0;">
        <ul class="spec-sensors-ul">
          ${sensorItemsHtml}
        </ul>
      </div>
    </div>

    ${featureItemsHtml ? `
      <div class="spec-section-title">⭐ ARCHITECTURAL HIGHLIGHTS & DOC WELFARE SAFEGUARDS</div>
      <div class="spec-features-container">
        <ul class="spec-features-ul">
          ${featureItemsHtml}
        </ul>
      </div>
    ` : ""}
  `;

  modal.classList.add("show");
}

let currentPayloadKey = "hatchtech";

/**
 * Membuka Modal Contoh Payload Streaming Telemetri Truk (data_truck.md Bab 6)
 */
export function openPayloadModal(templateKey = "hatchtech") {
  currentPayloadKey = templateKey;
  const pData = TRUCK_PAYLOAD_EXAMPLES[templateKey] || TRUCK_PAYLOAD_EXAMPLES.hatchtech;
  const modal = document.getElementById("modalViewPayload");
  if (!modal) return;

  // Update tabs active state
  document.querySelectorAll("#payloadTruckTabs .payload-tab-btn").forEach(tab => {
    if (tab.getAttribute("data-template") === templateKey) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  // Update meta elements
  const metaTitle = document.getElementById("payloadMetaTitle");
  const metaDesc = document.getElementById("payloadMetaDesc");
  const metaEndpoint = document.getElementById("payloadEndpointText");
  const filenameEl = document.getElementById("payloadFilename");
  const jsonPre = document.getElementById("payloadJsonPre");

  if (metaTitle) metaTitle.innerText = `${pData.title} (${pData.capacityFormatted})`;
  if (metaDesc) metaDesc.innerText = pData.specSummary;
  if (metaEndpoint) metaEndpoint.innerText = pData.endpointType;
  if (filenameEl) filenameEl.innerText = `${pData.key}_telemetry_payload.json`;
  if (jsonPre) {
    jsonPre.innerHTML = `<code>${JSON.stringify(pData.payload, null, 2)}</code>`;
  }

  modal.classList.add("show");
}

/**
 * Memperbarui pratinjau spesifikasi template di modal pendaftaran kendaraan baru
 */
export function updateNewVehiclePreview(templateKey) {
  const tmpl = VEHICLE_TEMPLATES[templateKey] || VEHICLE_TEMPLATES.joinaldy;
  
  const mTitle = document.getElementById("prevModelTitle");
  if (mTitle) mTitle.innerText = tmpl.model;

  const cap = document.getElementById("prevCapacity");
  if (cap) cap.innerText = tmpl.capacityFormatted || (tmpl.capacity.toLocaleString("id-ID") + " DOC");

  const sp = document.getElementById("prevSetpoint");
  if (sp) sp.innerText = `${tmpl.setpoint.toFixed(1)}°C`;

  const af = document.getElementById("prevAirflow");
  if (af) af.innerText = tmpl.airflow;

  const fa = document.getElementById("prevFreshAir");
  if (fa) fa.innerText = tmpl.freshAir || "Otomatis terkendali";

  const pwr = document.getElementById("prevPower");
  if (pwr) pwr.innerText = `${tmpl.powerType} (${tmpl.fuelTank} L)`;

  const zn = document.getElementById("prevZones");
  if (zn) zn.innerText = tmpl.zones || "3-Zona";

  const hvac = document.getElementById("prevCooling");
  if (hvac) hvac.innerText = tmpl.coolingCapacity || "Non-AC";

  const ref = document.getElementById("prevReference");
  if (ref) ref.innerText = tmpl.reference || "-";

  const sensList = document.getElementById("prevSensorsList");
  if (sensList && tmpl.sensorList) {
    sensList.innerHTML = tmpl.sensorList
      .map(s => `<li class="spec-list-item"><span class="spec-check">✓</span> <span>${s}</span></li>`)
      .join("");
  }

  const featList = document.getElementById("prevFeaturesList");
  if (featList && tmpl.features) {
    featList.innerHTML = tmpl.features
      .map(f => `<li class="spec-list-item"><span class="spec-bullet">•</span> <span>${f}</span></li>`)
      .join("");
  }
}

/**
 * Membuka Floating Rightbar (Panel Kontrol & Detail Pengiriman)
 */
export function openRightbar() {
  const rb = document.getElementById("tripRightbar");
  const rbBackdrop = document.getElementById("tripRightbarBackdrop");
  if (rb) {
    rb.classList.add("open");
    rb.scrollTop = 0;
  }
  if (rbBackdrop) rbBackdrop.classList.add("show");
}

/**
 * Menutup Floating Rightbar
 */
export function closeRightbar() {
  const rb = document.getElementById("tripRightbar");
  const rbBackdrop = document.getElementById("tripRightbarBackdrop");
  if (rb) rb.classList.remove("open");
  if (rbBackdrop) rbBackdrop.classList.remove("show");
}

/**
 * Update Rightbar (Dispatch Details & Controls Deck)
 */
export function updateRightbar() {
  const exp = getActiveExpedition();
  if (!exp) {
    const statusBadge = document.getElementById("rbTripStatusBadge");
    if (statusBadge) {
      statusBadge.className = "status-pill";
      statusBadge.innerText = "NO DISPATCH SELECTED";
    }
    const idEl = document.getElementById("ctrlTripId");
    if (idEl) idEl.innerText = "-";
    const doEl = document.getElementById("ctrlTripDO");
    if (doEl) doEl.innerText = "-";
    const titleEl = document.getElementById("ctrlTripTitle");
    if (titleEl) titleEl.innerText = "No Dispatch Manifest Registered";
    const strainEl = document.getElementById("ctrlStrainInfo");
    if (strainEl) strainEl.innerText = "-";
    const genderEl = document.getElementById("ctrlGenderInfo");
    if (genderEl) genderEl.innerText = "-";
    const biomassEl = document.getElementById("ctrlBiomassInfo");
    if (biomassEl) biomassEl.innerText = "-";
    const breederAgeEl = document.getElementById("ctrlBreederAgeInfo");
    if (breederAgeEl) breederAgeEl.innerText = "-";
    const packagingEl = document.getElementById("ctrlPackagingInfo");
    if (packagingEl) packagingEl.innerText = "-";
    const truckEl = document.getElementById("ctrlTruckInfo");
    if (truckEl) truckEl.innerText = "-";
    const modelEl = document.getElementById("ctrlModelInfo");
    if (modelEl) modelEl.innerText = "-";
    const driverEl = document.getElementById("ctrlDriverInfo");
    if (driverEl) driverEl.innerText = "-";
    return;
  }

  const vehicle = getActiveVehicle();

  const statusBadge = document.getElementById("rbTripStatusBadge");
  if (statusBadge) {
    statusBadge.className = "status-pill";
    if (exp.status === "RUNNING") {
      statusBadge.classList.add("running");
      statusBadge.innerText = "IN TRANSIT";
    } else if (exp.status === "COMPLETED") {
      statusBadge.classList.add("completed");
      statusBadge.innerText = "COMPLETED (ARCHIVED)";
    } else {
      statusBadge.classList.add("ready");
      statusBadge.innerText = "SCHEDULED / READY";
    }
  }

  const idEl = document.getElementById("ctrlTripId");
  if (idEl) idEl.innerText = exp.tripId;

  const doEl = document.getElementById("ctrlTripDO");
  if (doEl) doEl.innerText = exp.deliveryOrder || `DO-CPI-SBG-${exp.tripId.replace("TRIP-", "")}`;

  const titleEl = document.getElementById("ctrlTripTitle");
  if (titleEl) titleEl.innerText = exp.title;

  const strainEl = document.getElementById("ctrlStrainInfo");
  if (strainEl) strainEl.innerText = exp.strain || "Cobb 500";

  const genderEl = document.getElementById("ctrlGenderInfo");
  if (genderEl) genderEl.innerText = exp.gender || "As-Hatched / Straight Run (50:50)";

  const biomassEl = document.getElementById("ctrlBiomassInfo");
  if (biomassEl) {
    const qty = exp.quantity || 38400;
    const w = exp.averageWeightGrams || 42.0;
    const totalKg = ((qty * w) / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 });
    biomassEl.innerText = `${totalKg} kg (${w.toFixed(1)} g/chick)`;
  }

  const breederAgeEl = document.getElementById("ctrlBreederAgeInfo");
  if (breederAgeEl) breederAgeEl.innerText = exp.breederAge || "Prime (30 - 50 Weeks)";

  const packagingEl = document.getElementById("ctrlPackagingInfo");
  if (packagingEl) {
    packagingEl.innerText = `${exp.boxType || "Ventilated Plastic Crate"} (${exp.chicksPerBox || 100} chicks/box)`;
  }

  const truckEl = document.getElementById("ctrlTruckInfo");
  if (truckEl) truckEl.innerText = `${exp.truckId} (${vehicle.licensePlate})`;

  const modelEl = document.getElementById("ctrlModelInfo");
  if (modelEl) modelEl.innerText = vehicle.model || "HatchTech HatchTraveller";

  const driverEl = document.getElementById("ctrlDriverInfo");
  if (driverEl) driverEl.innerText = exp.driverName;

  const loadEl = document.getElementById("ctrlLoadInfo");
  if (loadEl) loadEl.innerText = `${(exp.quantity || 38400).toLocaleString("en-US")} DOC`;

  const setpointEl = document.getElementById("ctrlSetpointInfo");
  if (setpointEl) setpointEl.innerText = `${(exp.setpoint || 25.0).toFixed(1)}°C`;

  const targetRHEl = document.getElementById("ctrlTargetRHInfo");
  if (targetRHEl) targetRHEl.innerText = `${exp.targetRH || 65}% RH`;

  // Update Status Daya & Genset
  const powerEl = document.getElementById("ctrlPowerInfo");
  if (powerEl) {
    powerEl.innerText = `${runtime.fuelLevelPct.toFixed(1)}% Reefer Fuel &bull; ${runtime.batteryVoltage.toFixed(1)} V`;
    if (runtime.fuelLevelPct < 15 || runtime.batteryVoltage < 11.5) {
      powerEl.style.color = "#ef4444";
    } else {
      powerEl.style.color = "#38bdf8";
    }
  }

  // Update Status Sinyal & Buffer Offline
  const netEl = document.getElementById("ctrlNetworkInfo");
  if (netEl) {
    if (runtime.networkState === "GOOD") {
      netEl.innerText = "🟢 4G Online (0 Buf)";
      netEl.style.color = "#10b981";
    } else {
      netEl.innerText = `🔴 Blank Spot (${runtime.bufferedPacketsCount} Buffering)`;
      netEl.style.color = "#f59e0b";
    }
  }

  // Update Status Paket Streaming Telemetri
  const hashEl = document.getElementById("ctrlHashInfo");
  if (hashEl) {
    hashEl.innerText = `Seq #${runtime.sequenceNumber} • 1.0 Hz Active`;
  }

  // SECTION 4: GEOSPATIAL ROUTE & DEPARTURE SCHEDULE
  const depTimeEl = document.getElementById("ctrlDepartureTime");
  if (depTimeEl) {
    const dateStr = exp.departureDate ? `${exp.departureDate} &bull; ` : "";
    const timeStr = exp.departureTime
      ? `${exp.departureTime} WIB`
      : exp.timeOfDay === "DAY"
      ? "08:00 WIB"
      : "21:30 WIB";
    const icon = exp.timeOfDay === "DAY" ? "☀️ Daytime" : "🌙 Nighttime";
    depTimeEl.innerHTML = `${dateStr}${timeStr} (${icon})`;
  }

  const weatherEl = document.getElementById("ctrlWeatherInfo");
  if (weatherEl) {
    const wText =
      exp.weather === "SUNNY"
        ? "Clear 🌤️"
        : exp.weather === "LIGHT_RAIN"
        ? "Light Rain 🌧️"
        : "Severe Storm ⛈️";
    weatherEl.innerText = wText;
  }

  const originEl = document.getElementById("ctrlOriginInfo");
  if (originEl) {
    if (exp.origin) {
      const lat = typeof exp.origin.lat === "number" ? exp.origin.lat.toFixed(4) : exp.origin.lat;
      const lng = typeof exp.origin.lng === "number" ? exp.origin.lng.toFixed(4) : exp.origin.lng;
      originEl.innerText = `${exp.origin.name} (${lat}, ${lng})`;
    } else {
      originEl.innerText = "Subang Hatchery (-6.5650, 107.7600)";
    }
  }

  const destEl = document.getElementById("ctrlDestInfo");
  if (destEl) {
    if (exp.destination) {
      const lat = typeof exp.destination.lat === "number" ? exp.destination.lat.toFixed(4) : exp.destination.lat;
      const lng = typeof exp.destination.lng === "number" ? exp.destination.lng.toFixed(4) : exp.destination.lng;
      destEl.innerText = `${exp.destination.name} (${lat}, ${lng})`;
    } else {
      destEl.innerText = "Bogor Broiler Farm (-6.5980, 106.7990)";
    }
  }

  // Update Route Path Type & Dynamic Segment Labels
  const routeCfg = getRouteConfig(exp.routeType || "TOLL");
  const routeTypeEl = document.getElementById("ctrlRouteType");
  if (routeTypeEl) {
    routeTypeEl.innerText = `${routeCfg.icon} ${routeCfg.name} (${exp.totalDistanceKm || routeCfg.distanceKm} km)`;
  }

  const rbHeaderEl = document.getElementById("rbRoadwayHeader");
  if (rbHeaderEl) {
    const orig = exp.origin?.name ? exp.origin.name.split(" ")[0] : "";
    const dest = exp.destination?.name ? exp.destination.name.split(" ")[0] : "";
    if (orig && dest) {
      rbHeaderEl.innerText = `ROADWAY CONDITIONS & SIGNAL (${orig.toUpperCase()} → ${dest.toUpperCase()})`;
    } else {
      rbHeaderEl.innerText = "ROADWAY CONDITIONS & CELLULAR SIGNAL";
    }
  }

  const totKm = exp.totalDistanceKm || routeCfg.distanceKm || 145.0;
  const segStep = totKm / 5.0;
  for (let i = 0; i < 5; i++) {
    const segStartKm = Math.round(i * segStep);
    const segEndKm = Math.round((i + 1) * segStep);
    const lblEl = document.getElementById(`rbSegLabel${i + 1}`);
    const subEl = document.getElementById(`rbSegSub${i + 1}`);
    if (lblEl) {
      if (Math.abs(totKm - 145.0) < 5.0 && routeCfg.segments && routeCfg.segments[i]) {
        lblEl.innerText = routeCfg.segments[i].name;
      } else {
        lblEl.innerText = `Segmen ${i + 1} (KM ${segStartKm}-${segEndKm})`;
      }
    }
    if (subEl) {
      if (Math.abs(totKm - 145.0) < 5.0 && routeCfg.segments && routeCfg.segments[i]) {
        subEl.innerText = routeCfg.segments[i].sub;
      } else {
        subEl.innerText = `Koridor Jalur ${i * 20}% - ${(i + 1) * 20}%`;
      }
    }
  }

  // Rightbar 5-Segment Roadway & Cellular Signal Dropdowns
  if (exp.segments) {
    for (let i = 0; i < 5; i++) {
      const segEl = document.getElementById(`rbSeg${i + 1}`);
      if (segEl && exp.segments[i]) segEl.value = exp.segments[i];

      const sigEl = document.getElementById(`rbSig${i + 1}`);
      if (sigEl && exp.signalSegments && exp.signalSegments[i]) {
        sigEl.value = exp.signalSegments[i];
      }
    }
  }

  // Sync Dropdown Fan Speed & Damper
  const fanSelect = document.getElementById("ctrlFanSpeed");
  if (fanSelect) fanSelect.value = runtime.fanSpeed;

  const damperSelect = document.getElementById("ctrlAirInlet");
  if (damperSelect) damperSelect.value = runtime.airInlet;

  updateEngineUI();
}

/**
 * Update Engine Power UI & Status Indicator
 */
export function updateEngineUI() {
  const badge = document.getElementById("engineStatusBadge");
  const badgeText = document.getElementById("engineStatusText");
  const btn = document.getElementById("btnToggleEngine");
  const title = document.getElementById("btnEngineTitle");
  const sub = document.getElementById("btnEngineSub");

  if (!badge || !badgeText || !btn || !title || !sub) return;

  if (runtime.engineRunning) {
    badge.className = "engine-badge engine-on";
    badgeText.innerText = "ENGINE ACTIVE (IN TRANSIT)";
    btn.className = "btn btn-engine-power btn-stop";
    title.innerText = "🛑 STOP VEHICLE ENGINE";
    sub.innerText = "Halt vehicle & stop telemetry transmission";
  } else {
    badge.className = "engine-badge";
    badgeText.innerText = "ENGINE OFF (STANDBY)";
    btn.className = "btn btn-engine-power btn-start";
    title.innerText = "⚡ START ENGINE & DISPATCH TRUCK";
    sub.innerText = "Activate physics pipeline & stream live telemetry";
  }
}

/**
 * Update trip table row status pill directly without full re-render
 */
export function updateTripTableRowStatus(tripId, status, engineRunning) {
  const exp = expeditions.find(e => e.tripId === tripId);
  if (exp && status) {
    exp.status = status;
  }
  const rows = document.querySelectorAll("#expeditionsTableBody tr");
  rows.forEach(tr => {
    const btn = tr.querySelector(`.btn-select-trip[data-id="${tripId}"]`) || tr.querySelector(`.btn-delete-trip[data-id="${tripId}"]`);
    if (btn) {
      const pill = tr.querySelector(".status-pill");
      if (pill) {
        if (status === "RUNNING" || engineRunning) {
          pill.className = "status-pill running";
          pill.innerText = "IN TRANSIT";
        } else if (status === "COMPLETED") {
          pill.className = "status-pill completed";
          pill.innerText = "COMPLETED (ARCHIVED)";
        } else {
          pill.className = "status-pill ready";
          pill.innerText = "SCHEDULED / READY";
        }
      }
    }
  });
}

/**
 * Update posisi armada pada tabel vehicles berdasarkan paket telemetri live
 */
export function updateVehicleFromTelemetry(p) {
  if (!p || !p.identity) return;
  const truckId = p.identity.truck_id;
  const v = vehicles.find(veh => veh.truckId === truckId);
  if (v && p.vehicle) {
    if (typeof p.vehicle.latitude === "number") v.lastLatitude = p.vehicle.latitude;
    if (typeof p.vehicle.longitude === "number") v.lastLongitude = p.vehicle.longitude;
    if (typeof p.vehicle.speed_kmh === "number") v.lastSpeedKmh = p.vehicle.speed_kmh;
    if (typeof p.vehicle.heading_deg === "number") v.headingDeg = p.vehicle.heading_deg;
    v.isMoving = p.engineRunning && (p.vehicle.speed_kmh > 0);
    v.status = p.engineRunning ? "ON_TRIP" : "AVAILABLE";
    v.activeTripId = p.identity.trip_id;
    if (p.vehicle.location_name) v.lastLocationName = p.vehicle.location_name;
    renderVehiclesTable();
    renderFleetMap();
  }
}

/**
 * Update Status Visual Tombol-Tombol Fault Injection
 */
export function updateFaultUI() {
  const map = {
    toggleChiller: runtime.faults.chillerFail,
    toggleDoor: runtime.faults.doorOpen,
    toggleVent: runtime.faults.ventFail,
    toggleTraffic: runtime.faults.trafficStop,
    toggleFuelEmpty: runtime.faults.fuelEmpty,
    toggleLowBattery: runtime.faults.lowBattery,
    toggleSensorDrift: runtime.faults.sensorDrift,
    toggleSensorFreeze: runtime.faults.sensorFreeze,
    toggleSensorSpike: runtime.faults.sensorSpike,
    toggleSensorNull: runtime.faults.sensorNull,
    toggleBlankSpot: runtime.faults.blankSpot
  };

  for (const [id, active] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("active-fault", !!active);
  }
}

/**
 * Kontrol Buka/Tutup Sidebar Kiri (Leftbar)
 */
export function toggleSidebar() {
  const sidebar = document.getElementById("appSidebar");
  const btnToggle = document.getElementById("btnToggleSidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  if (!sidebar) return;

  if (window.innerWidth <= 900) {
    const isOpen = sidebar.classList.toggle("open");
    if (backdrop) backdrop.classList.toggle("show", isOpen);
    if (btnToggle) btnToggle.classList.toggle("active", isOpen);
  } else {
    const isCollapsed = sidebar.classList.toggle("collapsed");
    localStorage.setItem("sidebar_collapsed", isCollapsed ? "true" : "false");
    if (btnToggle) btnToggle.classList.toggle("active", isCollapsed);
  }
}

export function closeSidebar() {
  const sidebar = document.getElementById("appSidebar");
  const btnToggle = document.getElementById("btnToggleSidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  if (!sidebar) return;

  if (window.innerWidth <= 900) {
    sidebar.classList.remove("open");
    if (backdrop) backdrop.classList.remove("show");
    if (btnToggle) btnToggle.classList.remove("active");
  } else {
    sidebar.classList.add("collapsed");
    localStorage.setItem("sidebar_collapsed", "true");
    if (btnToggle) btnToggle.classList.add("active");
  }
}

export function openSidebar() {
  const sidebar = document.getElementById("appSidebar");
  const btnToggle = document.getElementById("btnToggleSidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  if (!sidebar) return;

  if (window.innerWidth <= 900) {
    sidebar.classList.add("open");
    if (backdrop) backdrop.classList.add("show");
    if (btnToggle) btnToggle.classList.add("active");
  } else {
    sidebar.classList.remove("collapsed");
    localStorage.setItem("sidebar_collapsed", "false");
    if (btnToggle) btnToggle.classList.remove("active");
  }
}

/**
 * Binding Navigasi Tab Sidebar, Filter Tabel & Toggle Buka-Tutup Leftbar
 */
export function bindSidebar() {
  const sidebar = document.getElementById("appSidebar");
  const btnToggle = document.getElementById("btnToggleSidebar");
  const btnClose = document.getElementById("btnCollapseSidebar");
  const backdrop = document.getElementById("sidebarBackdrop");

  // Pulihkan preferensi buka/tutup tersimpan di localStorage (khusus desktop)
  if (sidebar && window.innerWidth > 900) {
    const isCollapsedSaved = localStorage.getItem("sidebar_collapsed") === "true";
    if (isCollapsedSaved) {
      sidebar.classList.add("collapsed");
      if (btnToggle) btnToggle.classList.add("active");
    }
  }

  // Tombol Toggle di Header Bar
  if (btnToggle) {
    btnToggle.addEventListener("click", e => {
      e.stopPropagation();
      toggleSidebar();
    });
  }

  // Tombol Tutup di Header Sidebar Brand
  if (btnClose) {
    btnClose.addEventListener("click", e => {
      e.stopPropagation();
      closeSidebar();
    });
  }

  // Klik Backdrop untuk menutup drawer pada mobile
  if (backdrop) {
    backdrop.addEventListener("click", () => {
      closeSidebar();
    });
  }

  // Keyboard shortcut Ctrl+B atau Cmd+B untuk toggle buka-tutup
  window.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      e.preventDefault();
      toggleSidebar();
    }
  });

  document.querySelectorAll(".nav-item[data-view]").forEach(item => {
    item.addEventListener("click", () => {
      document.querySelectorAll(".nav-item[data-view]").forEach(i => i.classList.remove("active"));
      document.querySelectorAll(".view-panel").forEach(p => p.classList.remove("active"));

      item.classList.add("active");
      const viewId = item.getAttribute("data-view");
      const targetPanel = document.getElementById(viewId);
      if (targetPanel) targetPanel.classList.add("active");

      const bc = document.getElementById("breadcrumbPage");
      if (bc) {
        if (viewId === "view-expeditions") {
          bc.innerText = "Dispatch Manifests & Itinerary Planning";
          renderExpeditionsTable();
        } else if (viewId === "view-vehicles") {
          bc.innerText = "Registered Vehicle Fleet";
          syncConfigFromBackend().then(() => {
            renderVehiclesTable();
            initFleetMap();
            renderFleetMap();
            fitFleetMapBounds();
          });
        } else if (viewId === "view-templates") {
          bc.innerText = "Patented Vehicle Specifications & Sensor Suites (data_truck.md)";
          renderTemplatesGrid();
        }
      }

      // Automatically close sidebar on mobile/tablet upon navigation
      if (window.innerWidth <= 900) {
        closeSidebar();
      }
    });
  });

  document.querySelectorAll(".table-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".table-filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderExpeditionsTable(btn.getAttribute("data-filter"));
    });
  });
}

/**
 * Binding Lifecycle Controls, Speed Multipliers, Actuators, Faults & Segment Dropdowns
 */
export function bindLifecycleControls() {
  const btnToggle = document.getElementById("btnToggleEngine");
  if (btnToggle) {
    btnToggle.addEventListener("click", () => {
      if (runtime.engineRunning) stopEngine();
      else startEngine();
    });
  }

  const btnReset = document.getElementById("btnResetTrip");
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      if (confirm("Reset trip position to route origin (KM 0)?")) {
        resetTrip();
      }
    });
  }

  document.querySelectorAll(".speed-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      document.querySelectorAll(".speed-btn").forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      setSpeedMultiplier(e.target.getAttribute("data-speed"));
    });
  });

  // A. Blower Speed & Air Inlet Damper Actuators
  const fanSelect = document.getElementById("ctrlFanSpeed");
  if (fanSelect) {
    fanSelect.addEventListener("change", e => {
      runtime.fanSpeed = e.target.value;
      broadcastTelemetry();
      const exp = getActiveExpedition();
      if (exp) syncBackendActuator(exp.tripId, { fan_speed: runtime.fanSpeed });
    });
  }

  const damperSelect = document.getElementById("ctrlAirInlet");
  if (damperSelect) {
    damperSelect.addEventListener("change", e => {
      runtime.airInlet = e.target.value;
      broadcastTelemetry();
      const exp = getActiveExpedition();
      if (exp) syncBackendActuator(exp.tripId, { air_inlet: runtime.airInlet });
    });
  }

  // B. Mechanical & Electrical Fault Injections
  const faultMappings = [
    { id: "toggleChiller", key: "chillerFail" },
    { id: "toggleDoor", key: "doorOpen" },
    { id: "toggleVent", key: "ventFail" },
    { id: "toggleTraffic", key: "trafficStop" },
    { id: "toggleFuelEmpty", key: "fuelEmpty" },
    { id: "toggleLowBattery", key: "lowBattery" },
    { id: "toggleSensorDrift", key: "sensorDrift" },
    { id: "toggleSensorFreeze", key: "sensorFreeze" },
    { id: "toggleSensorSpike", key: "sensorSpike" },
    { id: "toggleSensorNull", key: "sensorNull" },
    { id: "toggleBlankSpot", key: "blankSpot" }
  ];

  faultMappings.forEach(({ id, key }) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("click", () => toggleFault(key));
    }
  });

  const btnGap = document.getElementById("triggerSeqGap");
  if (btnGap) {
    btnGap.addEventListener("click", () => {
      runtime.sequenceNumber += 10;
      alert(`⚠️ Sequence Gap Injection Triggered: Sequence number jumped to #${runtime.sequenceNumber}. This will trigger an on-chain audit violation flag.`);
      updateRightbar();
      broadcastTelemetry();
    });
  }

  // D. Roadway Condition & Cellular Signal Dropdowns across 5 Route Segments
  for (let i = 1; i <= 5; i++) {
    const elSeg = document.getElementById(`rbSeg${i}`);
    if (elSeg) {
      elSeg.addEventListener("change", e => {
        const exp = getActiveExpedition();
        if (exp) {
          if (!exp.segments) exp.segments = ["FREE_FLOW", "FREE_FLOW", "CONGESTED", "FREE_FLOW", "FREE_FLOW"];
          exp.segments[i - 1] = e.target.value;
          saveConfigData();
          syncBackendSegments(exp.tripId, exp.segments);
          broadcastTelemetry();
        }
      });
    }

    const elSig = document.getElementById(`rbSig${i}`);
    if (elSig) {
      elSig.addEventListener("change", e => {
        const exp = getActiveExpedition();
        if (exp) {
          if (!exp.signalSegments) exp.signalSegments = ["GOOD", "GOOD", "GOOD", "BAD", "GOOD"];
          exp.signalSegments[i - 1] = e.target.value;
          saveConfigData();
          broadcastTelemetry();
        }
      });
    }
  }
}

/**
 * Binding Modal Dialogs (New Expedition & New Vehicle)
 */
export function bindModals() {
  const mExp = document.getElementById("modalNewExpedition");
  const btnOpenExp = document.getElementById("btnOpenNewExpeditionModal");

  const btnClearExp = document.getElementById("btnClearExpeditions");
  if (btnClearExp) {
    btnClearExp.addEventListener("click", async () => {
      if (confirm("⚠️ Are you sure you want to clear all dispatch manifests? Queue will be emptied for new dispatch planning.")) {
        try {
          await fetch("/api/v1/simulation/trips/clear", { method: "POST" });
        } catch (err) {}
        localStorage.removeItem(STORAGE_KEYS.EXPEDITIONS);
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_TRIP);
        loadConfigData();
        await syncConfigFromBackend();
        renderExpeditionsTable();
        updateRightbar();
        broadcastTelemetry();
        alert("✅ All dispatch manifests have been cleared.");
      }
    });
  }

  if (btnOpenExp && mExp) {
    btnOpenExp.addEventListener("click", () => {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const datePart = `${yyyy}${mm}${dd}`;
      const isoDate = `${yyyy}-${mm}-${dd}`;
      const nextNum = String(expeditions.length + 1).padStart(2, "0");
      const tripIdInput = document.getElementById("newTripId");
      if (tripIdInput) tripIdInput.value = `TRIP-${datePart}-${nextNum}`;

      const tripDOInput = document.getElementById("newTripDO");
      if (tripDOInput) tripDOInput.value = `DO-CPI-SBG-${datePart}-${nextNum}`;

      const depDateInput = document.getElementById("newDepartureDate");
      if (depDateInput) depDateInput.value = isoDate;

      const sel = document.getElementById("newTripVehicleSelect");
      if (sel) {
        sel.innerHTML = "";
        vehicles.forEach(v => {
          const opt = document.createElement("option");
          opt.value = v.truckId;
          opt.innerText = `${v.truckId} - ${v.model} (${v.licensePlate})`;
          sel.appendChild(opt);
        });

        if (vehicles.length > 0) {
          const firstVeh = vehicles[0];
          if (firstVeh.capacity) {
            const qEl = document.getElementById("newTripQuantity");
            if (qEl) qEl.value = firstVeh.capacity;
          }
          if (firstVeh.setpoint) {
            const spEl = document.getElementById("newTripSetpoint");
            if (spEl) spEl.value = firstVeh.setpoint;
          }
        }
      }

      const routeSel = document.getElementById("newTripRouteType");
      if (routeSel) routeSel.value = "TOLL";
      const routeHint = document.getElementById("newTripRouteHint");
      if (routeHint) {
        routeHint.innerText = "Route preference for OSRM API routing calculation (Toll / Non-Toll)";
        routeHint.style.color = "#94a3b8";
      }

      mExp.classList.add("show");
      setTimeout(() => initRoutePickerMap(), 250);
    });
  }

  const vehSelect = document.getElementById("newTripVehicleSelect");
  if (vehSelect) {
    vehSelect.addEventListener("change", e => {
      const v = vehicles.find(x => x.truckId === e.target.value);
      if (v) {
        if (v.capacity) {
          const qEl = document.getElementById("newTripQuantity");
          if (qEl) qEl.value = v.capacity;
        }
        if (v.setpoint) {
          const spEl = document.getElementById("newTripSetpoint");
          if (spEl) spEl.value = v.setpoint;
        }
      }
    });
  }

  const btnCloseExp = document.getElementById("btnCloseExpeditionModal");
  if (btnCloseExp && mExp) btnCloseExp.addEventListener("click", () => mExp.classList.remove("show"));

  const btnCancelExp = document.getElementById("btnCancelExpeditionModal");
  if (btnCancelExp && mExp) btnCancelExp.addEventListener("click", () => mExp.classList.remove("show"));

  const depTimeInput = document.getElementById("newDepartureTime");
  const depTimeHint = document.getElementById("newDepartureTimeHint");
  if (depTimeInput && depTimeHint) {
    depTimeInput.addEventListener("input", e => {
      const val = e.target.value;
      if (!val) return;
      const h = parseInt(val.split(":")[0], 10) || 0;
      if (h >= 6 && h < 18) {
        depTimeHint.innerText = `☀️ Daytime (06:00 - 18:00)`;
        depTimeHint.style.color = "#38bdf8";
      } else {
        depTimeHint.innerText = `🌙 Nighttime (18:00 - 06:00)`;
        depTimeHint.style.color = "#93c5fd";
      }
    });
  }

  const routeTypeSelect = document.getElementById("newTripRouteType");
  const routeTypeHint = document.getElementById("newTripRouteHint");
  if (routeTypeSelect && routeTypeHint) {
    routeTypeSelect.addEventListener("change", e => {
      const val = e.target.value;
      if (val === "NON_TOLL") {
        routeTypeHint.innerText = "Non-Toll Preference: Route calculated via OSRM API with exclude=toll parameter";
        routeTypeHint.style.color = "#fbbf24";
      } else {
        routeTypeHint.innerText = "Toll Preference: Route calculated via OSRM API using fastest expressway";
        routeTypeHint.style.color = "#38bdf8";
      }
    });
  }

  const formExp = document.getElementById("formNewExpedition");
  if (formExp && mExp) {
    formExp.addEventListener("submit", e => {
      e.preventDefault();

      const depDate = (document.getElementById("newDepartureDate")?.value) || new Date().toISOString().slice(0, 10);
      const depTime = (document.getElementById("newDepartureTime")?.value) || "08:00";
      const depHour = parseInt(depTime.split(":")[0], 10) || 8;
      const timeOfDay = (depHour >= 6 && depHour < 18) ? "DAY" : "NIGHT";

      const originName = (document.getElementById("newOriginName")?.value || "").trim() || "Origin Hatchery Facility";
      const originLat = parseFloat(document.getElementById("newOriginLat")?.value) || -6.5650;
      const originLng = parseFloat(document.getElementById("newOriginLng")?.value) || 107.7600;

      const destName = (document.getElementById("newDestName")?.value || document.getElementById("newDestinationName")?.value || "").trim() || "Destination Broiler Farm";
      const destLat = parseFloat(document.getElementById("newDestLat")?.value) || -6.5980;
      const destLng = parseFloat(document.getElementById("newDestLng")?.value) || 106.7990;

      const initialFuel = parseFloat(document.getElementById("newTripFuel")?.value) || 100.0;
      const initialVolt = parseFloat(document.getElementById("newTripVoltage")?.value) || 24.2;

      const routeType = document.getElementById("newTripRouteType")?.value || "TOLL";
      const routeCfg = getRouteConfig(routeType);

      const newExp = {
        tripId: (document.getElementById("newTripId")?.value || "").trim(),
        deliveryOrder: (document.getElementById("newTripDO")?.value || "").trim() || `DO-CPI-SBG-20261029-${String(expeditions.length + 1).padStart(2, "0")}`,
        title: (document.getElementById("newTripTitle")?.value || "").trim(),
        routeType: routeType,
        totalDistanceKm: routeCfg.distanceKm,
        strain: document.getElementById("newTripStrain")?.value || "Cobb 500",
        averageWeightGrams: parseFloat(document.getElementById("newTripWeight")?.value) || 42.0,
        breederAge: document.getElementById("newTripBreederAge")?.value || "Prime (30 - 50 Weeks)",
        gender: document.getElementById("newTripGender")?.value || "As-Hatched (Straight Run 50:50)",
        boxType: document.getElementById("newTripBoxType")?.value || "Ventilated Plastic Crate",
        chicksPerBox: parseInt(document.getElementById("newTripDensity")?.value, 10) || 100,
        truckId: document.getElementById("newTripVehicleSelect")?.value,
        driverName: (document.getElementById("newTripDriver")?.value || "").trim(),
        origin: {
          name: originName,
          lat: originLat,
          lng: originLng
        },
        destination: {
          name: destName,
          lat: destLat,
          lng: destLng
        },
        departureDate: depDate,
        departureTime: depTime,
        quantity: parseInt(document.getElementById("newTripQuantity")?.value, 10) || 38400,
        setpoint: parseFloat(document.getElementById("newTripSetpoint")?.value) || 25.0,
        targetRH: parseInt(document.getElementById("newTripTargetRH")?.value, 10) || 65,
        fuelLevelPct: initialFuel,
        batteryVoltage: initialVolt,
        timeOfDay: timeOfDay,
        weather: document.getElementById("newTripWeather")?.value || "SUNNY",
        segments: ["FREE_FLOW", "FREE_FLOW", "FREE_FLOW", "FREE_FLOW", "FREE_FLOW"],
        signalSegments: ["GOOD", "GOOD", "GOOD", "BAD", "GOOD"],
        status: "READY",
        createdAt: new Date().toISOString()
      };

      expeditions.unshift(newExp);
      setActiveTripId(newExp.tripId);

      stopEngine();
      initDensePath(newExp.routeType);
      runtime.currentIdx = 0;
      runtime.elapsedSec = 0;
      runtime.distanceTraveledKm = 0;
      runtime.speed = 0;
      runtime.fuelLevelPct = initialFuel;
      runtime.batteryVoltage = initialVolt;

      saveConfigData();
      renderExpeditionsTable();
      updateRightbar();
      broadcastTelemetry();

      // Submit button visual feedback
      const submitBtn = formExp.querySelector('button[type="submit"]');
      const origText = submitBtn ? submitBtn.innerHTML : "💾 Save Dispatch Manifest";
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = "⏳ Calculating OSRM Route (Car Profile)...";
      }

      // Synchronize dispatch registration to FastAPI backend (auto-calculates OSRM car route)
      fetch("/api/v1/simulation/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: newExp.tripId,
          truck_id: newExp.truckId || "TRUCK-AJ-36000-01",
          delivery_order: newExp.deliveryOrder,
          driver_name: newExp.driverName,
          route_type: newExp.routeType,
          cargo_strain: newExp.strain,
          cargo_quantity: newExp.quantity,
          average_weight_g: newExp.averageWeightGrams,
          box_type: newExp.boxType,
          chicks_per_box: newExp.chicksPerBox,
          departure_date: newExp.departureDate,
          departure_time: newExp.departureTime,
          weather: newExp.weather,
          origin_name: newExp.origin.name,
          origin_lat: newExp.origin.lat,
          origin_lng: newExp.origin.lng,
          destination_name: newExp.destination.name,
          destination_lat: newExp.destination.lat,
          destination_lng: newExp.destination.lng
        })
      })
      .then(r => r.json())
      .then(res => {
        if (res && res.osrm_route && res.osrm_route.total_distance_km) {
          const osrmDist = res.osrm_route.total_distance_km;
          newExp.totalDistanceKm = osrmDist;
          runtime.totalDistanceKm = osrmDist;
          saveConfigData();
          renderExpeditionsTable();
          updateRightbar();
        }
      })
      .catch(err => console.warn("Sync new trip to backend failed:", err))
      .finally(() => {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = origText;
        }
      });

      mExp.classList.remove("show");
      openRightbar();
      alert(`✅ Dispatch Manifest ${newExp.tripId} (${newExp.deliveryOrder}) created successfully!`);
    });
  }

  // Modal Lembar Spesifikasi Paten Truk
  const mSpec = document.getElementById("modalViewSpec");
  const btnCloseSpec = document.getElementById("btnCloseSpecModal");
  if (btnCloseSpec && mSpec) btnCloseSpec.addEventListener("click", () => mSpec.classList.remove("show"));
  const btnDismissSpec = document.getElementById("btnDismissSpecModal");
  if (btnDismissSpec && mSpec) btnDismissSpec.addEventListener("click", () => mSpec.classList.remove("show"));
  const btnSpecSwitch = document.getElementById("btnSpecSwitchToPayload");
  if (btnSpecSwitch && mSpec) {
    btnSpecSwitch.addEventListener("click", () => {
      mSpec.classList.remove("show");
      openPayloadModal(currentSpecTemplateKey || "hatchtech");
    });
  }

  // Event listener tombol "Lihat Spesifikasi Paten" di Vendor Cards & Klik Gambar
  document.querySelectorAll(".vendor-card").forEach(card => {
    const btn = card.querySelector(".btn-view-spec");
    const tmplKey = btn ? btn.getAttribute("data-template") : null;
    if (tmplKey) {
      const imgWrap = card.querySelector(".vendor-img-wrapper");
      if (imgWrap) {
        imgWrap.style.cursor = "pointer";
        imgWrap.title = "Klik untuk melihat spesifikasi paten armada";
        imgWrap.addEventListener("click", () => openSpecModal(tmplKey));
      }
    }
  });

  document.querySelectorAll(".btn-view-spec").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const tmplKey = btn.getAttribute("data-template") || "hatchtech";
      openSpecModal(tmplKey);
    });
  });

  // Modal Contoh Payload Telemetri Truk (data_truck.md Bab 6)
  const mPayload = document.getElementById("modalViewPayload");
  const btnClosePayload = document.getElementById("btnClosePayloadModal");
  if (btnClosePayload && mPayload) btnClosePayload.addEventListener("click", () => mPayload.classList.remove("show"));
  const btnDismissPayload = document.getElementById("btnDismissPayloadModal");
  if (btnDismissPayload && mPayload) btnDismissPayload.addEventListener("click", () => mPayload.classList.remove("show"));

  // Header Button: Buka Contoh Payload Semua Truk
  const btnOpenAllPayloads = document.getElementById("btnOpenAllPayloadsModal");
  if (btnOpenAllPayloads) {
    btnOpenAllPayloads.addEventListener("click", () => {
      openPayloadModal(currentPayloadKey || "hatchtech");
    });
  }

  // Tombol individual "Contoh Payload" pada masing-masing vendor card
  document.querySelectorAll(".btn-view-payload").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const tmplKey = btn.getAttribute("data-template") || "hatchtech";
      openPayloadModal(tmplKey);
    });
  });

  // Tab switcher di dalam Payload Modal
  document.querySelectorAll("#payloadTruckTabs .payload-tab-btn").forEach(tab => {
    tab.addEventListener("click", () => {
      const tmplKey = tab.getAttribute("data-template") || "hatchtech";
      openPayloadModal(tmplKey);
    });
  });

  // Copy JSON Payload to Clipboard
  const btnCopyPayload = document.getElementById("btnCopyPayload");
  if (btnCopyPayload) {
    btnCopyPayload.addEventListener("click", () => {
      const pData = TRUCK_PAYLOAD_EXAMPLES[currentPayloadKey] || TRUCK_PAYLOAD_EXAMPLES.hatchtech;
      const jsonStr = JSON.stringify(pData.payload, null, 2);
      navigator.clipboard.writeText(jsonStr).then(() => {
        const copyText = document.getElementById("copyText");
        const copyIcon = document.getElementById("copyIcon");
        if (copyText) copyText.innerText = "Copied to Clipboard!";
        if (copyIcon) copyIcon.innerText = "✅";
        btnCopyPayload.classList.add("copied");

        setTimeout(() => {
          if (copyText) copyText.innerText = "Copy JSON";
          if (copyIcon) copyIcon.innerText = "📋";
          btnCopyPayload.classList.remove("copied");
        }, 2000);
      }).catch(err => {
        console.error("Failed to copy JSON:", err);
      });
    });
  }

  // Download JSON Payload as .json file
  const btnDownloadPayload = document.getElementById("btnDownloadPayloadJson");
  if (btnDownloadPayload) {
    btnDownloadPayload.addEventListener("click", () => {
      const pData = TRUCK_PAYLOAD_EXAMPLES[currentPayloadKey] || TRUCK_PAYLOAD_EXAMPLES.hatchtech;
      const jsonStr = JSON.stringify(pData.payload, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${pData.key}_telemetry_payload.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // Modal Register New Fleet Vehicle (Inherits Audy Joinaldy Patent Specifications)
  const mVeh = document.getElementById("modalNewVehicle");
  const btnOpenVeh = document.getElementById("btnOpenNewVehicleModal");

  if (btnOpenVeh && mVeh) {
    btnOpenVeh.addEventListener("click", () => {
      const nextVNum = String(vehicles.length + 1).padStart(3, "0");
      const vTruckInput = document.getElementById("vTruckId");
      if (vTruckInput) vTruckInput.value = `TRUCK-AJ-36000-${nextVNum}`;
      
      const vPlateInput = document.getElementById("vLicensePlate");
      if (vPlateInput) vPlateInput.value = "";

      const tmplSelect = document.getElementById("vehicleTemplateSelect");
      if (tmplSelect) {
        tmplSelect.value = "joinaldy";
        updateNewVehiclePreview("joinaldy");
      }

      mVeh.classList.add("show");
    });
  }

  const btnCloseVeh = document.getElementById("btnCloseVehicleModal");
  if (btnCloseVeh && mVeh) btnCloseVeh.addEventListener("click", () => mVeh.classList.remove("show"));

  const btnCancelVeh = document.getElementById("btnCancelVehicleModal");
  if (btnCancelVeh && mVeh) btnCancelVeh.addEventListener("click", () => mVeh.classList.remove("show"));

  // Template select change listener
  const tmplSelect = document.getElementById("vehicleTemplateSelect");
  if (tmplSelect) {
    tmplSelect.addEventListener("change", e => {
      // Exclusively Audy Joinaldy template permitted
      if (e.target.value !== "joinaldy") {
        e.target.value = "joinaldy";
      }
      updateNewVehiclePreview("joinaldy");
    });
  }

  // Submit Handler: Inherits all patent parameters from Audy Joinaldy template
  const formVeh = document.getElementById("formNewVehicle");
  if (formVeh && mVeh) {
    formVeh.addEventListener("submit", e => {
      e.preventDefault();

      const truckIdVal = (document.getElementById("vTruckId")?.value || "").trim();
      const licensePlateVal = (document.getElementById("vLicensePlate")?.value || "").trim();
      const tmplKey = "joinaldy"; // Exclusive Audy Joinaldy research template
      const tmpl = VEHICLE_TEMPLATES.joinaldy;

      if (!truckIdVal || !licensePlateVal) {
        alert("Please complete both Vehicle ID (Truck ID) and License Plate!");
        return;
      }

      if (vehicles.some(v => v.truckId.toLowerCase() === truckIdVal.toLowerCase())) {
        alert(`Vehicle ID '${truckIdVal}' is already registered! Please use a unique ID.`);
        return;
      }

      // Inherit all physical dimensions, capacity, ventilation, and sensor suite from Audy template
      const newVeh = {
        truckId: truckIdVal,
        licensePlate: licensePlateVal,
        templateKey: tmplKey,
        model: tmpl.model,
        vendor: tmpl.vendor,
        country: tmpl.country,
        airflow: tmpl.airflow,
        freshAir: tmpl.freshAir,
        capacity: tmpl.capacity,
        setpoint: tmpl.setpoint,
        coolingCapacity: tmpl.coolingCapacity,
        fuelTank: tmpl.fuelTank,
        powerType: tmpl.powerType,
        zones: tmpl.zones,
        sensors: tmpl.sensors,
        sensorList: tmpl.sensorList,
        status: "AVAILABLE",
        lastLatitude: -6.5650,
        lastLongitude: 107.7600,
        lastLocationName: "Subang Hatchery Pool",
        lastSpeedKmh: 0.0,
        lastTelemetryAt: new Date().toISOString(),
        isMoving: false
      };

      vehicles.push(newVeh);
      saveConfigData();
      renderVehiclesTable();

      // Synchronize new vehicle to FastAPI backend
      fetch("/api/v1/simulation/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          truck_id: newVeh.truckId,
          plate_number: newVeh.licensePlate,
          template_key: newVeh.templateKey,
          display_name: `${newVeh.model} (${newVeh.licensePlate})`,
          notes: "Auto-registered via UI"
        })
      }).catch(err => console.warn("Sync new vehicle to backend failed:", err));

      mVeh.classList.remove("show");
      alert(`✅ Fleet Vehicle ${newVeh.truckId} (${newVeh.model}) registered successfully!\nAll physical dimensions & sensors automatically inherit Audy Joinaldy (2020) empirical benchmarks.`);
    });
  }

  // Dismiss modals & rightbar upon ESC key
  window.addEventListener("keydown", e => {
    if (e.key === "Escape" || e.key === "Esc" || e.keyCode === 27) {
      document.querySelectorAll(".modal-backdrop.show").forEach(m => {
        m.classList.remove("show");
      });
      closeRightbar();
    }
  });

  // Dismiss modal when clicking backdrop
  document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
    backdrop.addEventListener("click", e => {
      if (e.target === backdrop) {
        backdrop.classList.remove("show");
      }
    });
  });

  // Event listener for rightbar close button and backdrop
  const btnCloseRb = document.getElementById("btnCloseRightbar");
  if (btnCloseRb) {
    btnCloseRb.addEventListener("click", () => {
      closeRightbar();
    });
  }

  const rbBackdrop = document.getElementById("tripRightbarBackdrop");
  if (rbBackdrop) {
    rbBackdrop.addEventListener("click", () => {
      closeRightbar();
    });
  }

  // Event listener for floating trigger button
  const btnOpenFloating = document.getElementById("btnOpenFloatingRightbar");
  if (btnOpenFloating) {
    btnOpenFloating.addEventListener("click", () => {
      openRightbar();
    });
  }
}

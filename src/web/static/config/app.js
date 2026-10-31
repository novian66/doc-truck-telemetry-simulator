/**
 * Config Console Main Application Entrypoint (ES Module)
 * Mengorkestrasi state sistem, inisialisasi dense path geodesik,
 * binding antarmuka pengguna, pemancar telemetri awal, dan streaming duplex WebSocket FastAPI
 */

import {
  loadConfigData,
  syncConfigFromBackend,
  activeTripId,
  applyTelemetryToRuntime
} from "./modules/state.js";
import { initDensePath } from "./modules/engine.js";
import { broadcastTelemetry } from "./modules/telemetry.js";
import {
  renderExpeditionsTable,
  renderVehiclesTable,
  renderTemplatesGrid,
  updateRightbar,
  updateEngineUI,
  updateTripTableRowStatus,
  updateVehicleFromTelemetry,
  bindSidebar,
  bindLifecycleControls,
  bindModals
} from "./modules/ui.js";

let wsClient = null;
let reconnectTimer = null;
let restPollingInterval = null;

/**
 * Buka koneksi streaming WebSocket ke endpoint FastAPI: /ws/telemetry
 * Sinkronisasi status mesin, kecepatan, dan jarak tempuh secara real-time
 */
export function connectConfigWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;

  try {
    if (wsClient) {
      try { wsClient.close(); } catch (e) {}
    }

    wsClient = new WebSocket(wsUrl);

    wsClient.onopen = () => {
      console.log("🟢 [Config] Terhubung ke FastAPI WebSocket Telemetry Stream:", wsUrl);
      window.__wsActive = true;
      if (restPollingInterval) {
        clearInterval(restPollingInterval);
        restPollingInterval = null;
      }
    };

    wsClient.onmessage = event => {
      try {
        const payload = JSON.parse(event.data);
        const trip = payload?.identity?.trip_id;
        if (!activeTripId || trip === activeTripId) {
          applyTelemetryToRuntime(payload);
          updateEngineUI();
          updateRightbar();
          updateTripTableRowStatus(trip, payload.tripStatus, payload.engineRunning);
        }
        updateVehicleFromTelemetry(payload);
      } catch (err) {
        console.warn("Gagal parse paket WebSocket di config:", err);
      }
    };

    wsClient.onerror = () => {
      window.__wsActive = false;
      startRestPollingFallback();
    };

    wsClient.onclose = () => {
      window.__wsActive = false;
      startRestPollingFallback();
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectConfigWebSocket, 3000);
    };
  } catch (err) {
    window.__wsActive = false;
    startRestPollingFallback();
  }
}

function startRestPollingFallback() {
  if (!restPollingInterval) {
    restPollingInterval = setInterval(async () => {
      if (activeTripId) {
        try {
          const res = await fetch(`/api/v1/simulation/latest?trip_id=${encodeURIComponent(activeTripId)}`);
          if (res.ok) {
            const data = await res.json();
            applyTelemetryToRuntime(data);
            updateEngineUI();
            updateRightbar();
            updateTripTableRowStatus(activeTripId, data.tripStatus, data.engineRunning);
            updateVehicleFromTelemetry(data);
          }
        } catch (e) {}
      }
    }, 1500);
  }
}

export async function init() {
  loadConfigData();
  // Sinkronisasi prioritas langsung dari database backend FastAPI
  await syncConfigFromBackend();
  initDensePath();
  renderExpeditionsTable();
  renderVehiclesTable();
  renderTemplatesGrid();
  updateRightbar();
  updateEngineUI();
  bindSidebar();
  bindLifecycleControls();
  bindModals();
  connectConfigWebSocket();
  broadcastTelemetry();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

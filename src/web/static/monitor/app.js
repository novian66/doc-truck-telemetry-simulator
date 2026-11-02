/**
 * Monitor Main Application Entrypoint (ES Module)
 * Mengorkestrasi peta geospasial Leaflet, streaming grafik Chart.js,
 * pemilihan pengiriman, listener WebSocket FastAPI, BroadcastChannel & REST Fallback
 */

import {
  STORAGE_KEYS,
  BROADCAST_CHANNEL_NAME
} from "../shared/constants.js";
import {
  selectedTripId,
  expeditions,
  lastExternalPacketTime,
  loadMonitorData,
  syncMonitorFromBackend,
  setLastExternalPacketTime,
  setWsConnected
} from "./modules/state.js";
import { initMap } from "./modules/map.js";
import { initChart, switchChartTab } from "./modules/chart.js";
import {
  populateExpeditionSelector,
  onExpeditionSelected,
  initFleetDrawerEvents
} from "./modules/trip-selector.js";
import {
  consumePacket,
  updateWatchdogUI,
  renderStandbyState
} from "./modules/consumer.js";

const broadcast =
  typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel(BROADCAST_CHANNEL_NAME)
    : null;

let wsClient = null;
let reconnectTimer = null;
let restPollingInterval = null;

/**
 * Tarik paket telemetri 25-field terbaru langsung dari backend FastAPI
 */
export async function fetchLatestFromBackend(tripId = selectedTripId) {
  try {
    if (!tripId) return;
    const q = tripId ? `?trip_id=${encodeURIComponent(tripId)}` : "";
    const res = await fetch(`/api/v1/simulation/latest${q}`);
    if (res.ok) {
      const data = await res.json();
      setLastExternalPacketTime(Date.now());
      consumePacket(data);
    }
  } catch (err) {
    // Abaikan jika server sedang starting
  }
}

function startRestPollingFallback() {
  if (!restPollingInterval) {
    fetchLatestFromBackend();
    restPollingInterval = setInterval(fetchLatestFromBackend, 1500);
  }
}

/**
 * Buka koneksi streaming WebSocket ke endpoint FastAPI: /ws/telemetry
 */
export function connectFastAPIWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;

  try {
    if (wsClient) {
      try { wsClient.close(); } catch (e) {}
    }

    wsClient = new WebSocket(wsUrl);

    wsClient.onopen = () => {
      console.log("🟢 [Monitor] Terhubung ke FastAPI WebSocket Telemetry Stream:", wsUrl);
      setWsConnected(true);
      updateWatchdogUI();
      if (restPollingInterval) {
        clearInterval(restPollingInterval);
        restPollingInterval = null;
      }
    };

    wsClient.onmessage = event => {
      try {
        const payload = JSON.parse(event.data);
        setLastExternalPacketTime(Date.now());
        const trip = payload?.identity?.trip_id || payload?.expedition?.tripId;
        if (!selectedTripId || trip === selectedTripId) {
          consumePacket(payload);
        }
      } catch (err) {
        console.warn("Gagal parse paket WebSocket:", err);
      }
    };

    wsClient.onerror = err => {
      console.warn("WebSocket stream error, beralih ke REST polling:", err);
      setWsConnected(false);
      updateWatchdogUI();
      startRestPollingFallback();
    };

    wsClient.onclose = () => {
      console.warn("WebSocket closed, rekoneksi dalam 3 detik...");
      setWsConnected(false);
      updateWatchdogUI();
      startRestPollingFallback();
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectFastAPIWebSocket, 3000);
    };
  } catch (err) {
    console.warn("Gagal inisialisasi WebSocket:", err);
    setWsConnected(false);
    updateWatchdogUI();
    startRestPollingFallback();
  }
}

/**
 * Inisialisasi Aplikasi Konsumen Telemetri
 */
export async function initConsumer() {
  initMap();
  initChart();
  loadMonitorData();

  // Sinkronkan daftar pengiriman dari database backend FastAPI
  await syncMonitorFromBackend();

  // Inisialisasi event interaktif Collapsible Fleet Drawer (Concept C)
  initFleetDrawerEvents();

  // Populate pengiriman dropdown & drawer cards
  populateExpeditionSelector();

  // Listener event pemilihan ekspedisi kustom dari kartu drawer
  window.addEventListener("trip:selected", async e => {
    if (e.detail?.tripId) {
      await fetchLatestFromBackend(e.detail.tripId);
    }
  });

  // Listener navigasi riwayat peramban (Browser Back/Forward button)
  window.addEventListener("popstate", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tripFromUrl = urlParams.get("trip") || urlParams.get("trip_id");
    if (tripFromUrl && tripFromUrl !== selectedTripId) {
      onExpeditionSelected(tripFromUrl);
      await fetchLatestFromBackend(tripFromUrl);
    }
  });

  // Tampilkan data pengiriman terpilih jika ada
  if (selectedTripId) {
    onExpeditionSelected(selectedTripId);
    await fetchLatestFromBackend(selectedTripId);
  }

  // Hubungkan ke stream WebSocket FastAPI (1.0 Hz duplex streaming otoritatif)
  connectFastAPIWebSocket();

  // Sinkronisasi data ekspedisi jika ada perubahan di tab lain (misal dibuat dari halaman /config/)
  window.addEventListener("storage", e => {
    if (e.key === STORAGE_KEYS.EXPEDITIONS) {
      loadMonitorData();
      populateExpeditionSelector();
    }
  });

  // Chart Tab Toggles
  document.querySelectorAll(".chart-tab").forEach(tab => {
    tab.addEventListener("click", e => {
      document.querySelectorAll(".chart-tab").forEach(t => t.classList.remove("active"));
      e.target.classList.add("active");
      switchChartTab(e.target.getAttribute("data-chart"));
    });
  });

  // Trip Selector Change Event
  const selector = document.getElementById("expeditionSelector");
  if (selector) {
    selector.addEventListener("change", async e => {
      onExpeditionSelected(e.target.value);
      await fetchLatestFromBackend(e.target.value);
    });
  }

  // Watchdog Heartbeat UI Timer (1 Hz) untuk deteksi realtime status streaming
  setInterval(updateWatchdogUI, 1000);
  updateWatchdogUI();

  // Watchdog & Polling Fallback: Menjaga ketersediaan telemetri secara berkelanjutan
  setInterval(() => {
    const exp = expeditions.find(e => e.tripId === selectedTripId);
    const isRunning = exp?.status === "RUNNING";
    const timeSinceLastPacket = Date.now() - lastExternalPacketTime;
    if (isRunning && timeSinceLastPacket > 2500) {
      fetchLatestFromBackend(selectedTripId);
    }
  }, 2000);

  // Sinkronisasi status trip backend secara berkala (tiap 10 detik)
  setInterval(async () => {
    await syncMonitorFromBackend();
    populateExpeditionSelector();
  }, 10000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initConsumer);
} else {
  initConsumer();
}

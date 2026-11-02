/**
 * Fleet Overview Map Module (ES Module)
 * Menampilkan peta geospasial sebaran seluruh armada truk operasional,
 * koordinat GPS terkini, kecepatan real-time, dan status pergerakan live.
 */

import { vehicles } from "./state.js";

let fleetMap = null;
let fleetMarkersLayer = null;
const truckMarkersMap = {};

/**
 * Membuat custom HTML divIcon Leaflet untuk marker armada truk menggunakan icon top-view kuning
 */
function createTruckMarkerIcon(truck) {
  const isMoving = truck.isMoving || (parseFloat(truck.lastSpeedKmh) > 0);
  const isOnTrip = truck.status === "ON_TRIP";

  let glowColor = "#64748b"; // Standby / Abu-abu
  let badgeBg = "#334155";
  let statusIcon = "🅿️";

  if (isMoving) {
    glowColor = "#10b981"; // Bergerak / Hijau
    badgeBg = "#059669";
    statusIcon = "🚚";
  } else if (isOnTrip) {
    glowColor = "#f59e0b"; // Berhenti Sementara di Rute / Kuning
    badgeBg = "#d97706";
    statusIcon = "⏸️";
  }

  const speedText = isMoving ? `${Math.round(truck.lastSpeedKmh)} km/j` : (isOnTrip ? "0 km/j" : "Standby");
  const heading = truck.headingDeg != null ? Math.round(((truck.headingDeg % 360) + 360) % 360) : 0;

  const html = `
    <div class="fleet-marker-container" style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
      <div style="background: ${badgeBg}; color: #ffffff; padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: 700; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.25); margin-bottom: 3px; letter-spacing: 0.3px; pointer-events: none;">
        ${statusIcon} ${truck.truckId} (${speedText})
      </div>
      <div class="fleet-truck-topview-wrapper" style="position: relative; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;">
        <span class="fleet-truck-halo" style="position: absolute; width: 40px; height: 40px; border-radius: 50%; background: radial-gradient(circle, ${glowColor}55 0%, transparent 70%); border: 1.5px solid ${glowColor}; ${isMoving ? 'animation: truckPulse 2s infinite;' : ''} pointer-events: none;"></span>
        <img src="/assets/truck_yellow_topview.png" alt="${truck.truckId}" class="fleet-truck-icon-img" style="width: 46px; height: 46px; object-fit: contain; transform: rotate(${heading}deg); transform-origin: center center; transition: transform 0.3s ease; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.7)); pointer-events: none;" />
      </div>
    </div>
  `;

  return window.L.divIcon({
    className: "fleet-truck-custom-icon",
    html: html,
    iconSize: [60, 70],
    iconAnchor: [30, 48],
    popupAnchor: [0, -48]
  });
}

/**
 * Membuat konten popup HTML informatif untuk setiap armada truk
 */
function createTruckPopupHtml(truck) {
  const isMoving = truck.isMoving || (parseFloat(truck.lastSpeedKmh) > 0);
  const isOnTrip = truck.status === "ON_TRIP";
  const speed = typeof truck.lastSpeedKmh === "number" ? truck.lastSpeedKmh.toFixed(1) : (truck.lastSpeedKmh || "0.0");
  const lat = typeof truck.lastLatitude === "number" ? truck.lastLatitude.toFixed(4) : (truck.lastLatitude || "-6.5650");
  const lng = typeof truck.lastLongitude === "number" ? truck.lastLongitude.toFixed(4) : (truck.lastLongitude || "107.7600");
  const heading = truck.headingDeg != null ? Math.round(((truck.headingDeg % 360) + 360) % 360) : 0;

  let statusBadge = `<span style="background: #334155; color: #cbd5e1; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">AVAILABLE (POOL)</span>`;
  if (isMoving) {
    statusBadge = `<span style="background: #065f46; color: #6ee7b7; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">ON_TRIP (BERGERAK ${speed} km/j)</span>`;
  } else if (isOnTrip) {
    statusBadge = `<span style="background: #78350f; color: #fde68a; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">ON_TRIP (BERHENTI SEMENTARA)</span>`;
  }

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-width: 240px; color: #0f172a; line-height: 1.45;">
      <div style="border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <img src="/assets/truck_yellow_topview.png" alt="Truck" style="width: 22px; height: 22px; object-fit: contain; transform: rotate(${heading}deg);" />
          <strong style="font-size: 13.5px; color: #0284c7;">${truck.truckId}</strong>
        </div>
        <code style="font-size: 11px; font-weight: 700; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; border: 1px solid #cbd5e1;">${truck.licensePlate}</code>
      </div>
      <div style="margin-bottom: 6px;">
        ${statusBadge}
      </div>
      <div style="font-size: 11.5px; color: #475569; margin-bottom: 4px;">
        <strong>Model:</strong> ${truck.model || "Truk Blower Tropis Audy Joinaldy 2020"}
      </div>
      <div style="font-size: 11.5px; color: #475569; margin-bottom: 4px;">
        <strong>Lokasi:</strong> <span style="color: #0f172a; font-weight: 600;">${truck.lastLocationName || "Pangkalan Subang"}</span>
      </div>
      <div style="font-size: 11.5px; color: #475569; margin-bottom: 4px;">
        <strong>Koordinat:</strong> <code>${lat}, ${lng}</code> (Arah: ${heading}°)
      </div>
      <div style="font-size: 11.5px; color: #475569; margin-bottom: 4px;">
        <strong>Kapasitas DOC:</strong> ${(truck.capacity || 36000).toLocaleString("id-ID")} ekor
      </div>
      ${truck.activeTripId ? `
        <div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed #cbd5e1; font-size: 11px; color: #2563eb; font-weight: 600;">
          📦 Sedang Menjalankan: <strong>${truck.activeTripId}</strong>
        </div>
      ` : ""}
    </div>
  `;
}

/**
 * Inisialisasi Peta Armada Truk
 */
export function initFleetMap() {
  if (fleetMap) return fleetMap;
  const container = document.getElementById("fleetOverviewMap");
  if (!container || !window.L) return null;

  fleetMap = window.L.map("fleetOverviewMap", {
    center: [-7.0, 110.0], // Pusat Pulau Jawa
    zoom: 7,
    minZoom: 5,
    maxZoom: 18,
    zoomSnap: 0.5,
    zoomDelta: 0.5
  });

  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
    maxZoom: 18
  }).addTo(fleetMap);

  fleetMarkersLayer = window.L.layerGroup().addTo(fleetMap);

  // Binding tombol Pusatkan Peta
  const btnFit = document.getElementById("btnFitFleetMap");
  if (btnFit) {
    btnFit.addEventListener("click", () => {
      fitFleetMapBounds();
    });
  }

  renderFleetMap();
  return fleetMap;
}

/**
 * Render ulang marker seluruh armada truk pada peta
 */
export function renderFleetMap() {
  if (!fleetMap || !fleetMarkersLayer || !window.L) return;

  const validLatLngs = [];

  vehicles.forEach(v => {
    const lat = typeof v.lastLatitude === "number" ? v.lastLatitude : parseFloat(v.lastLatitude || -6.5650);
    const lng = typeof v.lastLongitude === "number" ? v.lastLongitude : parseFloat(v.lastLongitude || 107.7600);

    if (isNaN(lat) || isNaN(lng)) return;

    validLatLngs.push([lat, lng]);

    if (truckMarkersMap[v.truckId]) {
      // Update posisi dan icon marker yang sudah ada
      const marker = truckMarkersMap[v.truckId];
      marker.setLatLng([lat, lng]);
      marker.setIcon(createTruckMarkerIcon(v));
      marker.setPopupContent(createTruckPopupHtml(v));
    } else {
      // Buat marker baru
      const marker = window.L.marker([lat, lng], {
        icon: createTruckMarkerIcon(v)
      });
      marker.bindPopup(createTruckPopupHtml(v));
      fleetMarkersLayer.addLayer(marker);
      truckMarkersMap[v.truckId] = marker;
    }
  });

  // Hapus marker truk yang sudah tidak ada di sistem
  Object.keys(truckMarkersMap).forEach(tid => {
    if (!vehicles.some(v => v.truckId === tid)) {
      fleetMarkersLayer.removeLayer(truckMarkersMap[tid]);
      delete truckMarkersMap[tid];
    }
  });

  // Pastikan Leaflet mengkalkulasi ukuran container jika tab baru dibuka
  setTimeout(() => {
    if (fleetMap) {
      fleetMap.invalidateSize();
    }
  }, 100);
}

/**
 * Menyesuaikan batas pandang peta (fitBounds) mencakup seluruh armada truk aktif
 */
export function fitFleetMapBounds() {
  if (!fleetMap || !window.L) return;
  fleetMap.invalidateSize();

  const validPoints = [];
  vehicles.forEach(v => {
    const lat = typeof v.lastLatitude === "number" ? v.lastLatitude : parseFloat(v.lastLatitude);
    const lng = typeof v.lastLongitude === "number" ? v.lastLongitude : parseFloat(v.lastLongitude);
    if (!isNaN(lat) && !isNaN(lng)) {
      validPoints.push([lat, lng]);
    }
  });

  if (validPoints.length === 1) {
    fleetMap.setView(validPoints[0], 12);
  } else if (validPoints.length > 1) {
    const bounds = window.L.latLngBounds(validPoints);
    fleetMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
  } else {
    fleetMap.setView([-7.0, 110.0], 7);
  }
}

/**
 * Memusatkan peta dan membuka popup informasi truk tertentu
 */
export function focusTruckOnMap(truckId) {
  if (!fleetMap || !truckMarkersMap[truckId]) return;

  const marker = truckMarkersMap[truckId];
  const latLng = marker.getLatLng();

  // Scroll halus ke kartu peta armada
  const mapCard = document.querySelector(".fleet-map-card");
  if (mapCard) {
    mapCard.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  fleetMap.invalidateSize();
  fleetMap.setView(latLng, 14, { animate: true, duration: 0.8 });
  setTimeout(() => {
    marker.openPopup();
  }, 500);
}

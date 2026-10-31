/**
 * Monitor Leaflet Geospatial Map Controller (ES Module)
 * Mengelola peta Leaflet, segmen jalan polylines, breadcrumb trail, dan custom rotated truck SVG marker
 */

import {
  WAYPOINTS_RAW,
  ROAD_COLORS,
  ROAD_PARAMS,
  getRouteConfig,
  getWaypointsForRoute
} from "../../shared/constants.js";
import { trailCoords } from "./state.js";

let map = null;
let truckMarker = null;
let trailPolyline = null;
let segmentPolylines = [];
let osrmPolyline = null;
let startMarker = null;
let finishMarker = null;

/**
 * Inisialisasi peta Leaflet dan layer dasar
 */
export function initMap(initialLat = -6.48, initialLng = 107.25, initialZoom = 10) {
  if (typeof window.L === "undefined") {
    console.warn("Leaflet (L) belum dimuat.");
    return;
  }

  map = window.L.map("map", {
    center: [initialLat, initialLng],
    zoom: initialZoom,
    zoomSnap: 0.25,
    zoomDelta: 0.25,
    wheelPxPerZoomLevel: 120
  });

  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
    maxZoom: 18
  }).addTo(map);

  // Titik A: Start Hatchery
  const startIcon = window.L.divIcon({
    className: "custom-point-marker",
    html: "📍",
    iconSize: [24, 24]
  });
  startMarker = window.L.marker([WAYPOINTS_RAW[0].lat, WAYPOINTS_RAW[0].lng], { icon: startIcon })
    .addTo(map)
    .bindPopup("<b>Titik A: Subang Hatchery</b><br>Asal Pengiriman Bibit DOC");

  // Titik B: Finish Broiler Farm
  const lastPt = WAYPOINTS_RAW[WAYPOINTS_RAW.length - 1];
  const finishIcon = window.L.divIcon({
    className: "custom-point-marker",
    html: "🏁",
    iconSize: [24, 24]
  });
  finishMarker = window.L.marker([lastPt.lat, lastPt.lng], { icon: finishIcon })
    .addTo(map)
    .bindPopup("<b>Titik B: Bogor Broiler Farm</b><br>Tujuan Akhir Kargo");

  // Trail Geodesik
  trailPolyline = window.L.polyline([], {
    color: "#38bdf8",
    weight: 4,
    opacity: 0.8
  }).addTo(map);

  // Truk Marker PNG Berotasi Dinamis (View Atas / Top-View, Default Kepala Menghadap ke ATAS / 0°)
  const truckImgHtml = `
    <div id="truckSvgWrapper" class="truck-marker-wrapper" style="transform-origin: center center; transition: transform 0.3s ease; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.5));">
      <img src="/assets/truck_yellow_topview.png?v=3" alt="Truk DOC" style="width: 48px; height: 48px; object-fit: contain; pointer-events: none;" />
    </div>
  `;

  const truckIcon = window.L.divIcon({
    className: "truck-marker-icon",
    html: truckImgHtml,
    iconSize: [48, 48],
    iconAnchor: [24, 24]
  });

  truckMarker = window.L.marker([WAYPOINTS_RAW[0].lat, WAYPOINTS_RAW[0].lng], {
    icon: truckIcon
  }).addTo(map);

  truckMarker.bindPopup("<b>🚚 Truk Pengiriman DOC Aktif</b><br>Memancarkan telemetri 1 Hz...");
}

/**
 * Render visual rute presisi OSRM (1.000+ koordinat kurva jalan riil)
 */
export async function renderRealOsrmRoute(routeId, routeType = "TOLL") {
  if (!map) return false;

  if (osrmPolyline) {
    map.removeLayer(osrmPolyline);
    osrmPolyline = null;
  }

  if (routeId) {
    try {
      const res = await fetch(`/api/v1/routes/${encodeURIComponent(routeId)}`);
      if (res.ok) {
        const data = await res.json();
        const coords = data?.route?.waypoints_geojson?.geometry?.coordinates;
        if (coords && Array.isArray(coords) && coords.length > 0) {
          // Bersihkan segmen lama agar tidak menumpuk
          segmentPolylines.forEach(l => map.removeLayer(l));
          segmentPolylines = [];

          // GeoJSON OSRM: [lng, lat] -> Leaflet: [lat, lng]
          const latlngs = coords.map(c => [c[1], c[0]]);
          osrmPolyline = window.L.polyline(latlngs, {
            color: "#2563eb", // Biru navigasi presisi tinggi
            weight: 5,
            opacity: 0.9
          }).addTo(map);

          osrmPolyline.bindTooltip(
            `<b>Rute Presisi OSRM:</b> ${data.route.origin_name} &rarr; ${data.route.destination_name} (${data.route.total_distance_km} km, ${data.route.waypoints_count} waypoints)`,
            { sticky: true }
          );

          if (startMarker && latlngs.length > 0) {
            startMarker.setLatLng(latlngs[0]).bindPopup(`<b>Titik Asal:</b> ${data.route.origin_name}`);
          }
          if (finishMarker && latlngs.length > 0) {
            finishMarker.setLatLng(latlngs[latlngs.length - 1]).bindPopup(`<b>Tujuan Akhir:</b> ${data.route.destination_name}`);
          }

          try {
            map.fitBounds(osrmPolyline.getBounds(), { padding: [40, 40], maxZoom: 13 });
          } catch (err) {}

          return true;
        }
      }
    } catch (e) {
      console.warn("Gagal memuat rute OSRM dari backend:", e);
    }
  }
  return false;
}

/**
 * Render visual 5 segmen jalan dengan warna sesuai kondisi dan profil rute
 */
export function renderSegmentPolylines(segments, routeType = "TOLL") {
  if (!map) return;

  const waypoints = getWaypointsForRoute(routeType);
  const routeCfg = getRouteConfig(routeType);

  segmentPolylines.forEach(l => map.removeLayer(l));
  segmentPolylines = [];

  [0, 1, 2, 3, 4].forEach(segIdx => {
    const pts = waypoints.filter(w => w.seg === segIdx);
    if (pts.length >= 2) {
      const latlngs = pts.map(p => [p.lat, p.lng]);
      const condition = (segments && segments[segIdx]) ? segments[segIdx] : "FREE_FLOW";
      const color = ROAD_COLORS[condition] || "#10b981";

      const poly = window.L.polyline(latlngs, {
        color: color,
        weight: 6,
        opacity: 0.85
      }).addTo(map);

      const segDef = (routeCfg.segments && routeCfg.segments[segIdx]) ? routeCfg.segments[segIdx] : null;
      const segName = segDef ? segDef.name : `Segmen ${segIdx + 1}`;
      const label = ROAD_PARAMS[condition] ? ROAD_PARAMS[condition].label : condition;
      poly.bindTooltip(`Segmen ${segIdx + 1}: ${segName} (${label})`, { sticky: true });
      segmentPolylines.push(poly);
    }
  });
}

/**
 * Reset jejak perjalanan (trail)
 */
export function clearTrail() {
  if (trailPolyline) {
    trailCoords.length = 0;
    trailPolyline.setLatLngs([]);
  }
}

/**
 * Menghitung transformasi CSS rotasi sesuai arah navigasi (bearing / heading):
 * - Default gambar: View Atas (Top-down view), kepala truk menghadap ke ATAS (Utara / 0°).
 * - Rotasi langsung mengikuti sudut heading 0° - 360° (0° = Utara/Atas, 90° = Timur/Kanan, 180° = Selatan/Bawah, 270° = Barat/Kiri).
 */
export function getTruckTransform(headingDeg) {
  if (headingDeg == null) return "rotate(270deg)"; // default rute Subang -> Bogor mengarah ke Barat (270°)

  const h = ((headingDeg % 360) + 360) % 360;
  return `rotate(${Math.round(h)}deg)`;
}

/**
 * Update posisi marker truk, rotasi bearing, dan jejak perjalanan (trail)
 */
export function updateTruckPosition(lat, lng, bearingDeg, engineRunning = true, panToMarker = false) {
  if (!truckMarker) return;

  truckMarker.setLatLng([lat, lng]);

  const wrapper = document.getElementById("truckSvgWrapper");
  if (wrapper && bearingDeg != null) {
    wrapper.style.transform = getTruckTransform(bearingDeg);
  }

  if (engineRunning && trailPolyline) {
    trailCoords.push([lat, lng]);
    if (trailCoords.length > 80) trailCoords.shift();
    trailPolyline.setLatLngs(trailCoords);
  }

  // Jika posisi truk berada di luar batas pandang peta saat ini, geser peta perlahan
  if (map && typeof map.getBounds === "function") {
    try {
      if ((engineRunning || panToMarker) && !map.getBounds().contains([lat, lng])) {
        map.panTo([lat, lng], { animate: true, duration: 1.0 });
      }
    } catch (e) {}
  }
}

/**
 * Atur truk ke posisi tujuan akhir (misal untuk status COMPLETED)
 */
export function setTruckMarkerToEnd(routeType = "TOLL") {
  if (osrmPolyline) {
    const latlngs = osrmPolyline.getLatLngs();
    if (latlngs && latlngs.length > 0) {
      const lastPt = latlngs[latlngs.length - 1];
      if (truckMarker && lastPt) {
        truckMarker.setLatLng(lastPt);
        return;
      }
    }
  }
  const waypoints = getWaypointsForRoute(routeType);
  const lastPt = waypoints[waypoints.length - 1];
  if (truckMarker && lastPt) {
    truckMarker.setLatLng([lastPt.lat, lastPt.lng]);
    const wrapper = document.getElementById("truckSvgWrapper");
    if (wrapper) {
      // Menghadap ke barat saat tiba di Bogor: Kepala di KIRI (270°)
      wrapper.style.transform = "rotate(270deg)";
    }
  }
}

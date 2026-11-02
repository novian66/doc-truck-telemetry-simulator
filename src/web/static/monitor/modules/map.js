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
let signalPolylines = [];
let osrmPolyline = null;
let startMarker = null;
let finishMarker = null;

let baseLayers = {};
let overlayLayers = {};
let currentLayerType = "street";
let layersControl = null;

/**
 * Mengganti layer dasar peta (street, satellite, hybrid)
 */
export function setMapLayer(type = "street") {
  if (!map || !baseLayers.street || !baseLayers.satellite) return;
  currentLayerType = type;

  // Hapus tile layer yang ada
  if (map.hasLayer(baseLayers.street)) map.removeLayer(baseLayers.street);
  if (map.hasLayer(baseLayers.satellite)) map.removeLayer(baseLayers.satellite);
  if (overlayLayers.labels && map.hasLayer(overlayLayers.labels)) map.removeLayer(overlayLayers.labels);

  if (type === "satellite") {
    map.addLayer(baseLayers.satellite);
  } else if (type === "hybrid") {
    map.addLayer(baseLayers.satellite);
    if (overlayLayers.labels) map.addLayer(overlayLayers.labels);
  } else {
    map.addLayer(baseLayers.street);
  }

  // Sinkronkan status tombol UI
  const btnStreet = document.getElementById("btnLayerStreet");
  const btnSat = document.getElementById("btnLayerSatellite");
  const btnHyb = document.getElementById("btnLayerHybrid");

  if (btnStreet) btnStreet.classList.toggle("active", type === "street");
  if (btnSat) btnSat.classList.toggle("active", type === "satellite");
  if (btnHyb) btnHyb.classList.toggle("active", type === "hybrid");

  try {
    localStorage.setItem("monitor_map_layer", type);
  } catch (e) {}
}

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

  // Layer 1: OpenStreetMap Standard (Street)
  const streetLayer = window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
    maxZoom: 19
  });

  // Layer 2: Esri World Imagery (Satellite)
  const satelliteLayer = window.L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 19
  });

  // Layer 3: Esri World Boundaries & Places Overlay (Hybrid Labels)
  const labelsLayer = window.L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
    attribution: 'Labels &copy; Esri',
    maxZoom: 19,
    pane: "overlayPane"
  });

  baseLayers = {
    street: streetLayer,
    satellite: satelliteLayer
  };
  overlayLayers = {
    labels: labelsLayer
  };

  // Muat layer tersimpan atau default street
  const savedLayer = (typeof localStorage !== "undefined" && localStorage.getItem("monitor_map_layer")) || "street";
  setMapLayer(savedLayer);

  // Hook up event switcher tombol kustom
  const btnStreet = document.getElementById("btnLayerStreet");
  const btnSat = document.getElementById("btnLayerSatellite");
  const btnHyb = document.getElementById("btnLayerHybrid");

  if (btnStreet) btnStreet.addEventListener("click", () => setMapLayer("street"));
  if (btnSat) btnSat.addEventListener("click", () => setMapLayer("satellite"));
  if (btnHyb) btnHyb.addEventListener("click", () => setMapLayer("hybrid"));

  // Leaflet Layer Control bawaan (topright)
  const baseMaps = {
    "🗺️ Street Map": streetLayer,
    "🛰️ Satellite Imagery": satelliteLayer
  };
  const overlays = {
    "🏷️ Roads & Places Labels": labelsLayer
  };
  layersControl = window.L.control.layers(baseMaps, overlays, { position: "topright" }).addTo(map);

  map.on("baselayerchange", e => {
    if (e.layer === satelliteLayer) {
      const isHybrid = overlayLayers.labels && map.hasLayer(overlayLayers.labels);
      setMapLayer(isHybrid ? "hybrid" : "satellite");
    } else {
      setMapLayer("street");
    }
  });

  map.on("overlayadd", e => {
    if (e.layer === labelsLayer && currentLayerType === "satellite") {
      setMapLayer("hybrid");
    }
  });

  map.on("overlayremove", e => {
    if (e.layer === labelsLayer && currentLayerType === "hybrid") {
      setMapLayer("satellite");
    }
  });

  // Point A: Start Hatchery
  const startIcon = window.L.divIcon({
    className: "custom-point-marker",
    html: "📍",
    iconSize: [24, 24]
  });
  startMarker = window.L.marker([WAYPOINTS_RAW[0].lat, WAYPOINTS_RAW[0].lng], { icon: startIcon })
    .addTo(map)
    .bindPopup("<b>Point A: Origin Depot</b><br>DOC Cargo Origin Facility");

  // Point B: Finish Broiler Farm
  const lastPt = WAYPOINTS_RAW[WAYPOINTS_RAW.length - 1];
  const finishIcon = window.L.divIcon({
    className: "custom-point-marker",
    html: "🏁",
    iconSize: [24, 24]
  });
  finishMarker = window.L.marker([lastPt.lat, lastPt.lng], { icon: finishIcon })
    .addTo(map)
    .bindPopup("<b>Point B: Final Destination</b><br>Receiving Commercial Broiler Farm");

  // Geodesic Trail
  trailPolyline = window.L.polyline([], {
    color: "#38bdf8",
    weight: 4,
    opacity: 0.8
  }).addTo(map);

  // Dynamic Rotated Truck Marker (Top-View PNG, Default Heading North / 0°)
  const truckImgHtml = `
    <div id="truckSvgWrapper" class="truck-marker-wrapper" style="transform-origin: center center; transition: transform 0.3s ease; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.5));">
      <img src="/assets/truck_yellow_topview.png?v=3" alt="DOC Truck" style="width: 48px; height: 48px; object-fit: contain; pointer-events: none;" />
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

  truckMarker.bindPopup("<b>🚚 Active DOC Delivery Truck</b><br>Streaming 1.0 Hz telemetry...");
}

let cachedLatLngs = null;
let cachedCumDist = null;
let cachedTotalKm = 145.0;
let cachedActiveSegments = null;
let cachedHazardZones = null;
let cachedSignalConditions = null;
let cachedSignalHazardZones = null;

function haversineDist(lat1, lon1, lat2, lon2) {
  const R = 6371.0;
  const dLat = ((lat2 - lat1) * Math.PI) / 180.0;
  const dLon = ((lon2 - lon1) * Math.PI) / 180.0;
  const a =
    Math.sin(dLat / 2.0) * Math.sin(dLat / 2.0) +
    Math.cos((lat1 * Math.PI) / 180.0) * Math.cos((lat2 * Math.PI) / 180.0) * Math.sin(dLon / 2.0) * Math.sin(dLon / 2.0);
  const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
  return R * c;
}

/**
 * Menggambar segmen polyline jalan dengan presisi zona hambatan (bottleneck span)
 * Serta tanda visual zona gangguan sinyal seluler (blank spot / fading) di sepanjang rute
 */
function drawRoutePolylines(latlngs, cumDist, totalRoadKm, activeSegments, hazardZones, signalConditions = null, signalHazardZones = null) {
  segmentPolylines.forEach(l => map.removeLayer(l));
  segmentPolylines = [];

  signalPolylines.forEach(l => map.removeLayer(l));
  signalPolylines = [];

  const segStep = totalRoadKm / 5.0;

  // Kelompokkan koordinat dan jarak kumulatif ke 5 segmen
  const segCoords = [[], [], [], [], []];
  const segDists = [[], [], [], [], []];

  for (let i = 0; i < latlngs.length; i++) {
    const frac = cumDist[i] / (totalRoadKm > 0 ? totalRoadKm : 1.0);
    const sIdx = Math.min(Math.floor(frac * 5.0), 4);
    segCoords[sIdx].push(latlngs[i]);
    segDists[sIdx].push(cumDist[i]);
  }

  // Hubungkan titik batas antar segmen agar tidak ada celah visual
  for (let s = 1; s < 5; s++) {
    if (segCoords[s - 1].length > 0 && segCoords[s].length > 0) {
      const lastPt = segCoords[s - 1][segCoords[s - 1].length - 1];
      const lastD = segDists[s - 1][segDists[s - 1].length - 1];
      if (segCoords[s][0] !== lastPt) {
        segCoords[s].unshift(lastPt);
        segDists[s].unshift(lastD);
      }
    }
  }

  [0, 1, 2, 3, 4].forEach(s => {
    if (segCoords[s].length < 2) return;

    const condition = activeSegments && activeSegments[s] ? activeSegments[s] : "FREE_FLOW";
    const zone = hazardZones ? hazardZones[s] || hazardZones[s.toString()] : null;
    const isBottleneck = zone && !zone.is_full && condition !== "FREE_FLOW";

    if (!isBottleneck) {
      // Kasus A: Segmen Normal / Free Flow / Full Length Hazard
      const color = ROAD_COLORS[condition] || "#10b981";
      const startKm = Math.round(s * segStep);
      const endKm = Math.round((s + 1) * segStep);
      const label = ROAD_PARAMS[condition]?.label || condition;
      const targetSpd = ROAD_PARAMS[condition]?.targetSpeed || (condition === "FREE_FLOW" ? 75 : 24);

      const poly = window.L.polyline(segCoords[s], {
        color: color,
        weight: 6,
        opacity: 0.88,
        lineCap: "round",
        lineJoin: "round"
      }).addTo(map);

      poly.bindTooltip(
        `<div style="font-family:system-ui,-apple-system,sans-serif; font-size:12px; line-height:1.4;">
          <strong style="color:#38bdf8;">Segmen ${s + 1} (KM ${startKm}–${endKm}):</strong><br/>
          <div style="display:flex; align-items:center; gap:6px; margin-top:3px;">
            <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${color};"></span>
            <strong>${label}</strong>
          </div>
          <small style="color:#94a3b8;">Target Speed: ${targetSpd} km/h</small>
        </div>`,
        { sticky: true }
      );

      segmentPolylines.push(poly);
    } else {
      // Kasus B: Segmen memiliki zona bottleneck terisolasi (misal 25 km di tengah segmen)
      const zStart = zone.start_km;
      const zEnd = zone.end_km;
      const spanKm = zone.span_km || Math.round(zEnd - zStart);

      const preCoords = [];
      const botCoords = [];
      const postCoords = [];

      for (let j = 0; j < segCoords[s].length; j++) {
        const pt = segCoords[s][j];
        const d = segDists[s][j];

        if (d < zStart) {
          preCoords.push(pt);
        } else if (d >= zStart && d <= zEnd) {
          if (botCoords.length === 0 && preCoords.length > 0) {
            botCoords.push(preCoords[preCoords.length - 1]); // Sambung batas
          }
          botCoords.push(pt);
        } else {
          if (postCoords.length === 0 && botCoords.length > 0) {
            postCoords.push(botCoords[botCoords.length - 1]); // Sambung batas
          } else if (postCoords.length === 0 && preCoords.length > 0) {
            postCoords.push(preCoords[preCoords.length - 1]);
          }
          postCoords.push(pt);
        }
      }

      // 1. Gambar Bagian Sebelum Bottleneck (Free Flow)
      if (preCoords.length >= 2) {
        const polyPre = window.L.polyline(preCoords, {
          color: ROAD_COLORS.FREE_FLOW,
          weight: 6,
          opacity: 0.88,
          lineCap: "round",
          lineJoin: "round"
        }).addTo(map);
        polyPre.bindTooltip(
          `<div style="font-family:system-ui,-apple-system,sans-serif; font-size:12px; line-height:1.4;">
            <strong style="color:#38bdf8;">Segmen ${s + 1} (Arus Lancar):</strong><br/>
            <span style="color:#10b981;">● FREE FLOW (75 km/h)</span>
          </div>`,
          { sticky: true }
        );
        segmentPolylines.push(polyPre);
      }

      // 2. Gambar Zona Bottleneck (Congested / Hazard)
      if (botCoords.length >= 2) {
        const colorBot = ROAD_COLORS[condition] || "#f59e0b";
        const label = ROAD_PARAMS[condition]?.label || condition;
        const targetSpd = ROAD_PARAMS[condition]?.targetSpeed || 24;

        const polyBot = window.L.polyline(botCoords, {
          color: colorBot,
          weight: 7,
          opacity: 0.95,
          lineCap: "round",
          lineJoin: "round"
        }).addTo(map);

        polyBot.bindTooltip(
          `<div style="font-family:system-ui,-apple-system,sans-serif; font-size:12px; line-height:1.4;">
            <strong style="color:#f59e0b;">⚠️ Segmen ${s + 1} Bottleneck (KM ${Math.round(zStart)}–${Math.round(zEnd)}, ${spanKm} km):</strong><br/>
            <div style="display:flex; align-items:center; gap:6px; margin-top:3px;">
              <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${colorBot};"></span>
              <strong>${label}</strong>
            </div>
            <small style="color:#fcd34d;">Target Speed: ${targetSpd} km/h (Bottleneck Span: ${spanKm} km)</small>
          </div>`,
          { sticky: true }
        );
        segmentPolylines.push(polyBot);
      }

      // 3. Gambar Bagian Sesudah Bottleneck (Kembali Free Flow)
      if (postCoords.length >= 2) {
        const polyPost = window.L.polyline(postCoords, {
          color: ROAD_COLORS.FREE_FLOW,
          weight: 6,
          opacity: 0.88,
          lineCap: "round",
          lineJoin: "round"
        }).addTo(map);
        polyPost.bindTooltip(
          `<div style="font-family:system-ui,-apple-system,sans-serif; font-size:12px; line-height:1.4;">
            <strong style="color:#38bdf8;">Segmen ${s + 1} (Kembali Lancar):</strong><br/>
            <span style="color:#10b981;">● FREE FLOW (75 km/h)</span>
          </div>`,
          { sticky: true }
        );
        segmentPolylines.push(polyPost);
      }
    }
  });

  // Gambar Tanda Visual Gangguan Sinyal Seluler (Blank Spot & Fading)
  if (signalConditions) {
    [0, 1, 2, 3, 4].forEach(s => {
      const sigCond = signalConditions[s] || signalConditions[s.toString()] || "GOOD";
      if (sigCond === "GOOD") return;

      const sigZone = signalHazardZones ? signalHazardZones[s] || signalHazardZones[s.toString()] : null;
      const segStart = s * segStep;
      const segEnd = (s + 1) * segStep;

      let zStart = segStart;
      let zEnd = segEnd;
      if (sigZone && !sigZone.is_full) {
        zStart = sigZone.start_km;
        zEnd = sigZone.end_km;
      }
      const spanKm = Math.round(zEnd - zStart);

      const sigCoords = [];
      for (let j = 0; j < latlngs.length; j++) {
        const d = cumDist[j];
        if (d >= zStart && d <= zEnd) {
          sigCoords.push(latlngs[j]);
        }
      }

      if (sigCoords.length >= 2) {
        const isBlank = (sigCond === "BAD");
        const haloColor = isBlank ? "#dc2626" : "#9333ea";
        const badgeBg = isBlank ? "#dc2626" : "#7e22ce";
        const badgeText = isBlank ? `📵 Blank Spot (${spanKm} km)` : `📶 Fading Sinyal (${spanKm} km)`;
        const titleText = isBlank
          ? `📵 ZONA BLANK SPOT (KM ${Math.round(zStart)}–${Math.round(zEnd)})`
          : `📶 ZONA SINYAL LEMAH (KM ${Math.round(zStart)}–${Math.round(zEnd)})`;
        const subText = isBlank
          ? `Telemetri Masuk Buffer Offline (Koneksi Terputus)`
          : `Transmisi Sinyal Seluler Lemah / Fluktuatif`;

        // 1. Layer Glow Outer Aura (memberikan halo di atas garis rute)
        const polyHalo = window.L.polyline(sigCoords, {
          color: haloColor,
          weight: 12,
          opacity: 0.45,
          lineCap: "round",
          lineJoin: "round"
        }).addTo(map);

        // 2. Layer Dashed Striping Line
        const polyDash = window.L.polyline(sigCoords, {
          color: "#ffffff",
          weight: 4,
          opacity: 0.95,
          dashArray: isBlank ? "6, 8" : "4, 6",
          lineCap: "round",
          lineJoin: "round"
        }).addTo(map);

        const tooltipHtml = `
          <div style="font-family:system-ui,-apple-system,sans-serif; font-size:12px; line-height:1.4;">
            <strong style="color:${haloColor};">${titleText}</strong><br/>
            <div style="display:flex; align-items:center; gap:6px; margin-top:2px;">
              <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${haloColor};"></span>
              <strong>${badgeText}</strong>
            </div>
            <small style="color:#94a3b8;">${subText}</small>
          </div>
        `;
        polyHalo.bindTooltip(tooltipHtml, { sticky: true });
        polyDash.bindTooltip(tooltipHtml, { sticky: true });

        signalPolylines.push(polyHalo);
        signalPolylines.push(polyDash);

        // 3. Pasang Badge Marker di titik tengah zona gangguan
        const midCoord = sigCoords[Math.floor(sigCoords.length / 2)];
        const badgeIcon = window.L.divIcon({
          className: "signal-badge-icon",
          html: `
            <div style="background:${badgeBg}; color:#ffffff; font-size:10px; font-weight:700; padding:2px 8px; border-radius:12px; border:1px solid rgba(255,255,255,0.7); box-shadow:0 2px 8px rgba(0,0,0,0.6); display:flex; align-items:center; gap:4px; transform:translate(-50%, -50%); white-space:nowrap; pointer-events:auto; cursor:pointer;">
              ${badgeText}
            </div>
          `,
          iconSize: [0, 0]
        });
        const marker = window.L.marker(midCoord, { icon: badgeIcon }).addTo(map);
        marker.bindTooltip(tooltipHtml);
        signalPolylines.push(marker);
      }
    });
  }
}

/**
 * Render visual OSRM precision route dengan 5 segmen berwarna sesuai kondisi jalan dan panjang span
 */
export async function renderRealOsrmRoute(routeId, routeType = "TOLL", customSegments = null, tripId = null) {
  if (!map) return false;

  if (osrmPolyline) {
    map.removeLayer(osrmPolyline);
    osrmPolyline = null;
  }

  // Clear previous segment polylines
  segmentPolylines.forEach(l => map.removeLayer(l));
  segmentPolylines = [];

  if (routeId) {
    try {
      let activeSegments = customSegments || ["FREE_FLOW", "FREE_FLOW", "CONGESTED", "FREE_FLOW", "FREE_FLOW"];
      let hazardZones = null;
      let signalConditions = null;
      let signalHazardZones = null;

      if (tripId) {
        try {
          const sRes = await fetch(`/api/v1/simulation/status?trip_id=${encodeURIComponent(tripId)}`);
          if (sRes.ok) {
            const sData = await sRes.json();
            if (sData) {
              if (sData.road_conditions) {
                activeSegments = [
                  sData.road_conditions["0"] || sData.road_conditions[0] || "FREE_FLOW",
                  sData.road_conditions["1"] || sData.road_conditions[1] || "FREE_FLOW",
                  sData.road_conditions["2"] || sData.road_conditions[2] || "CONGESTED",
                  sData.road_conditions["3"] || sData.road_conditions[3] || "FREE_FLOW",
                  sData.road_conditions["4"] || sData.road_conditions[4] || "FREE_FLOW"
                ];
              }
              if (sData.road_hazard_zones) {
                hazardZones = sData.road_hazard_zones;
              }
              if (sData.signal_conditions) {
                signalConditions = sData.signal_conditions;
              }
              if (sData.signal_hazard_zones) {
                signalHazardZones = sData.signal_hazard_zones;
              }
            }
          }
        } catch (e) {}
      }

      const res = await fetch(`/api/v1/routes/${encodeURIComponent(routeId)}`);
      if (res.ok) {
        const data = await res.json();
        const coords = data?.route?.waypoints_geojson?.geometry?.coordinates;
        if (coords && Array.isArray(coords) && coords.length > 0) {
          const latlngs = coords.map(c => [c[1], c[0]]);

          const cumDist = [0.0];
          let curD = 0.0;
          for (let i = 0; i < latlngs.length - 1; i++) {
            curD += haversineDist(latlngs[i][0], latlngs[i][1], latlngs[i + 1][0], latlngs[i + 1][1]);
            cumDist.push(curD);
          }
          const totalRoadKm = data?.route?.total_distance_km || (curD > 0 ? curD : 1.0);

          // Simpan ke cache modul untuk update warna cepat
          cachedLatLngs = latlngs;
          cachedCumDist = cumDist;
          cachedTotalKm = totalRoadKm;
          cachedActiveSegments = activeSegments;
          cachedHazardZones = hazardZones;
          cachedSignalConditions = signalConditions;
          cachedSignalHazardZones = signalHazardZones;

          drawRoutePolylines(latlngs, cumDist, totalRoadKm, activeSegments, hazardZones, signalConditions, signalHazardZones);

          if (startMarker && latlngs.length > 0) {
            startMarker.setLatLng(latlngs[0]).bindPopup(`<b>Origin:</b> ${data.route.origin_name}`);
          }
          if (finishMarker && latlngs.length > 0) {
            finishMarker.setLatLng(latlngs[latlngs.length - 1]).bindPopup(`<b>Final Destination:</b> ${data.route.destination_name}`);
          }

          if (segmentPolylines.length > 0) {
            try {
              const group = window.L.featureGroup(segmentPolylines);
              map.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 13 });
            } catch (err) {}
          }

          return true;
        }
      }
    } catch (e) {
      console.warn("Failed to load OSRM route from backend:", e);
    }
  }
  return false;
}

/**
 * Update warna segmen polyline dan tanda gangguan sinyal secara dinamis tanpa render ulang koordinat
 */
export function updateRouteSegmentColors(segments, hazardZones = null, signalConditions = null, signalHazardZones = null) {
  if (!map) return;
  if (segments) cachedActiveSegments = segments;
  if (hazardZones) cachedHazardZones = hazardZones;
  if (signalConditions) cachedSignalConditions = signalConditions;
  if (signalHazardZones) cachedSignalHazardZones = signalHazardZones;

  if (cachedLatLngs && cachedCumDist) {
    drawRoutePolylines(
      cachedLatLngs,
      cachedCumDist,
      cachedTotalKm,
      cachedActiveSegments,
      cachedHazardZones,
      cachedSignalConditions,
      cachedSignalHazardZones
    );
  }
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

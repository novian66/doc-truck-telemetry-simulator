/**
 * DOC Cold-Chain Truck Telematics Simulation - Mockup Prototype
 * Waterfall Phase 1: Requirements Analysis & Design Thinking Mockup
 * Pure Vanilla JavaScript + Leaflet.js + Chart.js
 */

// 1. Waypoint Anchors: Subang Central Hatchery -> Bogor Farm
const WAYPOINTS_RAW = [
  { lat: -6.5650, lng: 107.7600, name: "Subang Central Hatchery (Titik A)", seg: 0 },
  { lat: -6.5520, lng: 107.7200, name: "Jalan Raya Subang - Kalijati", seg: 0 },
  { lat: -6.5380, lng: 107.6750, name: "Kalijati", seg: 0 },
  { lat: -6.4950, lng: 107.5600, name: "Gerbang Tol Kalijati (Tol Cipali KM 98)", seg: 0 },
  { lat: -6.4680, lng: 107.5050, name: "Tol Cipali KM 89", seg: 1 },
  { lat: -6.4420, lng: 107.4500, name: "Tol Cipali KM 82", seg: 1 },
  { lat: -6.4180, lng: 107.4000, name: "Tol Cipali KM 74", seg: 1 },
  { lat: -6.4010, lng: 107.3800, name: "Simpang Susun Dawuan (KM 67)", seg: 1 },
  { lat: -6.3680, lng: 107.3100, name: "Tol Japek KM 57 (Rest Area Karawang)", seg: 2 },
  { lat: -6.3250, lng: 107.2100, name: "Tol Japek KM 48 (Karawang Barat)", seg: 2 },
  { lat: -6.3000, lng: 107.1200, name: "Tol Japek KM 37 (Cikarang Timur)", seg: 2 },
  { lat: -6.2650, lng: 107.0100, name: "Tol Japek KM 25 (Cibitung)", seg: 2 },
  { lat: -6.2550, lng: 106.9600, name: "Simpang Susun Cikunir (KM 10)", seg: 2 },
  { lat: -6.3100, lng: 106.8900, name: "Tol Jagorawi KM 7 (Pasar Rebo / TMII)", seg: 3 },
  { lat: -6.3720, lng: 106.8950, name: "Tol Jagorawi KM 14 (Cibubur)", seg: 3 },
  { lat: -6.4500, lng: 106.8850, name: "Tol Jagorawi KM 24 (Cimanggis)", seg: 3 },
  { lat: -6.4950, lng: 106.8650, name: "Tol Jagorawi KM 32 (Citeureup)", seg: 3 },
  { lat: -6.5350, lng: 106.8550, name: "Tol Jagorawi KM 37 (Sentul Selatan)", seg: 3 },
  { lat: -6.5820, lng: 106.8250, name: "Gerbang Tol Baranangsiang Bogor (KM 43)", seg: 4 },
  { lat: -6.5920, lng: 106.8120, name: "Jalan Pajajaran Bogor", seg: 4 },
  { lat: -6.5980, lng: 106.7990, name: "Bogor Broiler Partner Farm (Titik B)", seg: 4 }
];

// Color dictionary for road condition segments
const ROAD_COLORS = {
  FREE_FLOW: "#10b981",       // Green
  CONGESTED: "#f59e0b",       // Amber
  GRIDLOCK: "#dc2626",        // Red
  DAMAGED_ROAD: "#ea580c",    // Orange
  FLOODED: "#06b6d4",         // Cyan
  DISASTER_BLOCKED: "#7c3aed" // Purple
};

// Target speeds and baseline vibration per road condition
const ROAD_PARAMS = {
  FREE_FLOW: { targetSpeed: 75, baseVib: 0.08, label: "LANCAR (TOL)", class: "badge-flow" },
  CONGESTED: { targetSpeed: 25, baseVib: 0.12, label: "PADAT MERAYAP", class: "badge-congested" },
  GRIDLOCK: { targetSpeed: 0, baseVib: 0.02, label: "MACET TOTAL", class: "badge-gridlock" },
  DAMAGED_ROAD: { targetSpeed: 18, baseVib: 0.55, label: "JALAN RUSAK (BERGUNCANG)", class: "badge-damaged" },
  FLOODED: { targetSpeed: 8, baseVib: 0.06, label: "TERGENANG BANJIR", class: "badge-flooded" },
  DISASTER_BLOCKED: { targetSpeed: 0, baseVib: 0.01, label: "BENCANA / LONGSOR (TERTAHAN)", class: "badge-disaster" }
};

// 2. Global Simulation State
const state = {
  status: "IDLE", // IDLE, RUNNING, PAUSED, ARRIVED
  speedMultiplier: 1,
  timerInterval: null,
  currentIdx: 0,
  elapsedSec: 0,
  
  // Pre-trip Scenario Config
  timeOfDay: "DAY", // DAY or NIGHT
  weather: "SUNNY", // SUNNY, LIGHT_RAIN, HEAVY_STORM
  segments: [
    "FREE_FLOW",     // Seg 1 (Subang Arteri)
    "FREE_FLOW",     // Seg 2 (Tol Cipali)
    "CONGESTED",     // Seg 3 (Tol Japek)
    "FREE_FLOW",     // Seg 4 (Tol Jagorawi)
    "FREE_FLOW"      // Seg 5 (Arteri Bogor)
  ],

  // Coupled Physical & Telemetry Variables
  speed: 0,
  vibration: 0.08,
  ambientTemp: 34.0,
  solarIrradiance: 850,
  distanceTraveledKm: 0,
  totalDistanceKm: 145.0,
  bearingDeg: 268,

  // 3-Zone Microclimate
  z1_temp: 33.2,
  z2_temp: 34.1,
  z3_temp: 34.8,
  z1_rh: 62.0,
  z2_rh: 59.0,
  z3_rh: 57.0,
  co2_ppm: 1150,

  // Subsystems & Faults
  chillerActive: true,
  chillerSetpoint: 33.5,
  heaterActive: false,
  fanSpeedPct: 75,
  rearDoorOpen: false,

  faults: {
    chillerFail: false,
    doorOpen: false,
    ventFail: false,
    trafficStop: false
  }
};

// Interpolated dense path array (populated on init)
let densePath = [];

// Leaflet map objects
let map = null;
let truckMarker = null;
let segmentPolylines = [];
let trailPolyline = null;
let trailCoords = [];

// Chart.js object
let telemetryChart = null;
let activeChartType = "temp"; // 'temp' or 'speed'
const chartHistory = {
  labels: [],
  z1: [],
  z2: [],
  z3: [],
  ambient: [],
  speed: [],
  vibration: []
};

// 3. Mathematical Helpers
function interpolateDensePath() {
  densePath = [];
  const STEPS_PER_LEG = 10;
  
  for (let i = 0; i < WAYPOINTS_RAW.length - 1; i++) {
    const p1 = WAYPOINTS_RAW[i];
    const p2 = WAYPOINTS_RAW[i + 1];
    const segId = p1.seg;

    for (let step = 0; step < STEPS_PER_LEG; step++) {
      const frac = step / STEPS_PER_LEG;
      const lat = p1.lat + (p2.lat - p1.lat) * frac;
      const lng = p1.lng + (p2.lng - p1.lng) * frac;
      densePath.push({ lat, lng, seg: segId, name: p1.name });
    }
  }
  // Add last point
  const last = WAYPOINTS_RAW[WAYPOINTS_RAW.length - 1];
  densePath.push({ lat: last.lat, lng: last.lng, seg: last.seg, name: last.name });
}

function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = deg => (deg * Math.PI) / 180;
  const toDeg = rad => (rad * 180) / Math.PI;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

function calculateBearingDiff(b1, b2) {
  let diff = Math.abs(b2 - b1) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateCurveRadius(pPrev, pCurr, pNext, defaultTransitionArcM = 150) {
  const b1 = calculateBearing(pPrev.lat, pPrev.lng, pCurr.lat, pCurr.lng);
  const b2 = calculateBearing(pCurr.lat, pCurr.lng, pNext.lat, pNext.lng);
  const diffDeg = calculateBearingDiff(b1, b2);
  if (diffDeg < 2.5) {
    return { radiusM: 5000, safeSpeedKmh: 120, deltaDeg: diffDeg };
  }
  const diffRad = (diffDeg * Math.PI) / 180;
  const d1 = calculateDistanceKm(pPrev.lat, pPrev.lng, pCurr.lat, pCurr.lng) * 1000;
  const d2 = calculateDistanceKm(pCurr.lat, pCurr.lng, pNext.lat, pNext.lng) * 1000;
  const dAvg = (d1 + d2) / 2;
  const L = dAvg < 250 ? Math.min(200, dAvg) : defaultTransitionArcM;
  const radiusM = Math.max(25, Math.min(5000, L / diffRad));
  const aLatMax = 1.8;
  const safeSpeedKmh = Math.min(120, Math.sqrt(radiusM * aLatMax) * 3.6);
  return { radiusM, safeSpeedKmh, deltaDeg: diffDeg };
}

function getLookaheadCurveSpeed(path, currentIdx, lookaheadDistKm = 0.5, aDecel = 1.2) {
  if (!path || path.length < 3 || currentIdx < 0 || currentIdx >= path.length) {
    return { governedSpeedKmh: 120, currentCurveRadiusM: 5000 };
  }
  let currentRadiusM = 5000;
  const allowedSpeeds = [];
  let cumAheadKm = 0;

  if (currentIdx > 0 && currentIdx < path.length - 1) {
    const curCurve = calculateCurveRadius(path[currentIdx - 1], path[currentIdx], path[currentIdx + 1]);
    if (curCurve.deltaDeg >= 2.5) {
      currentRadiusM = curCurve.radiusM;
      allowedSpeeds.push(curCurve.safeSpeedKmh);
    }
  }

  for (let i = currentIdx + 1; i < path.length - 1; i++) {
    const stepDistKm = calculateDistanceKm(path[i - 1].lat, path[i - 1].lng, path[i].lat, path[i].lng);
    cumAheadKm += stepDistKm;
    if (cumAheadKm > lookaheadDistKm) break;

    const curve = calculateCurveRadius(path[i - 1], path[i], path[i + 1]);
    if (curve.deltaDeg >= 2.5) {
      const dAheadM = cumAheadKm * 1000;
      const vSafeMs = curve.safeSpeedKmh / 3.6;
      const vAllowedMs = Math.sqrt(vSafeMs * vSafeMs + 2 * aDecel * dAheadM);
      allowedSpeeds.push(vAllowedMs * 3.6);
    }
  }

  const governed = allowedSpeeds.length > 0 ? Math.min(...allowedSpeeds) : 120;
  return {
    governedSpeedKmh: Math.round(governed * 10) / 10,
    currentCurveRadiusM: Math.round(currentRadiusM * 10) / 10
  };
}

// 4. Leaflet Map Initialization
function initMap() {
  map = L.map("map", {
    center: [-6.48, 107.25],
    zoom: 10,
    zoomControl: true,
    zoomSnap: 0.25,
    zoomDelta: 0.25,
    wheelPxPerZoomLevel: 120
  });

  // OpenStreetMap dark styled / standard tiles
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
    maxZoom: 18
  }).addTo(map);

  // Render colored road segments based on configuration
  renderSegmentPolylines();

  // Create Trail Polyline (Breadcrumbs)
  trailPolyline = L.polyline([], {
    color: "#38bdf8",
    weight: 4,
    opacity: 0.8
  }).addTo(map);

  // Add Start (A) and End (B) Markers
  const startIcon = L.divIcon({
    className: "custom-point-icon",
    html: '<div style="background:#10b981;color:#fff;font-weight:700;font-size:11px;padding:3px 7px;border-radius:4px;border:2px solid #fff;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.4)">📍 Titik A (Subang Hatchery)</div>'
  });
  L.marker([WAYPOINTS_RAW[0].lat, WAYPOINTS_RAW[0].lng], { icon: startIcon }).addTo(map);

  const endIcon = L.divIcon({
    className: "custom-point-icon",
    html: '<div style="background:#ef4444;color:#fff;font-weight:700;font-size:11px;padding:3px 7px;border-radius:4px;border:2px solid #fff;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.4)">🏁 Titik B (Bogor Farm)</div>'
  });
  L.marker([WAYPOINTS_RAW[WAYPOINTS_RAW.length - 1].lat, WAYPOINTS_RAW[WAYPOINTS_RAW.length - 1].lng], { icon: endIcon }).addTo(map);

  // Custom Yellow Ventilated Box Truck Marker
  const truckSvg = `
    <div id="truckSvgWrapper" class="truck-marker-wrapper" style="transform-origin: center center; transition: transform 0.3s ease; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.5));">
      <img src="/assets/truck_yellow_topview.png?v=3" alt="DOC Truck" style="width: 48px; height: 48px; object-fit: contain; pointer-events: none;" />
    </div>
  `;

  const truckIcon = L.divIcon({
    className: "truck-marker-icon",
    html: truckSvg,
    iconSize: [48, 48],
    iconAnchor: [24, 24]
  });

  truckMarker = L.marker([densePath[0].lat, densePath[0].lng], { icon: truckIcon }).addTo(map);
  truckMarker.bindPopup("<b>🚚 DOC Truck-001</b><br>Target Temp: 33.5°C<br>Cargo: 40,000 DOC");
}

function renderSegmentPolylines() {
  // Clear previous segment lines if any
  segmentPolylines.forEach(line => map.removeLayer(line));
  segmentPolylines = [];

  // Group dense points by segment
  const segmentGroups = [[], [], [], [], []];
  densePath.forEach(pt => {
    segmentGroups[pt.seg].push([pt.lat, pt.lng]);
  });

  // Render each segment with configured condition color
  segmentGroups.forEach((coords, segIdx) => {
    if (coords.length > 1) {
      const condition = state.segments[segIdx];
      const color = ROAD_COLORS[condition] || "#10b981";
      const isDashed = condition === "DAMAGED_ROAD";

      const poly = L.polyline(coords, {
        color: color,
        weight: 6,
        opacity: 0.85,
        dashArray: isDashed ? "8, 8" : null
      }).addTo(map);

      poly.bindTooltip(`Segmen ${segIdx + 1}: ${ROAD_PARAMS[condition].label}`, { sticky: true });
      segmentPolylines.push(poly);
    }
  });
}

// 5. Chart.js Initialization
function initChart() {
  const ctx = document.getElementById("telemetryChart").getContext("2d");

  telemetryChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Zone 1 (Front)",
          data: [],
          borderColor: "#38bdf8",
          backgroundColor: "transparent",
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 0
        },
        {
          label: "Zone 2 (Center)",
          data: [],
          borderColor: "#10b981",
          backgroundColor: "transparent",
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 0
        },
        {
          label: "Zone 3 (Rear)",
          data: [],
          borderColor: "#f59e0b",
          backgroundColor: "transparent",
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 0
        },
        {
          label: "Ambient Temp",
          data: [],
          borderColor: "#94a3b8",
          borderDash: [4, 4],
          backgroundColor: "transparent",
          tension: 0.2,
          borderWidth: 1.5,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      plugins: {
        legend: {
          position: "top",
          labels: { boxWidth: 12, font: { size: 10 }, color: "#cbd5e1" }
        }
      },
      scales: {
        x: {
          grid: { color: "#1e293b" },
          ticks: { color: "#64748b", font: { size: 9 }, maxTicksLimit: 6 }
        },
        y: {
          grid: { color: "#1e293b" },
          ticks: { color: "#64748b", font: { size: 9 } },
          min: 26,
          max: 42
        }
      }
    }
  });
}

function updateChartDatasets() {
  if (activeChartType === "temp") {
    telemetryChart.data.datasets = [
      { label: "Zone 1 (Front)", data: chartHistory.z1, borderColor: "#38bdf8", borderWidth: 2, pointRadius: 0, tension: 0.3 },
      { label: "Zone 2 (Center)", data: chartHistory.z2, borderColor: "#10b981", borderWidth: 2, pointRadius: 0, tension: 0.3 },
      { label: "Zone 3 (Rear)", data: chartHistory.z3, borderColor: "#f59e0b", borderWidth: 2, pointRadius: 0, tension: 0.3 },
      { label: "Ambient Temp", data: chartHistory.ambient, borderColor: "#94a3b8", borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, tension: 0.2 }
    ];
    telemetryChart.options.scales.y.min = 28;
    telemetryChart.options.scales.y.max = 42;
  } else {
    telemetryChart.data.datasets = [
      { label: "Speed (km/h)", data: chartHistory.speed, borderColor: "#38bdf8", borderWidth: 2, pointRadius: 0, tension: 0.3 },
      { label: "Vibration (RMS g ×100)", data: chartHistory.vibration.map(v => v * 100), borderColor: "#ef4444", borderWidth: 2, pointRadius: 0, tension: 0.2 }
    ];
    telemetryChart.options.scales.y.min = 0;
    telemetryChart.options.scales.y.max = 100;
  }
  telemetryChart.update();
}

// 6. Coupled Simulation Physics Tick (Discrete Step)
function simulationStep() {
  if (state.status !== "RUNNING") return;

  state.elapsedSec++;

  // Current coordinate and segment
  const currentPt = densePath[state.currentIdx];
  const nextPt = densePath[Math.min(state.currentIdx + 1, densePath.length - 1)];
  const segIdx = currentPt.seg;
  const currentCondition = state.segments[segIdx];
  const roadParams = ROAD_PARAMS[currentCondition];

  // A. Kinematics calculation with adaptive curve profiling, departure & arrival zones
  let vRoad = roadParams.targetSpeed;
  if (state.faults.trafficStop) vRoad = 0;
  if (state.weather === "HEAVY_STORM") vRoad = Math.max(0, vRoad * 0.6);

  const s = state.distanceTraveledKm || 0;

  // First-mile departure ramp-up (KM 0 - 3)
  let vDep = vRoad;
  if (s < 3.0 && vRoad > 25.0) {
    vDep = 25.0 + (s / 3.0) * (vRoad - 25.0);
  }

  // Last-mile arrival slowdown (3.5 KM to destination)
  const dRem = (state.totalDistanceKm || 145.0) - s;
  let vArr = vRoad;
  if (dRem <= 3.5 && vRoad > 20.0) {
    vArr = 20.0 + (Math.max(0, dRem) / 3.5) * (vRoad - 20.0);
  }

  // Curve lookahead governor
  const curveInfo = getLookaheadCurveSpeed(densePath, state.currentIdx, 0.5, 1.2);
  const vCurve = curveInfo.governedSpeedKmh;
  state.curveRadiusM = curveInfo.currentCurveRadiusM;

  const vDeterministic = Math.min(vRoad, vDep, vArr, vCurve);

  // Driver micro-fluctuations
  let targetSpeed = vDeterministic;
  if (vDeterministic > 8.0) {
    const pulse = (Math.random() - 0.5) * 5.0;
    state.driverNoise = (state.driverNoise || 0) * 0.88 + 0.12 * pulse;
    targetSpeed = Math.max(5.0, vDeterministic + state.driverNoise);
  } else {
    state.driverNoise = 0;
  }

  // Smooth acceleration / deceleration
  const accelRate = 4.0; // km/h per second
  const decelRate = 8.0; // km/h per second
  if (state.speed < targetSpeed) {
    state.speed = Math.min(targetSpeed, state.speed + accelRate);
  } else if (state.speed > targetSpeed) {
    state.speed = Math.max(targetSpeed, state.speed - decelRate);
  }

  // Lateral acceleration calculation (g)
  const vMs = state.speed / 3.6;
  if (state.curveRadiusM && state.curveRadiusM < 4500) {
    const aLat = (vMs * vMs) / state.curveRadiusM;
    state.lateralAccelG = Math.round((aLat / 9.81) * 1000) / 1000;
  } else {
    state.lateralAccelG = 0.0;
  }

  // Bearing angle calculation
  state.bearingDeg = Math.round(calculateBearing(currentPt.lat, currentPt.lng, nextPt.lat, nextPt.lng));

  // Advance index along route based on speed
  if (state.speed > 0) {
    state.currentIdx++;
    state.distanceTraveledKm = Math.min(state.totalDistanceKm, (state.currentIdx / densePath.length) * state.totalDistanceKm);

    if (state.currentIdx >= densePath.length - 1) {
      // Arrived at destination
      state.status = "ARRIVED";
      state.speed = 0;
      updateStatusDisplay();
      clearInterval(state.timerInterval);
      alert("🎉 Truck has successfully arrived at the Bogor Partner Farm!");
      return;
    }
  }

  // B. Vibration Dynamics (RMS g-force)
  let noise = (Math.random() - 0.5) * 0.04;
  if (currentCondition === "DAMAGED_ROAD") {
    // Sharp high-frequency shocks on potholes
    noise = (Math.random() - 0.5) * 0.40;
    state.vibration = Math.max(0.20, roadParams.baseVib + noise);
  } else if (state.speed === 0) {
    state.vibration = 0.02 + Math.random() * 0.01;
  } else {
    state.vibration = Math.max(0.04, roadParams.baseVib + noise);
  }

  // C. Ambient & Solar Irradiance
  if (state.timeOfDay === "DAY") {
    state.ambientTemp = 34.0 + Math.sin(state.elapsedSec / 100) * 1.5;
    state.solarIrradiance = state.weather === "SUNNY" ? 850 : (state.weather === "LIGHT_RAIN" ? 350 : 150);
    if (state.weather === "LIGHT_RAIN") state.ambientTemp -= 3.0;
    if (state.weather === "HEAVY_STORM") state.ambientTemp -= 5.0;
  } else {
    // Nighttime
    state.ambientTemp = 24.5 - Math.min(2, state.elapsedSec / 300);
    state.solarIrradiance = 0;
    if (state.weather === "HEAVY_STORM") state.ambientTemp -= 2.5;
  }

  // D. 3-Zone Microclimate Coupled Dynamics
  const solarFactor = (state.solarIrradiance / 1000) * 0.03; // W/m2 impact on roof
  const chickMetabolicHeat = 0.025; // DOC heat emission rate

  // Chiller status
  state.chillerActive = !state.faults.chillerFail;
  const coolingRate = state.chillerActive ? 0.045 : 0.0;

  // Door status
  const doorInflow = state.faults.doorOpen ? (state.ambientTemp - state.z3_temp) * 0.08 : 0.0;

  // Update Zone 1 (Front - near chiller evaporator)
  state.z1_temp += (chickMetabolicHeat * 0.8) + (solarFactor * 0.5) - (coolingRate * 1.2);
  state.z1_temp = Math.max(30.0, Math.min(42.0, state.z1_temp));

  // Update Zone 2 (Middle - dense chick biomass)
  state.z2_temp += (chickMetabolicHeat * 1.2) + (solarFactor * 0.9) - (coolingRate * 0.95);
  state.z2_temp = Math.max(30.5, Math.min(43.0, state.z2_temp));

  // Update Zone 3 (Rear - near door & furthest from evaporator)
  state.z3_temp += (chickMetabolicHeat * 1.1) + (solarFactor * 1.3) + doorInflow - (coolingRate * 0.7);
  state.z3_temp = Math.max(31.0, Math.min(44.0, state.z3_temp));

  // CO2 accumulation
  if (state.faults.ventFail) {
    state.co2_ppm = Math.min(4000, state.co2_ppm + 12);
  } else {
    // Normal ventilation balancing
    if (state.co2_ppm > 1200) state.co2_ppm -= 6;
    else state.co2_ppm += (Math.random() - 0.4) * 4;
  }

  // E. Update UI Elements & Leaflet Map
  updateTelemetryUI();
  updateMapPosition(densePath[state.currentIdx]);
  pushChartData();
}

// 7. UI Rendering Helpers
function updateTelemetryUI() {
  // Format elapsed time HH:MM:SS
  const hrs = String(Math.floor(state.elapsedSec / 3600)).padStart(2, "0");
  const mins = String(Math.floor((state.elapsedSec % 3600) / 60)).padStart(2, "0");
  const secs = String(state.elapsedSec % 60).padStart(2, "0");
  document.getElementById("tripTimer").innerText = `${hrs}:${mins}:${secs}`;

  // Kinematics Cards
  document.getElementById("valSpeed").innerHTML = `${Math.round(state.speed)} <small>km/jam</small>`;
  document.getElementById("valVibration").innerHTML = `${state.vibration.toFixed(2)} <small>g</small>`;
  document.getElementById("valAmbient").innerHTML = `${state.ambientTemp.toFixed(1)} <small>°C</small>`;
  document.getElementById("valDistance").innerHTML = `${state.distanceTraveledKm.toFixed(1)} <small>/ 145 km</small>`;

  const pct = Math.round((state.distanceTraveledKm / state.totalDistanceKm) * 100);
  document.getElementById("subProgress").innerText = `Progress: ${pct}%`;
  document.getElementById("subSolar").innerText = `Irradiance: ${Math.round(state.solarIrradiance)} W/m²`;

  // Vibration alert status
  const vibEl = document.getElementById("subVibStatus");
  if (state.vibration > 0.40) {
    vibEl.innerText = "⚠️ High Vibration!";
    vibEl.style.color = "#ea580c";
  } else {
    vibEl.innerText = "Normal (Smooth)";
    vibEl.style.color = "#64748b";
  }

  // Road Condition Badge
  const segIdx = densePath[state.currentIdx].seg;
  const currentCondition = state.segments[segIdx];
  const roadParams = ROAD_PARAMS[currentCondition];
  const roadBadge = document.getElementById("currentRoadBadge");
  roadBadge.innerText = roadParams.label;
  roadBadge.className = roadParams.class;

  // GPS Coordinates & Bearing
  const pt = densePath[state.currentIdx];
  document.getElementById("gpsCoordBadge").innerText = `Lat: ${pt.lat.toFixed(4)}, Lng: ${pt.lng.toFixed(4)}`;
  document.getElementById("bearingBadge").innerText = `Bearing: ${state.bearingDeg}°`;

  // 3-Zone Temperatures & Welfare Status
  renderZoneCard(1, state.z1_temp, state.z1_rh);
  renderZoneCard(2, state.z2_temp, state.z2_rh);
  renderZoneCard(3, state.z3_temp, state.z3_rh);

  // Welfare Badge evaluation
  const maxTemp = Math.max(state.z1_temp, state.z2_temp, state.z3_temp);
  const minTemp = Math.min(state.z1_temp, state.z2_temp, state.z3_temp);
  const welfareEl = document.getElementById("welfareBadge");

  if (maxTemp > 38.0 || minTemp < 30.0 || state.co2_ppm > 2500) {
    welfareEl.innerText = "CRITICAL (HIGH MORTALITY)";
    welfareEl.className = "badge-critical";
  } else if (maxTemp > 35.5 || minTemp < 31.5 || state.co2_ppm > 1500) {
    welfareEl.innerText = "WARNING (THERMAL STRESS)";
    welfareEl.className = "badge-warning";
  } else {
    welfareEl.innerText = "OPTIMAL (NORMAL)";
    welfareEl.className = "badge-normal";
  }

  // CO2 Gauge
  document.getElementById("valCO2").innerText = `${Math.round(state.co2_ppm)} ppm`;
  const co2Pct = Math.min(100, Math.round((state.co2_ppm / 3000) * 100));
  const co2Bar = document.getElementById("barCO2");
  co2Bar.style.width = `${co2Pct}%`;
  co2Bar.style.backgroundColor = state.co2_ppm > 2000 ? "#ef4444" : (state.co2_ppm > 1500 ? "#f59e0b" : "#3b82f6");

  // Chiller Status Pill
  const chillerPill = document.getElementById("chillerStatusPill");
  if (state.faults.chillerFail) {
    chillerPill.innerText = "❌ Chiller: FAULT / OFF";
    chillerPill.className = "subsystem-pill chiller-off";
  } else {
    chillerPill.innerText = "❄️ Chiller: ON (Set 33.5°C)";
    chillerPill.className = "subsystem-pill";
  }
}

function renderZoneCard(zoneNum, temp, rh) {
  const box = document.getElementById(`zoneBox${zoneNum}`);
  const tempEl = document.getElementById(`tempZ${zoneNum}`);
  const gaugeEl = document.getElementById(`gaugeZ${zoneNum}`);

  tempEl.innerText = `${temp.toFixed(1)}°C`;

  // Standard safe: 32 - 35°C
  box.className = "zone-box";
  tempEl.className = "zone-temp";

  if (temp > 38.0 || temp < 30.0) {
    box.classList.add("critical");
    tempEl.classList.add("critical");
    gaugeEl.style.backgroundColor = "#ef4444";
  } else if (temp > 35.5 || temp < 31.5) {
    box.classList.add("warning");
    tempEl.classList.add("warning");
    gaugeEl.style.backgroundColor = "#f59e0b";
  } else {
    gaugeEl.style.backgroundColor = "#10b981";
  }

  // Gauge percentage (28°C = 0%, 42°C = 100%)
  const gaugePct = Math.max(5, Math.min(100, ((temp - 28) / (42 - 28)) * 100));
  gaugeEl.style.width = `${gaugePct}%`;
}

function updateMapPosition(pt) {
  truckMarker.setLatLng([pt.lat, pt.lng]);

  // Transformasi orientasi truk top-view sesuai arah navigasi (bearing)
  const wrapper = document.getElementById("truckSvgWrapper");
  if (wrapper) {
    const h = (((state.bearingDeg || 270) % 360) + 360) % 360;
    wrapper.style.transform = `rotate(${Math.round(h)}deg)`;
  }

  // Append to breadcrumb trail
  trailCoords.push([pt.lat, pt.lng]);
  trailPolyline.setLatLngs(trailCoords);
}

function pushChartData() {
  const timeLabel = `${String(state.elapsedSec)}s`;

  chartHistory.labels.push(timeLabel);
  chartHistory.z1.push(parseFloat(state.z1_temp.toFixed(2)));
  chartHistory.z2.push(parseFloat(state.z2_temp.toFixed(2)));
  chartHistory.z3.push(parseFloat(state.z3_temp.toFixed(2)));
  chartHistory.ambient.push(parseFloat(state.ambientTemp.toFixed(2)));
  chartHistory.speed.push(Math.round(state.speed));
  chartHistory.vibration.push(parseFloat(state.vibration.toFixed(2)));

  // Keep maximum 30 sliding data points
  if (chartHistory.labels.length > 30) {
    chartHistory.labels.shift();
    chartHistory.z1.shift();
    chartHistory.z2.shift();
    chartHistory.z3.shift();
    chartHistory.ambient.shift();
    chartHistory.speed.shift();
    chartHistory.vibration.shift();
  }

  telemetryChart.data.labels = chartHistory.labels;
  telemetryChart.update();
}

// 8. Simulation Lifecycle Controls
function startSimulation() {
  if (state.status === "ARRIVED") return;

  state.status = "RUNNING";
  updateStatusDisplay();

  const tickIntervalMs = Math.round(1000 / state.speedMultiplier);
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(simulationStep, tickIntervalMs);

  document.getElementById("btnPlayPause").innerText = "⏸ Jeda Simulasi";
  document.getElementById("btnPlayPause").classList.remove("btn-primary");
  document.getElementById("btnPlayPause").classList.add("btn-secondary");
}

function pauseSimulation() {
  state.status = "PAUSED";
  updateStatusDisplay();
  clearInterval(state.timerInterval);

  document.getElementById("btnPlayPause").innerText = "▶ Lanjutkan";
  document.getElementById("btnPlayPause").classList.remove("btn-secondary");
  document.getElementById("btnPlayPause").classList.add("btn-primary");
}

function resetSimulation() {
  clearInterval(state.timerInterval);
  state.status = "IDLE";
  state.currentIdx = 0;
  state.elapsedSec = 0;
  state.speed = 0;
  state.distanceTraveledKm = 0;

  // Reset thermal & microclimate
  state.z1_temp = 33.2;
  state.z2_temp = 34.1;
  state.z3_temp = 34.8;
  state.co2_ppm = 1150;

  // Clear faults
  state.faults = { chillerFail: false, doorOpen: false, ventFail: false, trafficStop: false };
  updateFaultBadges();

  // Reset chart & trail
  chartHistory.labels = [];
  chartHistory.z1 = [];
  chartHistory.z2 = [];
  chartHistory.z3 = [];
  chartHistory.ambient = [];
  chartHistory.speed = [];
  chartHistory.vibration = [];
  telemetryChart.data.labels = [];
  telemetryChart.update();

  trailCoords = [];
  trailPolyline.setLatLngs([]);

  // Reset truck marker to Start point
  updateMapPosition(densePath[0]);
  updateStatusDisplay();
  updateTelemetryUI();

  document.getElementById("btnPlayPause").innerText = "▶ Mulai Simulasi";
  document.getElementById("btnPlayPause").classList.remove("btn-secondary");
  document.getElementById("btnPlayPause").classList.add("btn-primary");
}

function updateStatusDisplay() {
  const dot = document.getElementById("statusDot");
  const text = document.getElementById("statusText");

  dot.className = "status-dot";
  if (state.status === "IDLE") {
    dot.classList.add("idle");
    text.innerText = "IDLE (SIAP)";
  } else if (state.status === "RUNNING") {
    dot.classList.add("running");
    text.innerText = "RUNNING (AKTIF)";
  } else if (state.status === "PAUSED") {
    dot.classList.add("paused");
    text.innerText = "PAUSED";
  } else if (state.status === "ARRIVED") {
    dot.classList.add("arrived");
    text.innerText = "ARRIVED";
  }
}

// 9. Presets & Configuration Application
function applyPreset(presetKey) {
  if (presetKey === "preset_ideal") {
    setRadio("timeOfDay", "DAY");
    setRadio("weather", "SUNNY");
    document.getElementById("seg1Select").value = "FREE_FLOW";
    document.getElementById("seg2Select").value = "FREE_FLOW";
    document.getElementById("seg3Select").value = "FREE_FLOW";
    document.getElementById("seg4Select").value = "FREE_FLOW";
    document.getElementById("seg5Select").value = "FREE_FLOW";
  } else if (presetKey === "preset_traffic_heat") {
    setRadio("timeOfDay", "DAY");
    setRadio("weather", "SUNNY");
    document.getElementById("seg1Select").value = "FREE_FLOW";
    document.getElementById("seg2Select").value = "CONGESTED";
    document.getElementById("seg3Select").value = "GRIDLOCK"; // Heavy congestion Cikampek
    document.getElementById("seg4Select").value = "CONGESTED";
    document.getElementById("seg5Select").value = "FREE_FLOW";
  } else if (presetKey === "preset_night_storm") {
    setRadio("timeOfDay", "NIGHT");
    setRadio("weather", "HEAVY_STORM");
    document.getElementById("seg1Select").value = "FREE_FLOW";
    document.getElementById("seg2Select").value = "FREE_FLOW";
    document.getElementById("seg3Select").value = "CONGESTED";
    document.getElementById("seg4Select").value = "FREE_FLOW";
    document.getElementById("seg5Select").value = "FREE_FLOW";
  } else if (presetKey === "preset_damaged_road") {
    setRadio("timeOfDay", "DAY");
    setRadio("weather", "SUNNY");
    document.getElementById("seg1Select").value = "DAMAGED_ROAD"; // Potholes arterial
    document.getElementById("seg2Select").value = "FREE_FLOW";
    document.getElementById("seg3Select").value = "FREE_FLOW";
    document.getElementById("seg4Select").value = "DAMAGED_ROAD";
    document.getElementById("seg5Select").value = "DAMAGED_ROAD";
  } else if (presetKey === "preset_flood_disaster") {
    setRadio("timeOfDay", "DAY");
    setRadio("weather", "HEAVY_STORM");
    document.getElementById("seg1Select").value = "FREE_FLOW";
    document.getElementById("seg2Select").value = "FLOODED";
    document.getElementById("seg3Select").value = "FLOODED";
    document.getElementById("seg4Select").value = "DISASTER_BLOCKED"; // Landslide blockage
    document.getElementById("seg5Select").value = "CONGESTED";
  }
}

function setRadio(name, val) {
  const rad = document.querySelector(`input[name="${name}"][value="${val}"]`);
  if (rad) rad.checked = true;
}

function applyModalConfig() {
  state.timeOfDay = document.querySelector('input[name="timeOfDay"]:checked').value;
  state.weather = document.querySelector('input[name="weather"]:checked').value;

  state.segments = [
    document.getElementById("seg1Select").value,
    document.getElementById("seg2Select").value,
    document.getElementById("seg3Select").value,
    document.getElementById("seg4Select").value,
    document.getElementById("seg5Select").value
  ];

  // Update top scenario summary pills
  document.getElementById("pillTime").innerHTML = `<span class="icon">${state.timeOfDay === "DAY" ? "☀️" : "🌙"}</span> Schedule: <strong>${state.timeOfDay === "DAY" ? "Daytime" : "Nighttime"}</strong>`;
  
  const weatherLabel = state.weather === "SUNNY" ? "Sunny & Hot" : (state.weather === "LIGHT_RAIN" ? "Light Rain" : "Severe Storm");
  document.getElementById("pillWeather").innerHTML = `<span class="icon">🌤️</span> Weather: <strong>${weatherLabel}</strong>`;

  renderSegmentPolylines();
  resetSimulation();
  document.getElementById("configModal").classList.remove("show");
}

function updateFaultBadges() {
  const activeList = [];
  if (state.faults.chillerFail) activeList.push("Chiller Failure");
  if (state.faults.doorOpen) activeList.push("Rear Door Leak/Open");
  if (state.faults.ventFail) activeList.push("Ventilation Fan Offline");
  if (state.faults.trafficStop) activeList.push("Sudden Gridlock");

  const badge = document.getElementById("activeFaultBadge");
  if (activeList.length === 0) {
    badge.innerText = "Fault Status: Normal";
    badge.style.color = "#34d399";
  } else {
    badge.innerText = `⚠️ Active Faults: ${activeList.join(", ")}`;
    badge.style.color = "#ef4444";
  }
}

// 10. DOM Event Bindings
document.addEventListener("DOMContentLoaded", () => {
  interpolateDensePath();
  initMap();
  initChart();
  updateTelemetryUI();

  // Play / Pause Button
  document.getElementById("btnPlayPause").addEventListener("click", () => {
    if (state.status === "RUNNING") pauseSimulation();
    else startSimulation();
  });

  // Reset Button
  document.getElementById("btnReset").addEventListener("click", resetSimulation);

  // Speed Multiplier Buttons
  document.querySelectorAll(".speed-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      document.querySelectorAll(".speed-btn").forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      state.speedMultiplier = parseInt(e.target.getAttribute("data-speed"));
      if (state.status === "RUNNING") startSimulation(); // re-arm interval with new speed
    });
  });

  // Chart Tab Toggles
  document.querySelectorAll(".chart-tab").forEach(tab => {
    tab.addEventListener("click", e => {
      document.querySelectorAll(".chart-tab").forEach(t => t.classList.remove("active"));
      e.target.classList.add("active");
      activeChartType = e.target.getAttribute("data-chart");
      updateChartDatasets();
    });
  });

  // Modal Open / Close
  const modal = document.getElementById("configModal");
  document.getElementById("btnConfigModal").addEventListener("click", () => modal.classList.add("show"));
  document.getElementById("btnCloseModal").addEventListener("click", () => modal.classList.remove("show"));
  document.getElementById("btnCancelModal").addEventListener("click", () => modal.classList.remove("show"));

  // Preset Selection in Modal
  document.getElementById("presetSelect").addEventListener("change", e => {
    applyPreset(e.target.value);
  });

  // Apply Config from Modal
  document.getElementById("btnApplyConfig").addEventListener("click", applyModalConfig);

  // Runtime Fault Buttons
  const btnChiller = document.getElementById("btnFaultChiller");
  btnChiller.addEventListener("click", () => {
    state.faults.chillerFail = !state.faults.chillerFail;
    btnChiller.classList.toggle("active-fault", state.faults.chillerFail);
    updateFaultBadges();
  });

  const btnDoor = document.getElementById("btnFaultDoor");
  btnDoor.addEventListener("click", () => {
    state.faults.doorOpen = !state.faults.doorOpen;
    btnDoor.classList.toggle("active-fault", state.faults.doorOpen);
    updateFaultBadges();
  });

  const btnVent = document.getElementById("btnFaultVent");
  btnVent.addEventListener("click", () => {
    state.faults.ventFail = !state.faults.ventFail;
    btnVent.classList.toggle("active-fault", state.faults.ventFail);
    updateFaultBadges();
  });

  const btnTraffic = document.getElementById("btnFaultTraffic");
  btnTraffic.addEventListener("click", () => {
    state.faults.trafficStop = !state.faults.trafficStop;
    btnTraffic.classList.toggle("active-fault", state.faults.trafficStop);
    updateFaultBadges();
  });

  document.getElementById("btnClearFaults").addEventListener("click", () => {
    state.faults = { chillerFail: false, doorOpen: false, ventFail: false, trafficStop: false };
    btnChiller.classList.remove("active-fault");
    btnDoor.classList.remove("active-fault");
    btnVent.classList.remove("active-fault");
    btnTraffic.classList.remove("active-fault");
    updateFaultBadges();
  });
});

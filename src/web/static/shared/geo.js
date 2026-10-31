/**
 * Shared Geodesic & Kinematics Utility
 * Perhitungan bearing, jarak Haversine, dan interpolasi titik rute GPS
 */

/**
 * Menghitung arah mata angin (bearing / heading) antara dua koordinat lat/lng (0° - 360°)
 */
export function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = d => (d * Math.PI) / 180;
  const toDeg = r => (r * 180) / Math.PI;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Menginterpolasi daftar waypoints kasar menjadi lintasan halus (dense path)
 */
export function interpolateDensePath(waypointsRaw, stepsPerLeg = 10) {
  const densePath = [];
  if (!waypointsRaw || waypointsRaw.length === 0) return densePath;

  for (let i = 0; i < waypointsRaw.length - 1; i++) {
    const p1 = waypointsRaw[i];
    const p2 = waypointsRaw[i + 1];
    for (let s = 0; s < stepsPerLeg; s++) {
      const frac = s / stepsPerLeg;
      densePath.push({
        lat: p1.lat + (p2.lat - p1.lat) * frac,
        lng: p1.lng + (p2.lng - p1.lng) * frac,
        seg: p1.seg,
        name: p1.name
      });
    }
  }

  const last = waypointsRaw[waypointsRaw.length - 1];
  densePath.push({
    lat: last.lat,
    lng: last.lng,
    seg: last.seg,
    name: last.name
  });

  return densePath;
}

/**
 * Menghitung jarak geodesik Haversine dalam kilometer antara dua titik koordinat
 */
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius bumi dalam KM
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Menghitung selisih terkecil sudut bearing / heading (0° - 180°)
 */
export function calculateBearingDiff(b1, b2) {
  let diff = Math.abs(b2 - b1) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

/**
 * Menghitung radius kurvatur jalan R (meter) dan batas kecepatan aman sentripetal DOC (km/h)
 * Berdasarkan batas kenyamanan/kesejahteraan DOC (a_lat_max <= 1.8 m/s^2 ≈ 0.183g)
 */
export function calculateCurveRadius(pPrev, pCurr, pNext, defaultTransitionArcM = 150) {
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
  const aLatMax = 1.8; // m/s^2
  const safeSpeedKmh = Math.min(120, Math.sqrt(radiusM * aLatMax) * 3.6);
  return { radiusM, safeSpeedKmh, deltaDeg: diffDeg };
}

/**
 * Memindai tikungan ke depan (lookahead horizon) dari lintasan rute.
 * Menerapkan deselerasi prediktif: v_allowed = sqrt(v_safe^2 + 2 * a_decel * d_ahead) * 3.6
 */
export function getLookaheadCurveSpeed(path, currentIdx, lookaheadDistKm = 0.5, aDecel = 1.2, aLatMax = 1.8) {
  if (!path || path.length < 3 || currentIdx < 0 || currentIdx >= path.length) {
    return { governedSpeedKmh: 120, currentCurveRadiusM: 5000, curvesInHorizon: 0 };
  }

  let currentRadiusM = 5000;
  const allowedSpeeds = [];
  let cumAheadKm = 0;

  // Cek apakah titik saat ini merupakan bagian dari tikungan
  if (currentIdx > 0 && currentIdx < path.length - 1) {
    const curCurve = calculateCurveRadius(path[currentIdx - 1], path[currentIdx], path[currentIdx + 1]);
    if (curCurve.deltaDeg >= 2.5) {
      currentRadiusM = curCurve.radiusM;
      allowedSpeeds.push(curCurve.safeSpeedKmh);
    }
  }

  // Pindai titik-titik di depan dalam rentang lookaheadDistKm
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
    currentCurveRadiusM: Math.round(currentRadiusM * 10) / 10,
    curvesInHorizon: allowedSpeeds.length
  };
}

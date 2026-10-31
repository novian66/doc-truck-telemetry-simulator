/**
 * Shared Poultry Biometrics & Welfare Evaluation Module
 * Berdasarkan formulasi empiris Audy Joinaldy (2020), Barbosa-Filho (2014), dan Cobb-Vantress (2015)
 */

/**
 * Menghitung Temperature-Humidity Index (THI)
 * THI = 0.8 * T + (RH / 100) * (T - 14.4) + 46.4
 * Ambang batas:
 * - < 142.0: Nyaman / Optimal
 * - 142.0 - 159.9: Stres Termal Ringan / Waspada
 * - >= 160.0: Stres Berat / Bahaya Kritis
 */
export function calculateTHI(tempC, rhPct) {
  const t = parseFloat(tempC) || 25.0;
  const rh = parseFloat(rhPct) || 60.0;
  return 0.8 * t + (rh / 100.0) * (t - 14.4) + 46.4;
}

/**
 * Menghitung estimasi penyusutan bobot kumulatif (Weight Loss %)
 * Mengacu pada model empiris IPB Audy Joinaldy 2020:
 * Susut bobot bertambah ~0.45 g per 100 km, dengan faktor pengali stres termal THI
 */
export function calculateWeightLossPct(elapsedHours, distanceKm, thi) {
  const d = Math.max(0, parseFloat(distanceKm) || 0);
  const t = Math.max(0, parseFloat(elapsedHours) || 0);
  const thiVal = parseFloat(thi) || 140.0;

  let thiFactor = 1.0;
  if (thiVal >= 160.0) thiFactor = 1.45;
  else if (thiVal >= 142.0) thiFactor = 1.20;

  // Persamaan komposit susut bobot berbasis durasi & jarak tempuh
  const baseLossGrams = 0.38 * Math.pow(t, 0.65) + (d / 100.0) * 0.45;
  const initialWeight = 42.0; // gram
  const lossPct = ((baseLossGrams * thiFactor) / initialWeight) * 100;
  return parseFloat(lossPct.toFixed(2));
}

/**
 * Evaluasi Status Kesejahteraan Kargo DOC
 * Mengembalikan objek { label: string, statusClass: string, isCritical: boolean }
 */
export function evaluateWelfareStatus(maxTemp, minTemp, co2Ppm) {
  const maxT = parseFloat(maxTemp) || 25.0;
  const minT = parseFloat(minTemp) || 25.0;
  const co2 = parseInt(co2Ppm) || 1000;

  if (maxT > 38.0) {
    return {
      label: "KRITIS (HIPERTERMIA / PANAS > 38°C)",
      statusClass: "badge-critical",
      isCritical: true,
      alertCode: "CRITICAL_HEAT_STRESS"
    };
  } else if (minT < 30.0) {
    return {
      label: `KRITIS (HIPOTERMIA / DINGIN ${minT.toFixed(1)}°C < 30°C)`,
      statusClass: "badge-critical",
      isCritical: true,
      alertCode: "CRITICAL_COLD_STRESS"
    };
  } else if (co2 > 2500) {
    return {
      label: `KRITIS (CO2 TINGGI ${co2} ppm)`,
      statusClass: "badge-critical",
      isCritical: true,
      alertCode: "CRITICAL_CO2"
    };
  } else if (maxT > 35.5 || minT < 31.5 || co2 > 1500) {
    return {
      label: "WASPADA (STRES TERMAL)",
      statusClass: "badge-warning",
      isCritical: false,
      alertCode: "THERMAL_STRESS_WARNING"
    };
  } else {
    return {
      label: "OPTIMAL (NORMAL 32°C - 35°C)",
      statusClass: "badge-normal",
      isCritical: false,
      alertCode: "NORMAL"
    };
  }
}

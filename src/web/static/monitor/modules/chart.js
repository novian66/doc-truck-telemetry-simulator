/**
 * Monitor Chart.js Real-time Streaming Controller (ES Module)
 * Mengelola visualisasi multi-zona temperatur kargo dan telemetri kinematika
 */

import {
  chartHistory,
  activeChartType,
  setActiveChartType
} from "./state.js";

let telemetryChart = null;

/**
 * Inisialisasi Chart.js canvas
 */
export function initChart() {
  const canvas = document.getElementById("telemetryChart");
  if (!canvas || typeof window.Chart === "undefined") {
    console.warn("Canvas telemetryChart atau Chart.js belum tersedia.");
    return;
  }

  const ctx = canvas.getContext("2d");
  telemetryChart = new window.Chart(ctx, {
    type: "line",
    data: {
      labels: chartHistory.labels,
      datasets: [
        { label: "Zone 1 (Front)", data: chartHistory.z1, borderColor: "#38bdf8", tension: 0.3, borderWidth: 2, pointRadius: 0 },
        { label: "Zone 2 (Center)", data: chartHistory.z2, borderColor: "#10b981", tension: 0.3, borderWidth: 2, pointRadius: 0 },
        { label: "Zone 3 (Rear)", data: chartHistory.z3, borderColor: "#f59e0b", tension: 0.3, borderWidth: 2, pointRadius: 0 },
        { label: "Ambient Temp (°C)", data: chartHistory.ambient, borderColor: "#94a3b8", borderDash: [4, 4], tension: 0.2, borderWidth: 1.5, pointRadius: 0 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      plugins: {
        legend: {
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
          min: 20,
          max: 42
        }
      }
    }
  });
}

/**
 * Memperbarui datasets pada grafik saat tab diubah (Temperatur vs Kinematika)
 */
export function updateChartDatasets() {
  if (!telemetryChart) return;

  if (activeChartType === "temp") {
    telemetryChart.data.datasets = [
      { label: "Zone 1 (Front)", data: chartHistory.z1, borderColor: "#38bdf8", borderWidth: 2, pointRadius: 0, tension: 0.3 },
      { label: "Zone 2 (Center)", data: chartHistory.z2, borderColor: "#10b981", borderWidth: 2, pointRadius: 0, tension: 0.3 },
      { label: "Zone 3 (Rear)", data: chartHistory.z3, borderColor: "#f59e0b", borderWidth: 2, pointRadius: 0, tension: 0.3 },
      { label: "Ambient Temp (°C)", data: chartHistory.ambient, borderColor: "#94a3b8", borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, tension: 0.2 }
    ];
    telemetryChart.options.scales.y.min = 20;
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

/**
 * Menambahkan sampel baru ke riwayat grafik (FIFO sliding window 30 sampel)
 */
export function pushChartSample(elapsedSec, z1, z2, z3, ambient, speed, vibration) {
  if (!telemetryChart) return;

  chartHistory.labels.push(`${elapsedSec}s`);
  chartHistory.z1.push(z1);
  chartHistory.z2.push(z2);
  chartHistory.z3.push(z3);
  chartHistory.ambient.push(ambient);
  chartHistory.speed.push(speed);
  chartHistory.vibration.push(vibration);

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

/**
 * Berganti tab grafik
 */
export function switchChartTab(chartType) {
  setActiveChartType(chartType);
  updateChartDatasets();
}

/**
 * Bersihkan buffer grafik saat berganti trip
 */
export function clearChartHistory() {
  chartHistory.labels.length = 0;
  chartHistory.z1.length = 0;
  chartHistory.z2.length = 0;
  chartHistory.z3.length = 0;
  chartHistory.ambient.length = 0;
  chartHistory.speed.length = 0;
  chartHistory.vibration.length = 0;
  if (telemetryChart) {
    telemetryChart.data.labels = [];
    telemetryChart.update();
  }
}

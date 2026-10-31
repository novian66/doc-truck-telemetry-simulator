/**
 * Route Coordinates Interactive Map Picker Module (ES Module)
 * Memungkinkan pengguna memilih dan menyeret (drag) Koordinat Asal & Tujuan langsung di peta Leaflet
 */

let pickerMap = null;
let markerOrigin = null;
let markerDest = null;
let routeLine = null;
let activePickerMode = "ORIGIN"; // "ORIGIN" | "DEST"

const DEFAULT_ORIGIN = { lat: -6.5650, lng: 107.7600, name: "Subang Hatchery (Hulu)" };
const DEFAULT_DEST = { lat: -6.5980, lng: 106.7990, name: "Bogor Broiler Farm (Hilir)" };

/**
 * Buat custom DivIcon untuk pin asal / tujuan
 */
function createPickerIcon(type = "origin") {
  const isOrigin = type === "origin";
  const iconChar = isOrigin ? "📍" : "🏁";
  const label = isOrigin ? "Asal (A)" : "Tujuan (B)";
  const cls = isOrigin ? "pin-origin" : "pin-dest";

  return window.L.divIcon({
    className: "leaflet-picker-div-icon",
    html: `
      <div class="custom-map-picker-pin ${cls}">
        <span class="pin-icon">${iconChar}</span>
        <span class="pin-badge">${label}</span>
      </div>
    `,
    iconSize: [80, 32],
    iconAnchor: [40, 32]
  });
}

/**
 * Update garis penghubung dan bounding box
 */
function updateRouteLine() {
  if (!pickerMap || !markerOrigin || !markerDest) return;
  const posA = markerOrigin.getLatLng();
  const posB = markerDest.getLatLng();

  if (routeLine) {
    routeLine.setLatLngs([posA, posB]);
  } else {
    routeLine = window.L.polyline([posA, posB], {
      color: "#38bdf8",
      weight: 3,
      opacity: 0.8,
      dashArray: "6, 8"
    }).addTo(pickerMap);
  }
}

/**
 * Atur Mode Pemilih Titik di Peta (ORIGIN atau DEST)
 */
export function setPickerMode(mode = "ORIGIN") {
  activePickerMode = mode;

  const btnOriginTab = document.getElementById("tabPickOrigin");
  const btnDestTab = document.getElementById("tabPickDest");
  const btnLinkOrigin = document.getElementById("btnPickOriginMode");
  const btnLinkDest = document.getElementById("btnPickDestMode");
  const statusEl = document.getElementById("pickerStatusText");

  if (btnOriginTab) btnOriginTab.classList.toggle("active", mode === "ORIGIN");
  if (btnDestTab) btnDestTab.classList.toggle("active", mode === "DEST");
  if (btnLinkOrigin) btnLinkOrigin.classList.toggle("active", mode === "ORIGIN");
  if (btnLinkDest) btnLinkDest.classList.toggle("active", mode === "DEST");

  if (statusEl) {
    if (mode === "ORIGIN") {
      statusEl.innerHTML = 'Mode: Klik peta untuk memindahkan 📍 <strong>Titik Asal (A)</strong>';
    } else {
      statusEl.innerHTML = 'Mode: Klik peta untuk memindahkan 🏁 <strong>Titik Tujuan (B)</strong>';
    }
  }
}

/**
 * Sinkronisasi posisi marker peta dari nilai input angka
 */
export function syncMarkersFromInputs() {
  const oLat = parseFloat(document.getElementById("newOriginLat")?.value);
  const oLng = parseFloat(document.getElementById("newOriginLng")?.value);
  const dLat = parseFloat(document.getElementById("newDestLat")?.value);
  const dLng = parseFloat(document.getElementById("newDestLng")?.value);

  if (!isNaN(oLat) && !isNaN(oLng) && markerOrigin) {
    markerOrigin.setLatLng([oLat, oLng]);
  }
  if (!isNaN(dLat) && !isNaN(dLng) && markerDest) {
    markerDest.setLatLng([dLat, dLng]);
  }
  updateRouteLine();
}

/**
 * Reset koordinat ke standar Subang - Bogor
 */
export function resetToDefaultCoords() {
  const inOLat = document.getElementById("newOriginLat");
  const inOLng = document.getElementById("newOriginLng");
  const inOName = document.getElementById("newOriginName");

  const inDLat = document.getElementById("newDestLat");
  const inDLng = document.getElementById("newDestLng");
  const inDName = document.getElementById("newDestName");

  if (inOLat) inOLat.value = DEFAULT_ORIGIN.lat.toFixed(4);
  if (inOLng) inOLng.value = DEFAULT_ORIGIN.lng.toFixed(4);
  if (inOName && !inOName.value) inOName.value = DEFAULT_ORIGIN.name;

  if (inDLat) inDLat.value = DEFAULT_DEST.lat.toFixed(4);
  if (inDLng) inDLng.value = DEFAULT_DEST.lng.toFixed(4);
  if (inDName && !inDName.value) inDName.value = DEFAULT_DEST.name;

  syncMarkersFromInputs();

  if (pickerMap && markerOrigin && markerDest) {
    pickerMap.fitBounds([markerOrigin.getLatLng(), markerDest.getLatLng()], { padding: [40, 40] });
  }
}

/**
 * Initialize Route Picker Map (Leaflet)
 */
export function initRoutePickerMap() {
  if (typeof window.L === "undefined") {
    console.warn("Leaflet (L) belum siap untuk routePickerMap.");
    return;
  }

  const container = document.getElementById("routePickerMap");
  if (!container) return;

  // Baca nilai awal dari form input
  let oLat = parseFloat(document.getElementById("newOriginLat")?.value) || DEFAULT_ORIGIN.lat;
  let oLng = parseFloat(document.getElementById("newOriginLng")?.value) || DEFAULT_ORIGIN.lng;
  let dLat = parseFloat(document.getElementById("newDestLat")?.value) || DEFAULT_DEST.lat;
  let dLng = parseFloat(document.getElementById("newDestLng")?.value) || DEFAULT_DEST.lng;

  // Jika peta sudah pernah diinisialisasi, refresh ukuran dan posisinya
  if (pickerMap) {
    pickerMap.invalidateSize();
    if (markerOrigin) markerOrigin.setLatLng([oLat, oLng]);
    if (markerDest) markerDest.setLatLng([dLat, dLng]);
    updateRouteLine();
    pickerMap.fitBounds([[oLat, oLng], [dLat, dLng]], { padding: [35, 35] });
    return;
  }

  // Buat instance peta baru
  pickerMap = window.L.map(container, {
    center: [(oLat + dLat) / 2, (oLng + dLng) / 2],
    zoom: 9,
    zoomControl: true,
    zoomSnap: 0.25,
    zoomDelta: 0.25,
    wheelPxPerZoomLevel: 120
  });

  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
    maxZoom: 18
  }).addTo(pickerMap);

  // Marker Titik Asal A (Draggable)
  markerOrigin = window.L.marker([oLat, oLng], {
    icon: createPickerIcon("origin"),
    draggable: true,
    title: "Titik Asal (A) - Seret untuk memindahkan koordinat"
  }).addTo(pickerMap);

  markerOrigin.on("drag", () => {
    const pos = markerOrigin.getLatLng();
    const inLat = document.getElementById("newOriginLat");
    const inLng = document.getElementById("newOriginLng");
    if (inLat) inLat.value = pos.lat.toFixed(4);
    if (inLng) inLng.value = pos.lng.toFixed(4);
    updateRouteLine();
  });

  // Marker Titik Tujuan B (Draggable)
  markerDest = window.L.marker([dLat, dLng], {
    icon: createPickerIcon("dest"),
    draggable: true,
    title: "Titik Tujuan (B) - Seret untuk memindahkan koordinat"
  }).addTo(pickerMap);

  markerDest.on("drag", () => {
    const pos = markerDest.getLatLng();
    const inLat = document.getElementById("newDestLat");
    const inLng = document.getElementById("newDestLng");
    if (inLat) inLat.value = pos.lat.toFixed(4);
    if (inLng) inLng.value = pos.lng.toFixed(4);
    updateRouteLine();
  });

  updateRouteLine();
  pickerMap.fitBounds([[oLat, oLng], [dLat, dLng]], { padding: [35, 35] });

  // Listener Klik pada Peta untuk meletakkan titik koordinat
  pickerMap.on("click", e => {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;

    if (activePickerMode === "ORIGIN") {
      markerOrigin.setLatLng([lat, lng]);
      const inLat = document.getElementById("newOriginLat");
      const inLng = document.getElementById("newOriginLng");
      if (inLat) inLat.value = lat.toFixed(4);
      if (inLng) inLng.value = lng.toFixed(4);
      updateRouteLine();
      // Otomatis pindah ke mode Titik Tujuan agar user nyaman mengklik titik berikutnya
      setPickerMode("DEST");
    } else {
      markerDest.setLatLng([lat, lng]);
      const inLat = document.getElementById("newDestLat");
      const inLng = document.getElementById("newDestLng");
      if (inLat) inLat.value = lat.toFixed(4);
      if (inLng) inLng.value = lng.toFixed(4);
      updateRouteLine();
    }
  });

  // Listener input manual pada form input teks angka
  ["newOriginLat", "newOriginLng", "newDestLat", "newDestLng"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", () => syncMarkersFromInputs());
    }
  });

  // Listener tombol switch mode & link pick
  const tabO = document.getElementById("tabPickOrigin");
  if (tabO) tabO.addEventListener("click", () => setPickerMode("ORIGIN"));

  const tabD = document.getElementById("tabPickDest");
  if (tabD) tabD.addEventListener("click", () => setPickerMode("DEST"));

  const btnLinkO = document.getElementById("btnPickOriginMode");
  if (btnLinkO) btnLinkO.addEventListener("click", () => setPickerMode("ORIGIN"));

  const btnLinkD = document.getElementById("btnPickDestMode");
  if (btnLinkD) btnLinkD.addEventListener("click", () => setPickerMode("DEST"));

  setPickerMode("ORIGIN");
}

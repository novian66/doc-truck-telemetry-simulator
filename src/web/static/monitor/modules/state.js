/**
 * Monitor State Management Module (ES Module)
 * Mengelola state telemetry consumer, trip aktif, armada, dan buffer chart
 */

import {
  STORAGE_KEYS,
  DEFAULT_EXPEDITIONS,
  DEFAULT_VEHICLES
} from "../../shared/constants.js";

export const liveTruckState = {
  currentIdx: 4,
  elapsedSec: 180,
  speed: 76,
  vibration: 0.08,
  ambientTemp: 34.0,
  solarIrradiance: 850,
  bearingDeg: 270,
  z1_temp: 33.2,
  z2_temp: 34.0,
  z3_temp: 34.6,
  z1_rh: 62.0,
  z2_rh: 59.0,
  z3_rh: 57.0,
  co2_ppm: 1150,
  distanceTraveledKm: 32.5,
  totalDistanceKm: 145.0,
  chillerActive: true,
  rearDoorOpen: false,
  trafficStopActive: false,
  ventilationActive: true
};

export const chartHistory = {
  labels: [],
  z1: [],
  z2: [],
  z3: [],
  ambient: [],
  speed: [],
  vibration: []
};

export let selectedTripId = null;
export let expeditions = [];
export let vehicles = [];
// Cache posisi GPS terakhir armada/trip saat mesin mati / standby
export const lastKnownTruckPositions = {};
export let packetCounter = 0;
export let lastExternalPacketTime = 0;
export let lastNewPacketWallTime = 0;
export let lastPacketSequence = null;
export let lastPacketTimestamp = null;
export let isWsConnected = false;
export let activeChartType = "temp";
export const trailCoords = [];

export function setWsConnected(status) {
  isWsConnected = Boolean(status);
}

export function resetPacketTracking() {
  lastNewPacketWallTime = 0;
  lastPacketSequence = null;
  lastPacketTimestamp = null;
}

export function registerNewPacket(sequence, timestamp) {
  const isNew = (sequence != null && sequence !== lastPacketSequence) ||
                (timestamp != null && timestamp !== lastPacketTimestamp);
  if (isNew) {
    if (sequence != null) lastPacketSequence = sequence;
    if (timestamp != null) lastPacketTimestamp = timestamp;
    lastNewPacketWallTime = Date.now();
  }
  lastExternalPacketTime = Date.now();
  return isNew;
}

export function incrementPacketCounter() {
  packetCounter++;
  return packetCounter;
}

export function setLastExternalPacketTime(ts = Date.now()) {
  lastExternalPacketTime = ts;
}

export function setActiveChartType(type) {
  activeChartType = type;
}

/**
 * Membaca ID ekspedisi dari query parameter URL (?trip=... atau ?trip_id=...)
 */
export function getUrlTripId() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("trip") || params.get("trip_id") || null;
}

/**
 * Menyinkronkan ID ekspedisi aktif ke query parameter URL
 */
export function setUrlTripId(tripId, pushHistory = true) {
  if (typeof window === "undefined" || !tripId) return;
  const url = new URL(window.location);
  if (url.searchParams.get("trip") === tripId) return;
  url.searchParams.set("trip", tripId);
  if (pushHistory) {
    window.history.pushState({ tripId }, "", url);
  } else {
    window.history.replaceState({ tripId }, "", url);
  }
}

export function setSelectedTripId(id, updateUrl = true) {
  selectedTripId = id;
  if (id) {
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_TRIP, id);
    } catch (e) {}
    if (updateUrl) {
      setUrlTripId(id, true);
    }
  }
}

export function getSelectedExpedition() {
  if (!selectedTripId || expeditions.length === 0) return expeditions[0] || null;
  return expeditions.find(e => e.tripId === selectedTripId) || expeditions[0] || null;
}

export function getSelectedVehicle() {
  const exp = getSelectedExpedition();
  if (!exp) return vehicles[0] || { licensePlate: "-", model: "-" };
  return (
    vehicles.find(v => v.truckId === exp.truckId) ||
    vehicles[0] || { licensePlate: "-", model: "-" }
  );
}

/**
 * Memuat data ekspedisi & kendaraan dari LocalStorage
 */
export function loadMonitorData() {
  const eSaved = localStorage.getItem(STORAGE_KEYS.EXPEDITIONS);
  if (eSaved) {
    try {
      const parsed = JSON.parse(eSaved);
      if (Array.isArray(parsed)) {
        expeditions = parsed.filter(e => e.tripId !== "TRIP-20261030-01");
      } else {
        expeditions = [];
      }
    } catch (e) {
      expeditions = [];
    }
  } else {
    expeditions = [];
  }
  localStorage.setItem(STORAGE_KEYS.EXPEDITIONS, JSON.stringify(expeditions));

  // Lengkapi nilai default empiris bila data ekspedisi lama belum memilikinya
  expeditions.forEach(exp => {
    if (!exp.deliveryOrder) exp.deliveryOrder = `DO-CPI-SBG-${exp.tripId.replace("TRIP-", "")}`;
    if (!exp.strain) exp.strain = "Cobb 500";
    if (!exp.averageWeightGrams) exp.averageWeightGrams = 42.0;
    if (!exp.breederAge) exp.breederAge = "Prime (30 - 50 Minggu)";
    if (!exp.gender) exp.gender = "As-Hatched (Campur 50:50)";
    if (!exp.boxType) exp.boxType = "Boks Plastik Berventilasi (Crate)";
    if (!exp.chicksPerBox) exp.chicksPerBox = 100;
    if (!exp.targetRH) exp.targetRH = 65;
    if (!exp.routeType) exp.routeType = "TOLL";
    if (!exp.totalDistanceKm) exp.totalDistanceKm = (exp.routeType === "NON_TOLL" ? 172 : 145);
  });

  const vSaved = localStorage.getItem(STORAGE_KEYS.VEHICLES);
  if (vSaved) {
    try {
      vehicles = JSON.parse(vSaved);
      // Hanya izinkan armada truk yang menggunakan template Audy Joinaldy 2020
      vehicles = vehicles.filter(v => {
        const k = v.templateKey || "";
        const m = (v.model || "").toLowerCase();
        const id = (v.truckId || "").toLowerCase();
        return k === "joinaldy" || m.includes("joinaldy") || m.includes("blower") || id.includes("aj");
      });

      DEFAULT_VEHICLES.forEach(dv => {
        if (!vehicles.some(v => v.truckId === dv.truckId)) {
          vehicles.push(dv);
        }
      });

      vehicles.forEach(v => {
        v.templateKey = "joinaldy";
      });

      if (vehicles.length === 0) {
        vehicles = [...DEFAULT_VEHICLES];
      }
    } catch (e) {
      vehicles = [...DEFAULT_VEHICLES];
    }
  } else {
    vehicles = [...DEFAULT_VEHICLES];
    localStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));
  }
  localStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));

  const urlTrip = getUrlTripId();
  const aSaved = localStorage.getItem(STORAGE_KEYS.ACTIVE_TRIP);
  if (urlTrip && expeditions.some(e => e.tripId === urlTrip)) {
    selectedTripId = urlTrip;
  } else if (aSaved && expeditions.some(e => e.tripId === aSaved)) {
    selectedTripId = aSaved;
    setUrlTripId(selectedTripId, false);
  } else if (expeditions.length > 0) {
    selectedTripId = expeditions[0].tripId;
    setUrlTripId(selectedTripId, false);
  }
}

/**
 * Sinkronisasi daftar ekspedisi dari database backend FastAPI
 */
export async function syncMonitorFromBackend() {
  try {
    const res = await fetch("/api/v1/simulation/trips");
    if (res.ok) {
      const data = await res.json();
      if (data && data.trips && Array.isArray(data.trips)) {
        expeditions = data.trips.map(st => ({
          tripId: st.trip_id,
          routeId: st.route_id,
          deliveryOrder: st.delivery_order || `DO-CPI-SBG-${st.trip_id.replace("TRIP-", "")}`,
          title: st.title || `Dispatch ${st.origin_name || "Origin"} to ${st.destination_name || "Destination"} (${st.truck_id})`,
          routeType: (st.route_type && st.route_type.includes("NON_TOLL")) || (st.route_id && st.route_id.includes("NON_TOLL")) ? "NON_TOLL" : "TOLL",
          totalDistanceKm: st.total_distance_km || 145.0,
          truckId: st.truck_id,
          driverName: st.driver_name,
          strain: st.cargo_strain,
          averageWeightGrams: st.average_weight_g,
          quantity: st.cargo_quantity,
          boxType: st.box_type,
          chicksPerBox: st.chicks_per_box,
          departureDate: st.departure_date || (st.created_at ? st.created_at.slice(0, 10) : "2026-10-31"),
          departureTime: st.departure_time,
          weather: st.weather,
          status: st.status || "SCHEDULED"
        }));
        localStorage.setItem(STORAGE_KEYS.EXPEDITIONS, JSON.stringify(expeditions));

        // Prioritas penentuan selectedTripId:
        // 1. URL Query Parameter (?trip=...)
        // 2. Trip yang sedang aktif dipilih sebelumnya (jika masih valid)
        // 3. Trip berstatus RUNNING
        // 4. Trip pertama yang tersedia
        const urlTripId = getUrlTripId();
        if (urlTripId && expeditions.some(e => e.tripId === urlTripId)) {
          selectedTripId = urlTripId;
        } else if (selectedTripId && expeditions.some(e => e.tripId === selectedTripId)) {
          setUrlTripId(selectedTripId, false);
        } else {
          const running = expeditions.find(e => e.status === "RUNNING");
          selectedTripId = running ? running.tripId : (expeditions[0]?.tripId || null);
          if (selectedTripId) setUrlTripId(selectedTripId, false);
        }
      }
    }

    // Sinkronkan data armada dan posisi terakhir langsung dari database backend
    const vRes = await fetch("/api/v1/simulation/vehicles");
    if (vRes.ok) {
      const vData = await vRes.json();
      if (vData && vData.vehicles && Array.isArray(vData.vehicles)) {
        vehicles = vData.vehicles.map(v => ({
          truckId: v.truck_id,
          licensePlate: v.plate_number,
          model: v.model_name || "Truk Modifikasi Blower Tropis",
          templateKey: v.template_key || "joinaldy",
          status: v.status,
          lastLatitude: v.last_latitude,
          lastLongitude: v.last_longitude,
          lastLocationName: v.last_location_name,
          lastSpeedKmh: v.last_speed_kmh,
          headingDeg: v.heading_deg,
          activeTripId: v.active_trip_id
        }));
        localStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));

        // Sinkronkan cache posisi terakhir armada
        vehicles.forEach(v => {
          if (v.lastLatitude != null && v.lastLongitude != null) {
            const pos = {
              lat: v.lastLatitude,
              lng: v.lastLongitude,
              heading: v.headingDeg || 0,
              locationName: v.lastLocationName || ""
            };
            lastKnownTruckPositions[v.truckId] = pos;
            if (v.activeTripId) {
              lastKnownTruckPositions[v.activeTripId] = pos;
            }
          }
        });
      }
    }
  } catch (err) {
    console.warn("syncMonitorFromBackend error:", err);
  }
}

"""
Indonesian National Arterial Corridors & Dynamic Waypoints Selection
Provides curated national road (Jalan Nasional / Arteri Non-Tol) waypoints
and geometric corridor selection to bypass toll highways in dynamic routing.
"""

import math
from typing import List, Tuple

# Curated National Arterial Road Nodes (Jalan Nasional Non-Tol)
# Format: (name, longitude, latitude)
ARTERIAL_NODES: List[Tuple[str, float, float]] = [
    # --- 1. Pantura West (Banten - Jabodetabek - West Java) ---
    ("Merak", 106.0020, -5.9320),
    ("Cilegon Arteri", 106.0480, -6.0170),
    ("Serang Arteri", 106.1550, -6.1130),
    ("Balaraja Arteri", 106.4630, -6.1950),
    ("Tangerang Arteri", 106.6320, -6.1780),
    ("Bekasi Arteri", 106.9990, -6.2380),
    ("Karawang Arteri", 107.3060, -6.3050),
    ("Cikampek Arteri", 107.4580, -6.4050),
    ("Pamanukan Arteri", 107.8100, -6.2840),
    ("Kandanghaur", 108.0830, -6.3330),
    ("Jatibarang", 108.3140, -6.4740),
    ("Cirebon Arteri", 108.5570, -6.7320),
    ("Losari Arteri", 108.7990, -6.8480),

    # --- 2. Pantura Central (Central Java) ---
    ("Brebes Arteri", 109.0430, -6.8710),
    ("Tegal Arteri", 109.1330, -6.8660),
    ("Pemalang Arteri", 109.3820, -6.8920),
    ("Pekalongan Arteri", 109.6750, -6.8880),
    ("Batang Arteri", 109.7300, -6.9050),
    ("Weleri Arteri", 110.0650, -6.9720),
    ("Kendal Arteri", 110.2040, -6.9230),
    ("Semarang Arteri", 110.4200, -6.9930),
    ("Demak Arteri", 110.6380, -6.8940),
    ("Kudus Arteri", 110.8430, -6.8050),
    ("Pati Arteri", 111.0380, -6.7550),
    ("Rembang Arteri", 111.3440, -6.7080),

    # --- 3. Pantura East (East Java) ---
    ("Tuban Arteri", 112.0620, -6.8970),
    ("Babat Arteri", 112.1640, -7.1120),
    ("Lamongan Arteri", 112.4140, -7.1190),
    ("Gresik Arteri", 112.6550, -7.1590),
    ("Surabaya Arteri", 112.7520, -7.2570),
    ("Sidoarjo Arteri", 112.7170, -7.4470),
    ("Bangil Arteri", 112.7980, -7.6020),
    ("Pasuruan Arteri", 112.9080, -7.6470),
    ("Probolinggo Arteri", 113.2160, -7.7540),
    ("Kraksaan Arteri", 113.4330, -7.7600),
    ("Paiton", 113.5480, -7.7120),
    ("Besuki", 113.6890, -7.7380),
    ("Situbondo Arteri", 114.0060, -7.7060),
    ("Asembagus", 114.2250, -7.7540),
    ("Ketapang Banyuwangi", 114.3980, -8.1460),
    ("Banyuwangi Kota", 114.3660, -8.2190),

    # --- 4. West Java Arterial Corridor (Subang - Purwakarta - Jonggol - Bogor) ---
    ("Subang Kota", 107.7600, -6.5650),
    ("Kalijati", 107.6760, -6.5330),
    ("Campaka Arteri", 107.4850, -6.5150),
    ("Sadang Arteri", 107.4430, -6.5450),
    ("Cipeundeuy", 107.3480, -6.5290),
    ("Cariu", 107.1260, -6.5210),
    ("Jonggol Arteri", 107.0540, -6.4670),
    ("Cileungsi Arteri", 106.9610, -6.3980),
    ("Cibinong Arteri", 106.8530, -6.4820),
    ("Bogor Kota", 106.7990, -6.5980),

    # --- 5. Southern / Central Java Arterial Corridor (Bandung - Jogja - Solo - Madiun) ---
    ("Bandung Timur", 107.6850, -6.9380),
    ("Garut Arteri", 107.9040, -7.2180),
    ("Tasikmalaya Arteri", 108.2200, -7.3270),
    ("Ciamis Arteri", 108.3530, -7.3270),
    ("Banjar Arteri", 108.5360, -7.3710),
    ("Majenang Arteri", 108.7610, -7.2970),
    ("Wangon Arteri", 109.0530, -7.5250),
    ("Buntu Banyumas", 109.2800, -7.5750),
    ("Kebumen Arteri", 109.6680, -7.6700),
    ("Purworejo Arteri", 110.0100, -7.7140),
    ("Yogyakarta Arteri", 110.3700, -7.7950),
    ("Klaten Arteri", 110.6030, -7.7050),
    ("Boyolali Arteri", 110.5950, -7.5340),
    ("Solo Arteri", 110.8280, -7.5690),
    ("Sragen Arteri", 111.0220, -7.4280),
    ("Ngawi Arteri", 111.4460, -7.4040),
    ("Caruban Arteri", 111.6580, -7.5020),
    ("Nganjuk Arteri", 111.9030, -7.6050),
    ("Kertosono Arteri", 112.1000, -7.5900),
    ("Jombang Arteri", 112.2330, -7.5460),
    ("Mojokerto Arteri", 112.4340, -7.4720),
    ("Krian Arteri", 112.5800, -7.4100),

    # --- 6. East Java Southern Corridor (Malang - Blitar - Jember) ---
    ("Pandaan Arteri", 112.6880, -7.6520),
    ("Lawang Arteri", 112.6950, -7.8340),
    ("Singosari Arteri", 112.6650, -7.8920),
    ("Malang Arteri", 112.6320, -7.9830),
    ("Kepanjen Arteri", 112.5710, -8.1310),
    ("Blitar Arteri", 112.1680, -8.0980),
    ("Tulungagung Arteri", 111.9030, -8.0650),
    ("Trenggalek Arteri", 111.7140, -8.0500),
    ("Ponorogo Arteri", 111.4670, -7.8690),
    ("Lumajang Arteri", 113.2240, -8.1330),
    ("Jember Arteri", 113.7020, -8.1720),
    ("Genteng Banyuwangi", 114.1530, -8.3630),

    # --- 7. Sumatra Arterial Highway (Lintas Timur & Tengah) ---
    ("Bakauheni", 105.7530, -5.8710),
    ("Kalianda", 105.5880, -5.7330),
    ("Bandar Lampung Arteri", 105.2660, -5.4290),
    ("Terbanggi Besar", 105.2030, -4.8720),
    ("Tulang Bawang", 105.2500, -4.4320),
    ("Mesuji", 105.3900, -4.0150),
    ("Kayu Agung", 104.8390, -3.3930),
    ("Palembang Arteri", 104.7560, -2.9900),
    ("Betung", 104.1480, -2.6960),
    ("Jambi Kota", 103.6130, -1.6100),
    ("Pekanbaru Arteri", 101.4470, 0.5070),
    ("Dumai", 101.4470, 1.6700),
    ("Medan Arteri", 98.6720, 3.5950),
    ("Binjai", 98.4850, 3.6000),
    ("Banda Aceh", 95.3230, 5.5480),
]


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate Great-Circle distance in kilometers between two points."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2.0) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2.0) ** 2)
    return 2.0 * R * math.asin(math.sqrt(max(0.0, min(1.0, a))))


def select_arterial_waypoints(
    origin_lng: float,
    origin_lat: float,
    dest_lng: float,
    dest_lat: float,
    max_waypoints: int = 16
) -> List[Tuple[float, float, str]]:
    """
    Selects ordered intermediate national road (arterial non-toll) waypoints
    between origin and destination coordinates.

    Uses vector projection and orthogonal distance thresholding to dynamically
    identify relevant highway corridor waypoints in the exact travel sequence.
    Returns: List of (longitude, latitude, waypoint_name)
    """
    direct_dist = haversine_km(origin_lat, origin_lng, dest_lat, dest_lng)
    
    # If points are very close (< 20 km), direct routing suffices
    if direct_dist < 20.0:
        return []

    # Dynamic corridor width: tighter for short trips, wider for continental trips
    max_perp_km = min(55.0, max(22.0, direct_dist * 0.22))
    # Minimum spacing between waypoints to avoid cluttering and URL overflow
    min_spacing_km = min(45.0, max(16.0, direct_dist / 14.0))

    dx = dest_lng - origin_lng
    dy = dest_lat - origin_lat
    mag_sq = dx ** 2 + dy ** 2
    if mag_sq < 1e-8:
        return []

    candidates = []
    for name, lng, lat in ARTERIAL_NODES:
        px = lng - origin_lng
        py = lat - origin_lat
        
        # Projection factor t along travel vector (0 = origin, 1 = dest)
        t = (px * dx + py * dy) / mag_sq
        
        # Only select waypoints strictly between origin and destination
        if 0.04 < t < 0.96:
            proj_x = origin_lng + t * dx
            proj_y = origin_lat + t * dy
            mid_lat = (lat + proj_y) / 2.0
            
            # Approximate orthogonal distance in km
            dist_perp = math.hypot(
                (lng - proj_x) * 111.0 * math.cos(math.radians(mid_lat)),
                (lat - proj_y) * 111.0
            )
            
            if dist_perp <= max_perp_km:
                candidates.append((t, dist_perp, lng, lat, name))

    # Sort strictly by travel sequence along vector
    candidates.sort(key=lambda x: x[0])

    # Decimate by spacing
    result: List[Tuple[float, float, str]] = []
    last_lng, last_lat = origin_lng, origin_lat
    for t, dist_perp, lng, lat, name in candidates:
        step_km = haversine_km(last_lat, last_lng, lat, lng)
        rem_km = haversine_km(lat, lng, dest_lat, dest_lng)
        if step_km >= min_spacing_km and rem_km >= (min_spacing_km * 0.5):
            result.append((round(lng, 4), round(lat, 4), name))
            last_lng, last_lat = lng, lat

    # Enforce maximum waypoints cap to prevent URL overflow
    if len(result) > max_waypoints:
        step = len(result) / float(max_waypoints)
        result = [result[int(i * step)] for i in range(max_waypoints)]

    return result

"""
FastAPI Main Web Application
Mengintegrasikan REST API, WebSocket Broadcaster, Static Files, dan Simulator Runner.
"""

from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, FileResponse
from src.web.routes import simulation, fleet, routes_api, export
from src.web.ws.broadcaster import broadcaster

BASE_DIR = Path(__file__).resolve().parent.parent.parent
STATIC_DIR = Path(__file__).resolve().parent / "static"

app = FastAPI(
    title="Simulator Telemetri Truk DOC API",
    description="Backend FastAPI Simulator Telemetri Rantai Dingin DOC, 25-Field Payload, OSRM Routing & WebSocket 1 Hz",
    version="2.0.0"
)

# CORS Middleware agar bisa diakses oleh Postman, frontend web, atau eksternal client
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrasi Router REST API
app.include_router(simulation.router)
app.include_router(fleet.router)
app.include_router(routes_api.router)
app.include_router(export.router)

@app.on_event("startup")
async def startup_event():
    """Resume simulasi pengiriman yang sedang berstatus RUNNING saat restart"""
    from src.simulation.core.manager import simulation_manager
    try:
        trips = simulation_manager.db.get_trips()
        running_trips = [t for t in trips if t.get("status") == "RUNNING"]
        for t in running_trips:
            simulation_manager.start(t["trip_id"])
            print(f"🚀 [Startup] Simulasi trip {t['trip_id']} otomatis di-resume.")
    except Exception as e:
        print(f"Error resuming active simulations on startup: {e}")

# Mount Folder Statis (CSS, JS, Peta, Gambar, Assets, Shared)
if (STATIC_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

if (STATIC_DIR / "shared").exists():
    app.mount("/shared", StaticFiles(directory=str(STATIC_DIR / "shared")), name="shared")

if (STATIC_DIR / "config").exists():
    app.mount("/config", StaticFiles(directory=str(STATIC_DIR / "config"), html=True), name="config")

if (STATIC_DIR / "monitor").exists():
    app.mount("/monitor", StaticFiles(directory=str(STATIC_DIR / "monitor"), html=True), name="monitor")

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# WebSocket Endpoint untuk Streaming Telemetri Real-Time (1 Hz)
@app.websocket("/ws/telemetry")
async def websocket_telemetry_all(websocket: WebSocket):
    """WebSocket endpoint umum: menyiarkan telemetri seluruh armada aktif"""
    await broadcaster.connect(websocket, trip_id="all")
    try:
        while True:
            # Terima pesan keepalive ping dari client jika ada
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        broadcaster.disconnect(websocket, trip_id="all")

@app.websocket("/ws/telemetry/{trip_id}")
async def websocket_telemetry_trip(websocket: WebSocket, trip_id: str):
    """WebSocket endpoint khusus: menyiarkan telemetri trip_id tertentu"""
    await broadcaster.connect(websocket, trip_id=trip_id)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        broadcaster.disconnect(websocket, trip_id=trip_id)

# Favicon Endpoints
@app.get("/favicon.ico", include_in_schema=False)
async def favicon_ico():
    ico_file = STATIC_DIR / "favicon.ico"
    if ico_file.exists():
        return FileResponse(ico_file, media_type="image/x-icon")
    return RedirectResponse(url="/static/favicon.ico")

@app.get("/favicon.svg", include_in_schema=False)
async def favicon_svg():
    svg_file = STATIC_DIR / "favicon.svg"
    if svg_file.exists():
        return FileResponse(svg_file, media_type="image/svg+xml")
    return RedirectResponse(url="/static/favicon.svg")

@app.get("/apple-touch-icon.png", include_in_schema=False)
async def apple_touch_icon():
    png_file = STATIC_DIR / "apple-touch-icon.png"
    if png_file.exists():
        return FileResponse(png_file, media_type="image/png")
    return RedirectResponse(url="/static/apple-touch-icon.png")

# Frontend Root Redirect ke /monitor/
@app.get("/", include_in_schema=False)
def root_index():
    return RedirectResponse(url="/monitor/")

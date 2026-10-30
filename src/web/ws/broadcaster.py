"""
WebSocket Broadcaster Hub
Mengelola koneksi klien WebSocket duplex 1.0 Hz dan menyiarkan payload telemetri real-time.
Mendukung filter berdasarkan trip_id atau penyiaran broadcast ke semua klien.
"""

import json
from typing import List, Dict, Set, Optional
from fastapi import WebSocket

class WebSocketBroadcaster:
    def __init__(self):
        # Map: trip_id -> set of active WebSockets
        self.trip_connections: Dict[str, Set[WebSocket]] = {}
        # Klien umum yang mendengarkan semua stream (/ws/telemetry/all atau /ws/telemetry)
        self.global_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket, trip_id: Optional[str] = None):
        await websocket.accept()
        if trip_id and trip_id.lower() != "all":
            if trip_id not in self.trip_connections:
                self.trip_connections[trip_id] = set()
            self.trip_connections[trip_id].add(websocket)
        else:
            self.global_connections.add(websocket)

    def disconnect(self, websocket: WebSocket, trip_id: Optional[str] = None):
        if trip_id and trip_id in self.trip_connections:
            self.trip_connections[trip_id].discard(websocket)
            if not self.trip_connections[trip_id]:
                del self.trip_connections[trip_id]
        self.global_connections.discard(websocket)

    async def broadcast_payload(self, trip_id: str, payload_dict: Dict):
        """Menyiarkan payload ke klien trip tersebut dan klien global"""
        msg_text = json.dumps(payload_dict)

        # 1. Kirim ke klien khusus trip_id
        if trip_id in self.trip_connections:
            dead_sockets = []
            for ws in list(self.trip_connections[trip_id]):
                try:
                    await ws.send_text(msg_text)
                except Exception:
                    dead_sockets.append(ws)
            for ws in dead_sockets:
                self.disconnect(ws, trip_id)

        # 2. Kirim ke klien global
        dead_global = []
        for ws in list(self.global_connections):
            try:
                await ws.send_text(msg_text)
            except Exception:
                dead_global.append(ws)
        for ws in dead_global:
            self.global_connections.discard(ws)

broadcaster = WebSocketBroadcaster()

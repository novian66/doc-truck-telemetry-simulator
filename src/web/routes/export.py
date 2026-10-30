"""
Data Logging & Export REST API Routes
Sesuai spesifikasi api_and_websocket_spec.md §2.5
"""

import os
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from src.storage.jsonl_logger import JSONLLogger

router = APIRouter(prefix="/api/v1/simulation/export", tags=["Data Export"])

@router.get("/jsonl")
def export_telemetry_jsonl(trip_id: str):
    """Mengunduh seluruh riwayat telemetri perjalanan aktif dalam format berkas .jsonl"""
    logger = JSONLLogger(trip_id)
    file_path = logger.get_telemetry_file_path()

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Berkas telemetri untuk trip {trip_id} belum terbentuk.")

    return FileResponse(
        path=file_path,
        media_type="application/x-ndjson",
        filename=f"telemetry_{trip_id}.jsonl"
    )

@router.get("/ground-truth")
def export_ground_truth_jsonl(trip_id: str):
    """Mengunduh log ground-truth murni pembanding evaluasi riset"""
    logger = JSONLLogger(trip_id)
    file_path = logger.get_ground_truth_file_path()

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Berkas ground-truth untuk trip {trip_id} belum terbentuk.")

    return FileResponse(
        path=file_path,
        media_type="application/x-ndjson",
        filename=f"ground_truth_{trip_id}.jsonl"
    )

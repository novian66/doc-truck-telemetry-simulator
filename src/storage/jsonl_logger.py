"""
JSON Lines (JSONL) Telemetry & Ground Truth Logger
Sesuai spesifikasi database_and_storage_spec.md
Menyimpan aliran data sensor per 10 detik secara append-only O(1).
"""

import json
from pathlib import Path
from typing import Dict, Any, Generator, Optional

class JSONLLogger:
    def __init__(self, trip_id: str, data_dir: Optional[Path] = None):
        self.trip_id = trip_id
        if data_dir is None:
            data_dir = Path(__file__).resolve().parent.parent.parent / "data" / "trips"
        self.data_dir = data_dir
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
        self.telemetry_file = self.data_dir / f"telemetry_{self.trip_id}.jsonl"
        self.ground_truth_file = self.data_dir / f"ground_truth_{self.trip_id}.jsonl"

    def log_telemetry(self, payload: Dict[str, Any]):
        """Append satu baris payload telemetri (plain text JSONL)"""
        line = json.dumps(payload, separators=(',', ':')) + "\n"
        with open(self.telemetry_file, "a", encoding="utf-8") as f:
            f.write(line)

    def log_ground_truth(self, gt_data: Dict[str, Any]):
        """Append satu baris log ground truth pembanding"""
        line = json.dumps(gt_data, separators=(',', ':')) + "\n"
        with open(self.ground_truth_file, "a", encoding="utf-8") as f:
            f.write(line)

    def read_telemetry_lines(self) -> Generator[Dict[str, Any], None, None]:
        """Stream membaca berkas baris demi baris"""
        if not self.telemetry_file.exists():
            return
        with open(self.telemetry_file, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    yield json.loads(line)

    def get_telemetry_file_path(self) -> str:
        return str(self.telemetry_file)

    def get_ground_truth_file_path(self) -> str:
        return str(self.ground_truth_file)

    def get_file_size_bytes(self) -> int:
        if self.telemetry_file.exists():
            return self.telemetry_file.stat().st_size
        return 0

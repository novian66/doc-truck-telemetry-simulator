"""
Canonical SHA-256 Hasher Module
Sesuai spesifikasi telemetry_data_schema.json blok security
Menghasilkan rantai integritas kriptografis (hash chain) SHA-256 berurutan.
"""

import json
import hashlib
from typing import Dict, Any

class CanonicalHasher:
    def __init__(self, initial_prev_hash: str = "0" * 64):
        self.prev_hash = initial_prev_hash

    def compute_hash(self, payload_dict: Dict[str, Any]) -> str:
        """
        Menghitung SHA-256 atas representasi kanonikal payload.
        Field payload_hash_sha256 dikecualikan saat hashing.
        """
        # Salin data tanpa field hash itu sendiri
        hashable = {k: v for k, v in payload_dict.items() if k != "payload_hash_sha256"}
        
        # Pastikan previous_hash_sha256 terisi
        hashable["previous_hash_sha256"] = self.prev_hash

        # Serialisasi kanonikal: sort_keys=True, tanpa spasi
        canonical_json = json.dumps(hashable, sort_keys=True, separators=(',', ':'), ensure_ascii=True)
        digest = hashlib.sha256(canonical_json.encode('utf-8')).hexdigest()
        
        self.prev_hash = digest
        return digest

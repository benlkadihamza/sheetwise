"""
Physical file storage manager for Sheetwise.
Ensures UUID-based safe storage paths, atomic file writes, snapshot JSONs,
and layout exports without path traversal risks.
"""

from __future__ import annotations

import io
import json
import os
import re
import tempfile
from typing import Any, Dict, Optional, Tuple

from .report import generate_pdf_report


UUID_REGEX = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def validate_uuid(value: Optional[str]) -> bool:
    if not value or not isinstance(value, str):
        return False
    return bool(UUID_REGEX.match(value.strip()))


def get_base_storage_dir() -> str:
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.environ.get("SHEETWISE_STORAGE_DIR", os.path.join(base_dir, "storage"))


def safe_atomic_write(target_path: str, content: bytes) -> None:
    """Safely writes content to a file atomically via a temporary file."""
    target_dir = os.path.dirname(os.path.abspath(target_path))
    os.makedirs(target_dir, exist_ok=True)

    # Create temporary file in the same directory to ensure atomic rename
    fd, tmp_file = tempfile.mkstemp(dir=target_dir, prefix="tmp_sw_")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        # Replace atomically
        os.replace(tmp_file, target_path)
    except Exception:
        if os.path.exists(tmp_file):
            try:
                os.remove(tmp_file)
            except OSError:
                pass
        raise


class StorageManager:
    def __init__(self, base_storage_dir: Optional[str] = None):
        self.base_dir = os.path.abspath(base_storage_dir or get_base_storage_dir())
        os.makedirs(self.base_dir, exist_ok=True)

    def _resolve_safe_path(self, rel_path: str) -> str:
        # Prevent path traversal
        norm_rel = os.path.normpath(rel_path.strip().lstrip("/\\"))
        abs_path = os.path.abspath(os.path.join(self.base_dir, norm_rel))
        if not abs_path.startswith(self.base_dir + os.sep) and abs_path != self.base_dir:
            raise ValueError(f"Unsafe storage path detected: {rel_path}")
        return abs_path

    def get_storage_relative_path(self, record_type: str, record_id: str,
                                  customer_id: Optional[str] = None,
                                  project_id: Optional[str] = None) -> str:
        """
        Calculates canonical relative directory:
        - Project: customers/{customer_uuid}/projects/{project_uuid}/
        - Quick cut assigned: customers/{customer_uuid}/quick-cuts/{record_uuid}/
        - Quick cut unassigned: quick-cuts/{record_uuid}/
        """
        if not validate_uuid(record_id):
            raise ValueError("Invalid record_id UUID")

        if record_type == "project":
            if not validate_uuid(customer_id) or not validate_uuid(project_id):
                raise ValueError("Valid customer_id and project_id are required for project storage")
            return os.path.join("customers", customer_id, "projects", project_id)
        elif record_type == "quick":
            if customer_id and validate_uuid(customer_id):
                return os.path.join("customers", customer_id, "quick-cuts", record_id)
            else:
                return os.path.join("quick-cuts", record_id)
        else:
            raise ValueError(f"Unknown record_type: {record_type}")

    def save_cutting_record_files(self, record_type: str, record_id: str,
                                  cutting_data: Dict[str, Any],
                                  customer_id: Optional[str] = None,
                                  project_id: Optional[str] = None,
                                  project_meta: Optional[Dict[str, Any]] = None) -> str:
        """
        Saves snapshot files atomically to storage:
        - cutting-data.json
        - project.json (if project)
        - layout.pdf (if reportlab is available and result exists)
        Returns the relative storage directory path.
        """
        rel_dir = self.get_storage_relative_path(record_type, record_id, customer_id, project_id)
        abs_dir = self._resolve_safe_path(rel_dir)
        os.makedirs(abs_dir, exist_ok=True)

        # 1. Save cutting-data.json
        data_bytes = json.dumps(cutting_data, indent=2).encode("utf-8")
        safe_atomic_write(os.path.join(abs_dir, "cutting-data.json"), data_bytes)

        # 2. Save project.json if project
        if record_type == "project" and project_meta:
            meta_bytes = json.dumps(project_meta, indent=2).encode("utf-8")
            safe_atomic_write(os.path.join(abs_dir, "project.json"), meta_bytes)

        # 3. Generate and save layout.pdf if possible
        try:
            parts = cutting_data.get("parts", [])
            result = cutting_data.get("result", {})
            kerf = float(cutting_data.get("kerf", 0.4))
            if result and result.get("sheets"):
                bio = io.BytesIO()
                generate_pdf_report(result, parts, kerf, bio)
                pdf_bytes = bio.getvalue()
                if pdf_bytes:
                    safe_atomic_write(os.path.join(abs_dir, "layout.pdf"), pdf_bytes)
        except Exception as e:
            # layout.pdf failure shouldn't fail saving the cutting data
            pass

        return rel_dir

    def load_cutting_data_json(self, rel_dir: str) -> Optional[Dict[str, Any]]:
        abs_dir = self._resolve_safe_path(rel_dir)
        file_path = os.path.join(abs_dir, "cutting-data.json")
        if not os.path.isfile(file_path):
            return None
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)

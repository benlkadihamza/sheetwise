"""
ProjectDataAdapter integration layer.
Exports and restores cutting engine state, ensuring total preservation of the cutting algorithms.
"""

from __future__ import annotations

import copy
from typing import Any, Dict, List, Optional


class ProjectDataAdapter:
    """
    Adapter between the cutting engine interface and the customer/project storage backend.
    Preserves exact input format (stock, parts, kerf, rotate) and computed outputs (layouts, stats, unplaced).
    """

    @staticmethod
    def export_cutting_state(
        parts: List[Dict[str, Any]],
        stock: List[Dict[str, Any]],
        kerf: float,
        rotate: bool,
        result: Optional[Dict[str, Any]] = None,
        custom_layout: Optional[Any] = None,
        unit: str = "cm",
        meta: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Exports the entire state of the wood cutting session to a JSON-serializable dictionary.
        """
        payload: Dict[str, Any] = {
            "version": "1.0.0",
            "unit": unit,
            "kerf": float(kerf),
            "rotate": bool(rotate),
            "stock": copy.deepcopy(stock),
            "parts": copy.deepcopy(parts),
            "result": copy.deepcopy(result) if result else None,
            "custom_layout": copy.deepcopy(custom_layout) if custom_layout else None,
            "meta": copy.deepcopy(meta) if meta else {},
        }
        return payload

    @staticmethod
    def restore_cutting_state(data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validates and extracts cutting engine state from a stored payload.
        Ensures types and dimensions are safely typed.
        """
        if not isinstance(data, dict):
            raise ValueError("Cutting data must be a dictionary")

        stock = []
        for s in data.get("stock", []):
            if isinstance(s, dict):
                stock.append({
                    "label": str(s.get("label", "Stock sheet")),
                    "w": float(s.get("w", 0)),
                    "h": float(s.get("h", 0)),
                })

        parts = []
        for p in data.get("parts", []):
            if isinstance(p, dict):
                edges = p.get("edges", {})
                if not isinstance(edges, dict):
                    edges = {}
                parts.append({
                    "label": str(p.get("label", "Part")),
                    "w": float(p.get("w", 0)),
                    "h": float(p.get("h", 0)),
                    "qty": p.get("qty", 1),
                    "edges": {
                        "top": bool(edges.get("top", False)),
                        "bottom": bool(edges.get("bottom", False)),
                        "left": bool(edges.get("left", False)),
                        "right": bool(edges.get("right", False)),
                    },
                    "allowRotate": bool(p.get("allowRotate", data.get("rotate", False)))
                })

        return {
            "unit": data.get("unit", "cm"),
            "kerf": float(data.get("kerf", 0.4)),
            "rotate": bool(data.get("rotate", False)),
            "stock": stock,
            "parts": parts,
            "result": data.get("result"),
            "custom_layout": data.get("custom_layout"),
            "meta": data.get("meta", {}),
        }

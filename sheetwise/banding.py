from __future__ import annotations

from typing import Any, Dict, Iterable, Union
from .models import EdgeBanding, Part


def banding_length(p: Union[Part, Dict[str, Any]]) -> float:
    """Calculate the total banded perimeter length for a single piece in cm."""
    if isinstance(p, Part):
        w = p.w
        h = p.h
        edges = p.edges
        top = edges.top
        bottom = edges.bottom
        left = edges.left
        right = edges.right
    elif isinstance(p, dict):
        w = float(p.get("w") or 0)
        h = float(p.get("h") or 0)
        edges = p.get("edges") or {}
        if isinstance(edges, EdgeBanding):
            top = edges.top
            bottom = edges.bottom
            left = edges.left
            right = edges.right
        elif isinstance(edges, dict):
            top = bool(edges.get("top", False))
            bottom = bool(edges.get("bottom", False))
            left = bool(edges.get("left", False))
            right = bool(edges.get("right", False))
        else:
            top = bottom = left = right = False
    else:
        w = getattr(p, "w", 0)
        h = getattr(p, "h", 0)
        edges = getattr(p, "edges", None)
        top = getattr(edges, "top", False) if edges else False
        bottom = getattr(edges, "bottom", False) if edges else False
        left = getattr(edges, "left", False) if edges else False
        right = getattr(edges, "right", False) if edges else False

    total = 0.0
    if top:
        total += w
    if bottom:
        total += w
    if left:
        total += h
    if right:
        total += h
    return total


def banding_total(parts: Iterable[Union[Part, Dict[str, Any]]]) -> float:
    """Calculate the total edge banding length across all requested parts and quantities in cm."""
    total = 0.0
    for p in parts:
        raw_q = p.qty if isinstance(p, Part) else (p.get("qty", 1) if isinstance(p, dict) else getattr(p, "qty", 1))
        qty = 1 if raw_q == "" or raw_q is None else int(raw_q)
        total += banding_length(p) * qty
    return total


# Backwards compatibility camelCase aliases matching JavaScript exports
bandingLength = banding_length
bandingTotal = banding_total

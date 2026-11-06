from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional, Union


@dataclass
class EdgeBanding:
    top: bool = False
    bottom: bool = False
    left: bool = False
    right: bool = False

    @classmethod
    def from_dict(cls, data: Optional[Dict[str, Any]]) -> "EdgeBanding":
        if not data:
            return cls()
        return cls(
            top=bool(data.get("top", False)),
            bottom=bool(data.get("bottom", False)),
            left=bool(data.get("left", False)),
            right=bool(data.get("right", False)),
        )

    def to_dict(self) -> Dict[str, bool]:
        return {
            "top": self.top,
            "bottom": self.bottom,
            "left": self.left,
            "right": self.right,
        }


@dataclass
class Part:
    w: float
    h: float
    qty: int = 1
    label: str = "Part"
    allow_rotate: Optional[bool] = None
    edges: EdgeBanding = field(default_factory=EdgeBanding)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Part":
        edges_data = data.get("edges")
        edges = EdgeBanding.from_dict(edges_data) if isinstance(edges_data, dict) else EdgeBanding()
        # Handle allowRotate (camelCase) or allow_rotate (snake_case)
        allow_rotate = data.get("allowRotate")
        if allow_rotate is None:
            allow_rotate = data.get("allow_rotate")
        return cls(
            w=float(data["w"]),
            h=float(data["h"]),
            qty=int(data.get("qty", 1)),
            label=str(data.get("label", "Part")),
            allow_rotate=allow_rotate,
            edges=edges,
            metadata={k: v for k, v in data.items() if k not in {"w", "h", "qty", "label", "allowRotate", "allow_rotate", "edges"}},
        )

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "w": self.w,
            "h": self.h,
            "qty": self.qty,
            "label": self.label,
        }
        if self.allow_rotate is not None:
            d["allowRotate"] = self.allow_rotate
            d["allow_rotate"] = self.allow_rotate
        if self.edges.top or self.edges.bottom or self.edges.left or self.edges.right:
            d["edges"] = self.edges.to_dict()
        d.update(self.metadata)
        return d


@dataclass
class Stock:
    w: float
    h: float
    qty: Optional[int] = None
    label: str = "Stock sheet"
    metadata: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Stock":
        qty = data.get("qty")
        return cls(
            w=float(data["w"]),
            h=float(data["h"]),
            qty=int(qty) if qty is not None else None,
            label=str(data.get("label", "Stock sheet")),
            metadata={k: v for k, v in data.items() if k not in {"w", "h", "qty", "label"}},
        )

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "w": self.w,
            "h": self.h,
            "label": self.label,
        }
        if self.qty is not None:
            d["qty"] = self.qty
        d.update(self.metadata)
        return d


@dataclass
class Piece:
    x: float
    y: float
    w: float
    h: float
    turn: bool = False
    label: str = ""
    group_id: int = 0
    id: str = ""
    color: int = 0
    edges: Optional[Dict[str, bool]] = None
    allow_rotate: Optional[bool] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "x": self.x,
            "y": self.y,
            "w": self.w,
            "h": self.h,
            "turn": self.turn,
            "label": self.label,
            "groupId": self.group_id,
            "group_id": self.group_id,
            "id": self.id,
            "color": self.color,
        }
        if self.edges is not None:
            d["edges"] = self.edges
        if self.allow_rotate is not None:
            d["allowRotate"] = self.allow_rotate
            d["allow_rotate"] = self.allow_rotate
        d.update(self.metadata)
        return d

    def __getitem__(self, item: str) -> Any:
        return self.to_dict()[item]


@dataclass
class FreeRect:
    x: float
    y: float
    w: float
    h: float

    def to_dict(self) -> Dict[str, float]:
        return {"x": self.x, "y": self.y, "w": self.w, "h": self.h}

    def __getitem__(self, item: str) -> float:
        return getattr(self, item)


@dataclass
class SheetLayout:
    w: float
    h: float
    label: str = "Stock sheet"
    pieces: List[Piece] = field(default_factory=list)
    free: List[FreeRect] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "w": self.w,
            "h": self.h,
            "label": self.label,
            "pieces": [p.to_dict() if hasattr(p, "to_dict") else p for p in self.pieces],
            "free": [f.to_dict() if hasattr(f, "to_dict") else f for f in self.free],
        }
        d.update(self.metadata)
        return d

    def __getitem__(self, item: str) -> Any:
        if item == "w":
            return self.w
        if item == "h":
            return self.h
        if item == "label":
            return self.label
        if item == "pieces":
            return self.pieces
        if item == "free":
            return self.free
        return self.metadata[item]


@dataclass
class OptimizationResult:
    sheets: List[SheetLayout] = field(default_factory=list)
    unplaced: List[Piece] = field(default_factory=list)
    area: float = 0.0
    used: float = 0.0
    arrangements_evaluated: int = 0

    @property
    def arrangementsEvaluated(self) -> int:
        return self.arrangements_evaluated

    @property
    def utilization_percentage(self) -> float:
        return (self.used / self.area * 100.0) if self.area > 0 else 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "sheets": [s.to_dict() if hasattr(s, "to_dict") else s for s in self.sheets],
            "unplaced": [p.to_dict() if hasattr(p, "to_dict") else p for p in self.unplaced],
            "area": self.area,
            "used": self.used,
            "arrangementsEvaluated": self.arrangements_evaluated,
            "arrangements_evaluated": self.arrangements_evaluated,
            "utilizationPercentage": self.utilization_percentage,
        }

    def __getitem__(self, item: str) -> Any:
        if item == "sheets":
            return self.sheets
        if item == "unplaced":
            return self.unplaced
        if item == "area":
            return self.area
        if item == "used":
            return self.used
        if item in ("arrangementsEvaluated", "arrangements_evaluated"):
            return self.arrangements_evaluated
        raise KeyError(item)

from __future__ import annotations

import math
from typing import Any, Callable, Dict, List, Optional, Tuple, Union
from .models import FreeRect, OptimizationResult, Part, Piece, SheetLayout, Stock


def place_group(
    board: Union[Dict[str, Any], SheetLayout],
    group: List[Union[Dict[str, Any], Piece, Part]],
    kerf: float,
    rotate: bool,
    policy: int = 0,
) -> Optional[Dict[str, Any]]:
    """Place a group of pieces on a board using guillotine cuts.

    Trials never mutate a board unless every copy fits and edge-remnant
    constraints are satisfied.
    """
    board_w = float(board["w"])
    board_h = float(board["h"])

    # Extract free rectangles and existing pieces
    raw_free = board["free"]
    base_free: List[Dict[str, float]] = [
        {"x": float(f["x"]), "y": float(f["y"]), "w": float(f["w"]), "h": float(f["h"])}
        for f in raw_free
    ]
    base_pieces: List[Dict[str, Any]] = [
        dict(p) if isinstance(p, dict) else p.to_dict()
        for p in board["pieces"]
    ]

    def quality(free_rects: List[Dict[str, float]]) -> float:
        if policy == 1:
            return sum((f["w"] * f["h"]) ** 2 for f in free_rects)
        elif policy == 2:
            return float(-len(free_rects))
        else:
            if not free_rects:
                return 0.0
            return max(0.0, max(f["w"] * f["h"] for f in free_rects))

    best: Optional[Dict[str, Any]] = None
    best_quality: float = -float("inf")

    # Normalized group pieces
    norm_group: List[Dict[str, Any]] = [
        dict(p) if isinstance(p, dict) else (p.to_dict() if hasattr(p, "to_dict") else {"w": p.w, "h": p.h})
        for p in group
    ]

    for split in ("auto", "horizontal", "vertical"):
        for prefer_turn in (False, True):
            s_free = [{"x": f["x"], "y": f["y"], "w": f["w"], "h": f["h"]} for f in base_free]
            s_pieces = list(base_pieces)
            complete = True

            for p in norm_group:
                pw = float(p["w"])
                ph = float(p["h"])
                allow_rotate = (
                    rotate
                    and (p.get("allowRotate") is True or p.get("allow_rotate") is True)
                    and pw != ph
                )
                turns: Tuple[bool, ...] = (True, False) if (allow_rotate and prefer_turn) else ((False, True) if allow_rotate else (False,))

                choice: Optional[Tuple[int, float, float, bool, float]] = None  # fi, w, h, turn, score

                for fi, f in enumerate(s_free):
                    fw = f["w"]
                    fh = f["h"]
                    for turn in turns:
                        w = ph if turn else pw
                        h = pw if turn else ph
                        if w <= fw + 1e-8 and h <= fh + 1e-8:
                            score = fw * fh - w * h
                            if choice is None or score < choice[4]:
                                choice = (fi, w, h, turn, score)

                if choice is None:
                    complete = False
                    break

                fi, w, h, turn, _ = choice
                f = s_free.pop(fi)
                placed = dict(p)
                placed.update({"x": f["x"], "y": f["y"], "w": w, "h": h, "turn": turn})
                s_pieces.append(placed)

                rw = f["w"] - w - kerf
                rh = f["h"] - h - kerf

                if split == "vertical" or (split == "auto" and rw > rh):
                    if rw > 0:
                        s_free.append({"x": f["x"] + w + kerf, "y": f["y"], "w": rw, "h": f["h"]})
                    if rh > 0:
                        s_free.append({"x": f["x"], "y": f["y"] + h + kerf, "w": w, "h": rh})
                else:
                    if rh > 0:
                        s_free.append({"x": f["x"], "y": f["y"] + h + kerf, "w": f["w"], "h": rh})
                    if rw > 0:
                        s_free.append({"x": f["x"] + w + kerf, "y": f["y"], "w": rw, "h": h})

            # Keep every reusable leftover connected to the outside (right or bottom) of the board.
            edge_waste_only = all(
                f["x"] + f["w"] >= board_w - 1e-8 or f["y"] + f["h"] >= board_h - 1e-8
                for f in s_free
            )

            if complete and edge_waste_only:
                q = quality(s_free)
                if best is None or q > best_quality:
                    res_dict = dict(board) if isinstance(board, dict) else board.to_dict()
                    res_dict["free"] = s_free
                    res_dict["pieces"] = s_pieces
                    best = res_dict
                    best_quality = q

    return best


# Alias matching JavaScript camelCase
placeGroup = place_group


def optimize(
    parts: List[Union[Dict[str, Any], Part]],
    stock: List[Union[Dict[str, Any], Stock]],
    kerf: float,
    rotate: bool,
    split_quantities: bool = False,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Find a high-utilization guillotine cut arrangement for requested parts and stock.

    Args:
        parts: List of parts to cut with w, h, qty, optional allowRotate/allow_rotate, label.
        stock: Available stock sheets with w, h, optional qty (unlimited if omitted).
        kerf: Saw kerf width in centimeters.
        rotate: Global flag to enable 90° rotation consideration.
        split_quantities: If True, pack pieces individually across sheets; if False, keep groups together.

    Returns:
        Dictionary containing sheets, unplaced pieces, area, used, and arrangementsEvaluated.
    """
    # Also support splitQuantities passed as camelCase kwarg
    if "splitQuantities" in kwargs:
        split_quantities = kwargs["splitQuantities"]

    norm_parts: List[Dict[str, Any]] = [
        dict(p) if isinstance(p, dict) else p.to_dict()
        for p in parts
    ]
    norm_stock: List[Dict[str, Any]] = [
        dict(s) if isinstance(s, dict) else s.to_dict()
        for s in stock
    ]

    batches: List[List[Dict[str, Any]]] = []
    for i, p in enumerate(norm_parts):
        raw_q = p.get("qty")
        qty = 1 if raw_q is None or raw_q == "" else int(raw_q)
        batch = []
        for j in range(qty):
            item = dict(p)
            item["groupId"] = i
            item["group_id"] = i
            item["id"] = f"{i}-{j}"
            item["color"] = i % 6
            batch.append(item)
        batches.append(batch)

    groups: List[List[Dict[str, Any]]] = (
        [[p] for b in batches for p in b] if split_quantities else batches
    )

    orders: List[List[List[Dict[str, Any]]]] = []

    # Permutations if 5 or fewer groups
    if len(groups) <= 5:
        def permutations(
            prefix: List[List[Dict[str, Any]]],
            left: List[List[Dict[str, Any]]],
        ) -> None:
            if not left:
                orders.append(prefix)
                return
            for i, g in enumerate(left):
                permutations(prefix + [g], [x for j, x in enumerate(left) if j != i])

        permutations([], groups)

    # Heuristic score orderings
    score_fns: List[Callable[[List[Dict[str, Any]]], float]] = [
        lambda g: len(g) * float(g[0]["w"]) * float(g[0]["h"]),
        lambda g: float(g[0]["w"]) * float(g[0]["h"]),
        lambda g: float(len(g)),
        lambda g: float(g[0]["w"]),
        lambda g: float(g[0]["h"]),
        lambda g: float(max(g[0]["w"], g[0]["h"])),
        lambda g: -float(g[0]["w"]) * float(g[0]["h"]),
        lambda g: -float(max(g[0]["w"], g[0]["h"])),
    ]
    for score in score_fns:
        orders.append(sorted(groups, key=score, reverse=True))

    # Pseudo-random shuffles using deterministic 32-bit LCG
    seed = 123456789

    def lcg_random() -> float:
        nonlocal seed
        seed = ((seed * 1664525) + 1013904223) & 0xFFFFFFFF
        return seed / 4294967296.0

    total_pieces = sum(len(g) for g in groups)
    attempts = 8 if total_pieces > 200 else 32

    for _ in range(attempts):
        order = list(groups)
        for i in range(len(order) - 1, 0, -1):
            j = int(math.floor(lcg_random() * (i + 1)))
            order[i], order[j] = order[j], order[i]
        orders.append(order)

    seen: set[str] = set()
    evaluated = 0
    best: Optional[Dict[str, Any]] = None

    has_rotatable = any(p.get("allowRotate") is True or p.get("allow_rotate") is True for p in norm_parts)
    rotation_modes = [False, True] if (rotate and has_rotatable) else [False]

    def earlier_sheets_fuller(a: Dict[str, Any], b: Dict[str, Any]) -> bool:
        max_sheets = max(len(a["sheets"]), len(b["sheets"]))
        for i in range(max_sheets):
            len_a = len(a["sheets"][i]["pieces"]) if i < len(a["sheets"]) else 0
            len_b = len(b["sheets"][i]["pieces"]) if i < len(b["sheets"]) else 0
            diff = len_a - len_b
            if diff != 0:
                return diff > 0
        return False

    for rotation_mode in rotation_modes:
        for policy in (0, 1, 2):
            for stock_direction in (1, -1):
                for order in orders:
                    key = f"{rotation_mode}:{policy}:{stock_direction}:{','.join(str(g[0]['groupId']) for g in order)}"
                    if key in seen:
                        continue
                    seen.add(key)
                    evaluated += 1

                    remaining = list(order)
                    supply: List[Dict[str, Any]] = []
                    for s in norm_stock:
                        qty = s.get("qty")
                        if qty is None:
                            copy_s = dict(s)
                            copy_s["unlimited"] = True
                            supply.append(copy_s)
                        else:
                            for _ in range(int(qty)):
                                supply.append(dict(s))

                    supply.sort(
                        key=lambda s: float(s["w"]) * float(s["h"]),
                        reverse=(stock_direction == -1),
                    )

                    sheets: List[Dict[str, Any]] = []
                    unplaced: List[Dict[str, Any]] = []

                    while remaining:
                        placed = False
                        # Try existing sheets
                        for si in range(len(sheets)):
                            for gi in range(len(remaining)):
                                trial = place_group(
                                    sheets[si],
                                    remaining[gi],
                                    kerf,
                                    rotation_mode,
                                    policy,
                                )
                                if trial is not None:
                                    sheets[si] = trial
                                    remaining.pop(gi)
                                    placed = True
                                    break
                            if placed:
                                break

                        if placed:
                            continue

                        # Try new board from supply
                        for si in range(len(supply)):
                            for gi in range(len(remaining)):
                                raw = supply[si]
                                empty_board = dict(raw)
                                empty_board["free"] = [{"x": 0.0, "y": 0.0, "w": float(raw["w"]), "h": float(raw["h"])}]
                                empty_board["pieces"] = []
                                trial = place_group(
                                    empty_board,
                                    remaining[gi],
                                    kerf,
                                    rotation_mode,
                                    policy,
                                )
                                if trial is not None:
                                    sheets.append(trial)
                                    if not raw.get("unlimited"):
                                        supply.pop(si)
                                    remaining.pop(gi)
                                    placed = True
                                    break
                            if placed:
                                break

                        if not placed:
                            for g in remaining:
                                unplaced.extend(g)
                            break

                    area = sum(float(s["w"]) * float(s["h"]) for s in sheets)
                    used = sum(
                        float(p["w"]) * float(p["h"])
                        for s in sheets
                        for p in s["pieces"]
                    )
                    r = {
                        "sheets": sheets,
                        "unplaced": unplaced,
                        "area": area,
                        "used": used,
                    }

                    # Split quantities exhaustion check: reject if a later piece fits an earlier board
                    if split_quantities:
                        invalid_layout = False
                        for i, board in enumerate(sheets):
                            later_pieces = [p for s in sheets[i + 1:] for p in s["pieces"]] + unplaced
                            for p in later_pieces:
                                gid = p["groupId"]
                                orig_part = dict(p)
                                orig_part["w"] = norm_parts[gid]["w"]
                                orig_part["h"] = norm_parts[gid]["h"]
                                if place_group(board, [orig_part], kerf, rotate) is not None:
                                    invalid_layout = True
                                    break
                            if invalid_layout:
                                break
                        if invalid_layout:
                            continue

                    # Multi-objective selection
                    if (
                        best is None
                        or len(r["unplaced"]) < len(best["unplaced"])
                        or (
                            len(r["unplaced"]) == len(best["unplaced"])
                            and (
                                r["used"] > best["used"] + 1e-8
                                or (
                                    abs(r["used"] - best["used"]) < 1e-8
                                    and (
                                        r["area"] < best["area"] - 1e-8
                                        or (
                                            abs(r["area"] - best["area"]) < 1e-8
                                            and (
                                                len(r["sheets"]) < len(best["sheets"])
                                                or (
                                                    len(r["sheets"]) == len(best["sheets"])
                                                    and earlier_sheets_fuller(r, best)
                                                )
                                            )
                                        )
                                    )
                                )
                            )
                        )
                    ):
                        best = r

    if best is None:
        best = {
            "sheets": [],
            "unplaced": [p for g in groups for p in g],
            "area": 0.0,
            "used": 0.0,
        }

    best["arrangementsEvaluated"] = evaluated
    best["arrangements_evaluated"] = evaluated

    # Build typed wrapper that also acts as a dict
    sheet_layouts: List[SheetLayout] = []
    for s in best["sheets"]:
        pcs = [
            Piece(
                x=p["x"],
                y=p["y"],
                w=p["w"],
                h=p["h"],
                turn=p.get("turn", False),
                label=p.get("label", ""),
                group_id=p.get("groupId", p.get("group_id", 0)),
                id=p.get("id", ""),
                color=p.get("color", 0),
                edges=p.get("edges"),
                allow_rotate=p.get("allowRotate", p.get("allow_rotate")),
                metadata={k: v for k, v in p.items() if k not in {"x", "y", "w", "h", "turn", "label", "groupId", "group_id", "id", "color", "edges", "allowRotate", "allow_rotate"}},
            )
            for p in s["pieces"]
        ]
        frs = [FreeRect(x=f["x"], y=f["y"], w=f["w"], h=f["h"]) for f in s["free"]]
        sheet_layouts.append(
            SheetLayout(
                w=float(s["w"]),
                h=float(s["h"]),
                label=str(s.get("label", "Stock sheet")),
                pieces=pcs,
                free=frs,
                metadata={k: v for k, v in s.items() if k not in {"w", "h", "label", "pieces", "free"}},
            )
        )

    unplaced_pcs = [
        Piece(
            x=0.0,
            y=0.0,
            w=p["w"],
            h=p["h"],
            turn=p.get("turn", False),
            label=p.get("label", ""),
            group_id=p.get("groupId", p.get("group_id", 0)),
            id=p.get("id", ""),
            color=p.get("color", 0),
            edges=p.get("edges"),
            allow_rotate=p.get("allowRotate", p.get("allow_rotate")),
        )
        for p in best["unplaced"]
    ]

    # Return a dict-compatible OptimizationResult object
    class ResultDict(dict):
        def __init__(self, d: Dict[str, Any], obj: OptimizationResult):
            super().__init__(d)
            self._obj = obj

        @property
        def sheets(self) -> List[Any]:
            return self["sheets"]

        @property
        def unplaced(self) -> List[Any]:
            return self["unplaced"]

        @property
        def area(self) -> float:
            return self["area"]

        @property
        def used(self) -> float:
            return self["used"]

        @property
        def arrangementsEvaluated(self) -> int:
            return self["arrangementsEvaluated"]

        @property
        def arrangements_evaluated(self) -> int:
            return self["arrangements_evaluated"]

        @property
        def typed(self) -> OptimizationResult:
            return self._obj

    res_obj = OptimizationResult(
        sheets=sheet_layouts,
        unplaced=unplaced_pcs,
        area=best["area"],
        used=best["used"],
        arrangements_evaluated=best["arrangements_evaluated"],
    )
    return ResultDict(best, res_obj)

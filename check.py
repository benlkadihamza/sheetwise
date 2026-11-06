#!/usr/bin/env python3
"""Comprehensive test suite for Sheetwise optimizer and geometric constraints.

Direct parity with check.cjs: kerf, rotation, stock limits, bounds,
overlap, 50 generated cases, grouped placement, edge-only remnants,
automatic sheet count, fill-first, and unit conversions.
"""

import sys
from sheetwise.optimizer import optimize, placeGroup
from sheetwise.banding import banding_length, banding_total
from sheetwise.units import project_in_centimeters


def verify(r, k):
    """Verify bounds and saw kerf non-overlapping for all placed pieces."""
    for s in r["sheets"]:
        sw = float(s["w"])
        sh = float(s["h"])
        for p in s["pieces"]:
            px = float(p["x"])
            py = float(p["y"])
            pw = float(p["w"])
            ph = float(p["h"])
            assert px >= -1e-8 and py >= -1e-8, f"Piece out of negative bounds: {px}, {py}"
            assert px + pw <= sw + 1e-8, f"Piece extends beyond sheet width: {px + pw} > {sw}"
            assert py + ph <= sh + 1e-8, f"Piece extends beyond sheet height: {py + ph} > {sh}"

        for i in range(len(s["pieces"])):
            for j in range(i + 1, len(s["pieces"])):
                a = s["pieces"][i]
                b = s["pieces"][j]
                ax, ay, aw, ah = float(a["x"]), float(a["y"]), float(a["w"]), float(a["h"])
                bx, by, bw, bh = float(b["x"]), float(b["y"]), float(b["w"]), float(b["h"])
                overlap = not (
                    ax + aw + k <= bx + 1e-8
                    or bx + bw + k <= ax + 1e-8
                    or ay + ah + k <= by + 1e-8
                    or by + bh + k <= ay + 1e-8
                )
                assert not overlap, f"Pieces overlap with kerf {k}: piece {i} and piece {j}"


def verify_groups(r, parts):
    """Verify grouped placement invariants: groups never split across sheets."""
    for g in range(len(parts)):
        boards = [s for s in r["sheets"] if any(p.get("groupId", p.get("group_id")) == g for p in s["pieces"])]
        assert len(boards) <= 1, f"Group {g} spans multiple boards ({len(boards)})"

        placed = len([
            p for s in boards for p in s["pieces"]
            if p.get("groupId", p.get("group_id")) == g
        ])
        missing = len([
            p for p in r["unplaced"]
            if p.get("groupId", p.get("group_id")) == g
        ])
        expected_qty = parts[g]["qty"]
        assert placed + missing == expected_qty, f"Group {g} count mismatch: {placed} + {missing} != {expected_qty}"
        assert placed == 0 or missing == 0, f"Partial group placed for group {g}"


def run_checks():
    print("Running Sheetwise test suite...")

    # 1. Basic placement and kerf tests
    r = optimize([{"label": "A", "w": 50, "h": 100, "qty": 2}], [{"w": 100, "h": 100, "qty": 1}], 0, False)
    assert len(r["unplaced"]) == 0
    verify(r, 0)

    r = optimize([{"label": "A", "w": 50, "h": 100, "qty": 2}], [{"w": 100, "h": 100, "qty": 1}], 3, False)
    assert len(r["unplaced"]) == 2
    assert len(r["sheets"]) == 0
    verify(r, 3)

    assert len(optimize([{"w": 90, "h": 40, "qty": 1, "allowRotate": True}], [{"w": 40, "h": 90, "qty": 1}], 0, True)["unplaced"]) == 0
    assert len(optimize([{"w": 90, "h": 40, "qty": 1, "allowRotate": True}], [{"w": 40, "h": 90, "qty": 1}], 0, False)["unplaced"]) == 1

    # 50 generated cases
    for n in range(50):
        parts = [
            {
                "label": f"p{i}",
                "w": 30 + ((n * 97 + i * 43) % 500),
                "h": 30 + ((n * 37 + i * 83) % 500),
                "qty": 2,
            }
            for i in range(12)
        ]
        r = optimize(parts, [{"w": 1220, "h": 2440, "qty": 5}], 3, True)
        total_placed = sum(len(s["pieces"]) for s in r["sheets"])
        assert total_placed + len(r["unplaced"]) == 24
        verify(r, 3)

    print("Passed: kerf, rotation, stock limits, bounds, overlap, and 50 generated cases.")

    # 2. Grouped placement checks
    ps = [
        {"label": "A", "w": 60, "h": 50, "qty": 2},
        {"label": "B", "w": 40, "h": 50, "qty": 2},
        {"label": "C", "w": 60, "h": 50, "qty": 2},
    ]
    grouped = optimize(ps, [{"w": 100, "h": 100, "qty": 3}], 0, False)
    verify_groups(grouped, ps)
    assert len(grouped["unplaced"]) == 0
    assert len(grouped["sheets"]) == 2

    too_large = optimize([{"w": 60, "h": 100, "qty": 2}], [{"w": 100, "h": 100, "qty": 3}], 0, False)
    assert len(too_large["unplaced"]) == 2
    assert len(too_large["sheets"]) == 0

    for n in range(40):
        parts = [
            {
                "label": f"p{i}",
                "w": 10 + (n * 31 + i * 17) % 70,
                "h": 10 + (n * 19 + i * 29) % 70,
                "qty": 1 + i % 3,
            }
            for i in range(12)
        ]
        r = optimize(parts, [{"w": 100, "h": 100, "qty": 8}], 0.4, True)
        verify(r, 0.4)
        verify_groups(r, parts)

        # Whole group fit check for earlier sheets
        for i, s in enumerate(r["sheets"]):
            later_pieces = [p for b in r["sheets"][i + 1:] for p in b["pieces"]] + r["unplaced"]
            groups_map = {}
            for p in later_pieces:
                gid = p.get("groupId", p.get("group_id"))
                if gid not in groups_map:
                    groups_map[gid] = []
                orig = dict(p)
                orig["w"] = parts[gid]["w"]
                orig["h"] = parts[gid]["h"]
                groups_map[gid].append(orig)
            for group in groups_map.values():
                assert placeGroup(s, group, 0.4, True) is None, "Whole group fits earlier board"

    print("Grouped placement passed: no split groups, whole-group leftovers, oversize groups, and 40 generated layouts.")

    # 3. Per-part orientation
    fixed = optimize([{"w": 90, "h": 40, "qty": 1, "allowRotate": False}], [{"w": 40, "h": 90, "qty": 1}], 0, True)
    assert len(fixed["unplaced"]) == 1

    turned = optimize([{"w": 90, "h": 40, "qty": 1, "allowRotate": True}], [{"w": 40, "h": 90, "qty": 1}], 0, True)
    assert len(turned["unplaced"]) == 0
    assert turned["sheets"][0]["pieces"][0]["turn"] is True

    default_fixed = optimize([{"w": 90, "h": 40, "qty": 1}], [{"w": 40, "h": 90, "qty": 1}], 0, True)
    assert len(default_fixed["unplaced"]) == 1

    mixed_parts = [{"w": 90, "h": 40, "qty": 1, "allowRotate": False}, {"w": 90, "h": 40, "qty": 1, "allowRotate": True}]
    mixed = optimize(mixed_parts, [{"w": 100, "h": 100, "qty": 2}], 0.4, True)
    verify(mixed, 0.4)
    verify_groups(mixed, mixed_parts)
    placed_g0 = [p for s in mixed["sheets"] for p in s["pieces"] if p.get("groupId", p.get("group_id")) == 0]
    assert all(not p.get("turn") and p["w"] == 90 and p["h"] == 40 for p in placed_g0)

    print("Per-part orientation passed: fixed, rotatable, fixed default, and mixed groups.")

    # 4. Rotation search includes fixed-layout baseline
    for n in range(8):
        p = [
            {
                "w": 15 + (n * 13 + i * 23) % 65,
                "h": 15 + (n * 17 + i * 11) % 65,
                "qty": 1 + i % 2,
                "allowRotate": True,
            }
            for i in range(4)
        ]
        stock = [{"w": 100, "h": 100, "qty": 5}]
        fixed_r = optimize(p, stock, 0.4, False)
        rotated_r = optimize(p, stock, 0.4, True)
        assert len(rotated_r["unplaced"]) <= len(fixed_r["unplaced"])
        if len(rotated_r["unplaced"]) == len(fixed_r["unplaced"]) and rotated_r["used"] == fixed_r["used"]:
            assert rotated_r["area"] <= fixed_r["area"]
        verify(rotated_r, 0.4)
        verify_groups(rotated_r, p)

    print("Rotation search includes fixed-layout baseline: never worse on equivalent placed parts.")

    # 5. Edge-only leftovers
    for n in range(12):
        parts = [
            {
                "w": 12 + (n * 23 + i * 17) % 65,
                "h": 12 + (n * 11 + i * 29) % 65,
                "qty": 1 + i % 2,
                "allowRotate": (n % 2 == 0),
            }
            for i in range(5)
        ]
        r = optimize(parts, [{"w": 100, "h": 100, "qty": 8}], 0.4, True)
        verify(r, 0.4)
        verify_groups(r, parts)
        for s in r["sheets"]:
            sw = float(s["w"])
            sh = float(s["h"])
            for f in s["free"]:
                assert float(f["x"]) + float(f["w"]) >= sw - 1e-8 or float(f["y"]) + float(f["h"]) >= sh - 1e-8, (
                    "Remnant must reach the right or bottom side"
                )

    print("Edge-only leftovers passed: 12 generated jobs with rotation on and off.")

    # 6. Automatic sheet count
    automatic = optimize(
        [{"w": 90, "h": 90, "qty": 1}, {"w": 90, "h": 90, "qty": 1}, {"w": 90, "h": 90, "qty": 1}],
        [{"w": 100, "h": 100}],
        0.4,
        False,
    )
    assert len(automatic["sheets"]) == 3
    assert len(automatic["unplaced"]) == 0
    verify(automatic, 0.4)

    impossible_group = optimize([{"w": 90, "h": 90, "qty": 2}], [{"w": 100, "h": 100}], 0.4, False)
    assert len(impossible_group["unplaced"]) == 2
    print("Automatic sheet count passed: enough stock generated; impossible groups still reported.")

    # 7. Fill-first (split_quantities)
    fillers = [{"label": "Large", "w": 60, "h": 100, "qty": 2}, {"label": "Small", "w": 40, "h": 50, "qty": 4}]
    filled = optimize(fillers, [{"w": 100, "h": 100, "qty": 2}], 0, False, split_quantities=True)
    assert len(filled["unplaced"]) == 0
    assert len(filled["sheets"]) == 2
    assert filled["used"] / filled["area"] == 1.0
    assert all(len(s["pieces"]) == 3 for s in filled["sheets"])
    verify(filled, 0)

    for n in range(10):
        ps = [
            {
                "w": 10 + (n * 17 + i * 31) % 70,
                "h": 10 + (n * 29 + i * 19) % 70,
                "qty": 1 + i % 3,
                "allowRotate": (n % 2 == 0),
            }
            for i in range(6)
        ]
        r = optimize(ps, [{"w": 100, "h": 100, "qty": 6}], 0.4, True, split_quantities=True)
        verify(r, 0.4)
        total_p = sum(len(s["pieces"]) for s in r["sheets"]) + len(r["unplaced"])
        expected_p = sum(p["qty"] for p in ps)
        assert total_p == expected_p

        for i, s in enumerate(r["sheets"]):
            for p in [p for b in r["sheets"][i + 1:] for p in b["pieces"]] + r["unplaced"]:
                gid = p.get("groupId", p.get("group_id"))
                original = dict(p)
                original["w"] = ps[gid]["w"]
                original["h"] = ps[gid]["h"]
                assert placeGroup(s, [original], 0.4, True) is None, "A later piece could fill an earlier sheet"

    print("Fill-first passed: 100% filler example, split quantities, conservation, and earlier-sheet exhaustion.")

    # 8. Edge banding & unit conversions
    part_a = {"w": 100, "h": 50, "qty": 3, "edges": {"top": True, "bottom": True}}
    part_b = {"w": 60, "h": 40, "qty": 2, "edges": {"left": True, "right": True, "top": True}}
    assert banding_length(part_a) == 200.0  # 100 + 100
    assert banding_length(part_b) == 140.0  # 40 + 40 + 60
    assert banding_total([part_a, part_b]) == 200.0 * 3 + 140.0 * 2  # 600 + 280 = 880

    proj_mm = {
        "unit": "mm",
        "kerf": 40,
        "stock": [{"w": 2440, "h": 1220}],
        "parts": [{"w": 600, "h": 400, "qty": 2}],
    }
    proj_cm = project_in_centimeters(proj_mm)
    assert proj_cm["unit"] == "cm"
    assert proj_cm["kerf"] == 4.0
    assert proj_cm["stock"][0]["w"] == 244.0
    assert proj_cm["parts"][0]["h"] == 40.0

    print("Edge banding & unit conversions passed.")
    print("ALL TESTS PASSED SUCCESSFULLY! 100% parity verified.")


if __name__ == "__main__":
    run_checks()

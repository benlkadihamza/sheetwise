from __future__ import annotations

from typing import Any, Dict, List, Set, Union
from .models import SheetLayout

COLORS = [
    "#c5d4af",
    "#e9d5ae",
    "#b9cfcb",
    "#d8c6bc",
    "#c9c8dc",
    "#dfcba0",
]


def fmt_dim(n: float) -> str:
    """Format dimension cleanly, omitting trailing zeroes if integer."""
    rounded = round(float(n), 2)
    return f"{rounded:g}"


def render_sheet_svg(
    sheet: Union[SheetLayout, Dict[str, Any]],
    interactive: bool = False,
) -> str:
    """Generate SVG XML markup for a sheet cutting diagram.

    Includes:
    - Sheet outline and background
    - Color-coded parts with labels, dimensions, and rotation indicator
    - Edge banding highlight lines in dark green
    - Gray guillotine cut guides
    - Remnant dimension lines with tick marks and red measurement callouts
    """
    if isinstance(sheet, SheetLayout):
        s_dict = sheet.to_dict()
    else:
        s_dict = sheet

    sw = float(s_dict["w"])
    sh = float(s_dict["h"])
    label = str(s_dict.get("label", "Stock sheet"))
    pieces = s_dict.get("pieces", [])
    free = s_dict.get("free", [])

    pad = max(sw, sh) * 0.065
    vb_x = -pad
    vb_y = -pad
    vb_w = sw + 2 * pad
    vb_h = sh + 2 * pad

    lines: List[str] = []
    lines.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="{vb_x:.4f} {vb_y:.4f} {vb_w:.4f} {vb_h:.4f}" '
        f'role="img" aria-label="Cutting layout for {label}: {len(pieces)} pieces" '
        f'style="max-width:100%;height:auto;display:block;">'
    )
    lines.append("<style>")
    lines.append("  .cut-part { cursor: pointer; transition: opacity 0.15s; }")
    lines.append("  .cut-part:hover { opacity: 0.9; }")
    lines.append("  .cut-guide { stroke-dasharray: 4 2; opacity: 0.7; }")
    lines.append("</style>")

    # Background sheet
    stroke_w_board = sw / 1220.0
    lines.append(
        f'<rect x="0" y="0" width="{sw:.4f}" height="{sh:.4f}" '
        f'fill="#e8eadf" stroke="#a8b29b" stroke-width="{stroke_w_board:.4f}" />'
    )

    # Cut guides
    guide_keys: Set[str] = set()
    guide_stroke_w = sw / 900.0

    def add_guide(x1: float, y1: float, x2: float, y2: float) -> None:
        key = f"{x1:.4f},{y1:.4f},{x2:.4f},{y2:.4f}"
        if key not in guide_keys:
            guide_keys.add(key)
            lines.append(
                f'<line x1="{x1:.4f}" y1="{y1:.4f}" x2="{x2:.4f}" y2="{y2:.4f}" '
                f'stroke="#a4a7a0" stroke-width="{guide_stroke_w:.4f}" class="cut-guide" pointer-events="none" />'
            )

    for f in free:
        fx = float(f["x"])
        fy = float(f["y"])
        fw = float(f["w"])
        fh = float(f["h"])
        add_guide(fx, fy, fx + fw, fy)
        add_guide(fx, fy + fh, fx + fw, fy + fh)
        add_guide(fx, fy, fx, fy + fh)

    # Placed pieces
    piece_stroke_w = max(sw / 1400.0, 0.07)
    band_stroke_w = max(sw / 350.0, 0.2)

    for p in pieces:
        px = float(p["x"])
        py = float(p["y"])
        pw = float(p["w"])
        ph = float(p["h"])
        turn = bool(p.get("turn", False))
        color_idx = int(p.get("color", 0)) % len(COLORS)
        color = COLORS[color_idx]
        p_label = str(p.get("label", ""))

        lines.append(
            f'<rect class="cut-part" x="{px:.4f}" y="{py:.4f}" width="{pw:.4f}" height="{ph:.4f}" '
            f'fill="{color}" stroke="#ffffff" stroke-width="{piece_stroke_w:.4f}">'
            f'<title>{p_label}: {fmt_dim(pw)} × {fmt_dim(ph)} cm'
            f'{" (rotated)" if turn else ""}</title>'
            f'</rect>'
        )

        # Edge banding lines
        edges_raw = p.get("edges") or {}
        if isinstance(edges_raw, dict):
            e = edges_raw
        elif hasattr(edges_raw, "to_dict"):
            e = edges_raw.to_dict()
        else:
            e = {}

        if turn:
            eff_edges = {
                "top": bool(e.get("left")),
                "right": bool(e.get("top")),
                "bottom": bool(e.get("right")),
                "left": bool(e.get("bottom")),
            }
        else:
            eff_edges = {
                "top": bool(e.get("top")),
                "right": bool(e.get("right")),
                "bottom": bool(e.get("bottom")),
                "left": bool(e.get("left")),
            }

        coords = {
            "top": (px, py, px + pw, py),
            "bottom": (px, py + ph, px + pw, py + ph),
            "left": (px, py, px, py + ph),
            "right": (px + pw, py, px + pw, py + ph),
        }

        for side, (x1, y1, x2, y2) in coords.items():
            if eff_edges.get(side):
                lines.append(
                    f'<line x1="{x1:.4f}" y1="{y1:.4f}" x2="{x2:.4f}" y2="{y2:.4f}" '
                    f'stroke="#275b45" stroke-width="{band_stroke_w:.4f}" pointer-events="none" />'
                )

        # Text labels on piece
        font_sz = min(sw / 65.0, pw / 8.0, ph / 3.0)
        if font_sz > 0.6:
            label_text = p_label[:20]
            dim_text = f"{fmt_dim(pw)} × {fmt_dim(ph)} cm{' ↻' if turn else ''}"
            mid_x = px + pw / 2.0
            mid_y1 = py + ph / 2.0 - font_sz * 0.2
            mid_y2 = py + ph / 2.0 + font_sz * 1.3
            lines.append(
                f'<text x="{mid_x:.4f}" y="{mid_y1:.4f}" text-anchor="middle" '
                f'fill="#344737" font-size="{font_sz:.4f}" font-family="sans-serif" pointer-events="none">'
                f'{label_text}</text>'
            )
            lines.append(
                f'<text x="{mid_x:.4f}" y="{mid_y2:.4f}" text-anchor="middle" '
                f'fill="#53654d" font-size="{(font_sz * 0.8):.4f}" font-family="sans-serif" pointer-events="none">'
                f'{dim_text}</text>'
            )

    # Remnant measurements
    remnant_tick = sw / 160.0
    remnant_font = sw / 105.0
    remnant_line_w = sw / 700.0

    def add_measurement(
        x1: float,
        y1: float,
        x2: float,
        y2: float,
        meas_label: str,
        vertical: bool,
    ) -> None:
        lines.append(
            f'<line x1="{x1:.4f}" y1="{y1:.4f}" x2="{x2:.4f}" y2="{y2:.4f}" '
            f'stroke="#d85b55" stroke-width="{remnant_line_w:.4f}" />'
        )
        for tx, ty in [(x1, y1), (x2, y2)]:
            if vertical:
                lines.append(
                    f'<line x1="{(tx - remnant_tick):.4f}" y1="{ty:.4f}" '
                    f'x2="{(tx + remnant_tick):.4f}" y2="{ty:.4f}" '
                    f'stroke="#d85b55" stroke-width="{remnant_line_w:.4f}" />'
                )
            else:
                lines.append(
                    f'<line x1="{tx:.4f}" y1="{(ty - remnant_tick):.4f}" '
                    f'x2="{tx:.4f}" y2="{(ty + remnant_tick):.4f}" '
                    f'stroke="#d85b55" stroke-width="{remnant_line_w:.4f}" />'
                )

        mx = (x1 + x2) / 2.0 + (-remnant_font * 0.65 if vertical else 0.0)
        my = (y1 + y2) / 2.0 + (0.0 if vertical else remnant_font * 1.4)
        halo_w = remnant_font * 0.2
        rot_attr = f' transform="rotate(-90 {mx:.4f} {my:.4f})"' if vertical else ""

        lines.append(
            f'<text x="{mx:.4f}" y="{my:.4f}" text-anchor="middle" dominant-baseline="middle" '
            f'font-family="sans-serif" font-size="{remnant_font:.4f}" fill="#d85b55" '
            f'stroke="#f6f7f2" stroke-width="{halo_w:.4f}" paint-order="stroke"{rot_attr}>'
            f'{meas_label}</text>'
        )

    for f in free:
        fx = float(f["x"])
        fy = float(f["y"])
        fw = float(f["w"])
        fh = float(f["h"])

        width_y = fy + fh * 0.35
        height_x = fx + fw * 0.72

        add_measurement(fx, width_y, fx + fw, width_y, fmt_dim(fw), False)
        if fh > sh * 0.025:
            add_measurement(height_x, fy, height_x, fy + fh, fmt_dim(fh), True)
        else:
            add_measurement(sw + pad * 0.45, fy, sw + pad * 0.45, fy + fh, fmt_dim(fh), True)

    # Board dimension callouts
    board_font = sw / 80.0
    lines.append(
        f'<text x="{(sw / 2.0):.4f}" y="{(-pad * 0.35):.4f}" text-anchor="middle" '
        f'font-size="{board_font:.4f}" fill="#8b9781" font-family="sans-serif">{fmt_dim(sw)} cm</text>'
    )
    lines.append(
        f'<text x="{(-pad * 0.25):.4f}" y="{(sh / 2.0):.4f}" text-anchor="middle" '
        f'font-size="{board_font:.4f}" fill="#8b9781" font-family="sans-serif" '
        f'transform="rotate(-90 {(-pad * 0.25):.4f} {(sh / 2.0):.4f})">{fmt_dim(sh)} cm</text>'
    )

    lines.append("</svg>")
    return "\n".join(lines)


# Backwards compatibility alias
svgSheet = render_sheet_svg

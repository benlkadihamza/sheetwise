from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Union
from .models import OptimizationResult, Part, SheetLayout
from .banding import banding_total
from .svg import fmt_dim, render_sheet_svg


def generate_html_report(
    result: Union[OptimizationResult, Dict[str, Any]],
    parts: List[Union[Part, Dict[str, Any]]],
    kerf: float,
    title: str = "Sheetwise Cutting Plan",
) -> str:
    """Generate a printable HTML cutting plan report."""
    res_dict = result.to_dict() if hasattr(result, "to_dict") else result
    sheets = res_dict.get("sheets", [])
    unplaced = res_dict.get("unplaced", [])
    area = float(res_dict.get("area", 0.0))
    used = float(res_dict.get("used", 0.0))
    util = (used / area * 100.0) if area > 0 else 0.0
    total_band_m = banding_total(parts) / 100

    pages_html: List[str] = []

    for idx, sheet in enumerate(sheets):
        sw = float(sheet["w"])
        sh = float(sheet["h"])
        s_label = str(sheet.get("label", "Stock sheet"))
        pieces = sheet.get("pieces", [])
        svg_markup = render_sheet_svg(sheet)

        # Group pieces by label and placed dimensions
        groups: Dict[str, Dict[str, Any]] = {}
        for p in pieces:
            pw = float(p["w"])
            ph = float(p["h"])
            plabel = str(p.get("label", "Part"))
            key = f"{plabel}|{pw:.2f}|{ph:.2f}"
            if key not in groups:
                groups[key] = {
                    "label": plabel,
                    "w": pw,
                    "h": ph,
                    "count": 0,
                }
            groups[key]["count"] += 1

        rows_html = "".join(
            f"<tr><td>{g['label']}</td><td>{fmt_dim(g['w'])}</td><td>{fmt_dim(g['h'])}</td><td>{g['count']}</td></tr>"
            for g in groups.values()
        )

        first_page_header = ""
        if idx == 0:
            first_page_header = f"""
            <div class="summary">
                <div class="eyebrow">YOUR CUTTING PLAN</div>
                <h1>A place for every piece.</h1>
                <div class="stats-row">
                    <div class="stat"><small>Material utilization</small><strong>{util:.1f} <span>%</span></strong></div>
                    <div class="stat"><small>Sheets required</small><strong>{len(sheets)} <span>sheets</span></strong></div>
                    <div class="stat"><small>Unused area</small><strong>{(100 - util):.1f} <span>%</span></strong></div>
                    <div class="stat"><small>Edge banding</small><strong>{total_band_m:.2f} <span>m total</span></strong></div>
                </div>
            </div>
            """

        page_html = f"""
        <section class="report-page">
            {first_page_header}
            <div class="sheet-header">
                <h2>Sheet {idx + 1} / {len(sheets)} · {s_label} · {fmt_dim(sw)} × {fmt_dim(sh)} cm</h2>
                <p class="meta">{len(pieces)} pieces · Saw kerf {fmt_dim(kerf * 10)} mm</p>
            </div>
            <div class="diagram-wrapper">
                {svg_markup}
            </div>
            <h3>Parts to cut</h3>
            <table class="report-table">
                <thead>
                    <tr><th>LABEL</th><th>WIDTH (cm)</th><th>HEIGHT (cm)</th><th>QTY</th></tr>
                </thead>
                <tbody>
                    {rows_html}
                </tbody>
            </table>
            <p class="meta">Dimensions match the cutting orientation shown above.</p>
        </section>
        """
        pages_html.append(page_html)

    unplaced_html = ""
    if unplaced:
        unplaced_groups: Dict[str, Dict[str, Any]] = {}
        for p in unplaced:
            pw = float(p["w"])
            ph = float(p["h"])
            plabel = str(p.get("label", "Part"))
            key = f"{plabel}|{pw:.2f}|{ph:.2f}"
            if key not in unplaced_groups:
                unplaced_groups[key] = {
                    "label": plabel,
                    "w": pw,
                    "h": ph,
                    "count": 0,
                }
            unplaced_groups[key]["count"] += 1

        unplaced_rows = "".join(
            f"<tr><td>{g['label']}</td><td>{fmt_dim(g['w'])} × {fmt_dim(g['h'])}</td><td>{g['count']}</td></tr>"
            for g in unplaced_groups.values()
        )
        unplaced_html = f"""
        <section class="report-page">
            <h2>{len(unplaced)} pieces left unplaced</h2>
            <p class="meta">These pieces could not be placed with the available sheets or orientation constraints.</p>
            <table class="report-table">
                <thead>
                    <tr><th>LABEL</th><th>DIMENSIONS (cm)</th><th>QTY</th></tr>
                </thead>
                <tbody>
                    {unplaced_rows}
                </tbody>
            </table>
        </section>
        """

    full_html = f"""<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>{title}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #222;
            background: #fdfdfc;
            margin: 0;
            padding: 24px;
        }}
        .report-page {{
            max-width: 900px;
            margin: 0 auto 40px auto;
            background: #fff;
            padding: 32px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            page-break-after: always;
            border-radius: 6px;
        }}
        @page {{ size: letter portrait; }}
        @media print {{
            body {{ background: transparent; padding: 0; }}
            .report-page {{ box-shadow: none; margin: 0; padding: 20px; page-break-after: always; }}
            .no-print {{ display: none; }}
        }}
        .eyebrow {{ font-size: 11px; letter-spacing: 0.12em; font-weight: 700; color: #53654d; margin-bottom: 4px; }}
        h1 {{ margin: 0 0 16px 0; font-size: 26px; color: #1c261e; }}
        h2 {{ margin: 0 0 4px 0; font-size: 18px; color: #2a382d; }}
        h3 {{ margin: 20px 0 8px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; }}
        .meta {{ font-size: 12px; color: #666; margin: 4px 0 16px 0; }}
        .stats-row {{
            display: flex;
            gap: 16px;
            background: #f6f7f2;
            padding: 12px 16px;
            border-radius: 6px;
            margin-bottom: 24px;
        }}
        .stat {{ flex: 1; }}
        .stat small {{ display: block; font-size: 11px; color: #666; text-transform: uppercase; }}
        .stat strong {{ font-size: 18px; color: #222; }}
        .stat strong span {{ font-size: 12px; font-weight: normal; color: #777; }}
        .diagram-wrapper {{ margin: 16px 0; border: 1px solid #e1e4da; border-radius: 4px; overflow: hidden; background: #fafbfa; }}
        .report-table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
            margin-top: 8px;
        }}
        .report-table th, .report-table td {{
            text-align: left;
            padding: 8px 12px;
            border-bottom: 1px solid #eaece6;
        }}
        .report-table th {{ background: #f3f5ee; font-weight: 600; color: #444; }}
        .no-print-btn {{
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 18px;
            background: #275b45;
            color: #fff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 600;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        }}
        .no-print-btn:hover {{ background: #1e4736; }}
    </style>
</head>
<body>
    <button class="no-print-btn no-print" onclick="window.print()">Print / Save PDF</button>
    {"".join(pages_html)}
    {unplaced_html}
</body>
</html>"""
    return full_html


def generate_pdf_report(
    result: Union[OptimizationResult, Dict[str, Any]],
    parts: List[Union[Part, Dict[str, Any]]],
    kerf: float,
    output_path: str,
) -> None:
    """Generate a PDF cutting plan report using ReportLab."""
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.graphics.shapes import Drawing, Rect, String, Line, Group
    except ImportError:
        raise ImportError("reportlab is required for PDF generation. Please install reportlab.")

    res_dict = result.to_dict() if hasattr(result, "to_dict") else result
    sheets = res_dict.get("sheets", [])
    area = float(res_dict.get("area", 0.0))
    used = float(res_dict.get("used", 0.0))
    util = (used / area * 100.0) if area > 0 else 0.0
    total_band_m = banding_total(parts) / 100

    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#1c261e"),
    )
    sub_style = ParagraphStyle(
        "ReportSub",
        parent=styles["Normal"],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#53654d"),
    )
    h2_style = ParagraphStyle(
        "H2",
        parent=styles["Heading2"],
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#2a382d"),
    )

    story = []

    # Palette
    color_map = [
        colors.HexColor("#c5d4af"),
        colors.HexColor("#e9d5ae"),
        colors.HexColor("#b9cfcb"),
        colors.HexColor("#d8c6bc"),
        colors.HexColor("#c9c8dc"),
        colors.HexColor("#dfcba0"),
    ]

    for idx, sheet in enumerate(sheets):
        if idx > 0:
            story.append(PageBreak())

        sw = float(sheet["w"])
        sh = float(sheet["h"])
        s_label = str(sheet.get("label", "Stock sheet"))
        pieces = sheet.get("pieces", [])

        if idx == 0:
            story.append(Paragraph("SHEETWISE CUTTING PLAN", sub_style))
            story.append(Paragraph("A place for every piece.", title_style))
            story.append(Spacer(1, 8))

            stats_data = [
                ["UTILIZATION", "SHEETS", "UNUSED AREA", "EDGE BANDING"],
                [
                    f"{util:.1f}%",
                    f"{len(sheets)}",
                    f"{(100 - util):.1f}%",
                    f"{total_band_m:.2f} m",
                ],
            ]
            stats_table = Table(stats_data, colWidths=[140, 100, 140, 140])
            stats_table.setStyle(
                TableStyle([
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f6f7f2")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#666666")),
                    ("FONTSIZE", (0, 0), (-1, 0), 8),
                    ("FONTSIZE", (0, 1), (-1, 1), 12),
                    ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                ])
            )
            story.append(stats_table)
            story.append(Spacer(1, 12))

        story.append(Paragraph(f"Sheet {idx + 1} of {len(sheets)}: {s_label} ({fmt_dim(sw)} × {fmt_dim(sh)} cm)", h2_style))
        story.append(Paragraph(f"{len(pieces)} pieces placed · Saw kerf {fmt_dim(kerf * 10)} mm", sub_style))
        story.append(Spacer(1, 8))

        # Draw sheet diagram using ReportLab Drawing
        dw_max = 500
        dh_max = 240
        scale = min(dw_max / sw, dh_max / sh)
        dw = sw * scale
        dh = sh * scale

        d = Drawing(dw, dh)
        # Background board
        d.add(Rect(0, 0, dw, dh, fillColor=colors.HexColor("#e8eadf"), strokeColor=colors.HexColor("#a8b29b"), strokeWidth=1))

        # Pieces (ReportLab origin is bottom-left, SVG origin is top-left)
        for p in pieces:
            px = float(p["x"]) * scale
            py = dh - (float(p["y"]) + float(p["h"])) * scale
            pw = float(p["w"]) * scale
            ph = float(p["h"]) * scale
            turn = bool(p.get("turn", False))
            col_idx = int(p.get("color", 0)) % len(color_map)
            col = color_map[col_idx]

            d.add(Rect(px, py, pw, ph, fillColor=col, strokeColor=colors.white, strokeWidth=0.5))

            lbl = str(p.get("label", ""))[:14]
            if pw > 25 and ph > 15:
                d.add(String(px + pw / 2.0, py + ph / 2.0 + 2, lbl, textAnchor="middle", fontSize=7, fillColor=colors.HexColor("#344737")))
                dim_str = f"{fmt_dim(p['w'])}x{fmt_dim(p['h'])}{'R' if turn else ''}"
                d.add(String(px + pw / 2.0, py + ph / 2.0 - 7, dim_str, textAnchor="middle", fontSize=6, fillColor=colors.HexColor("#53654d")))

        story.append(d)
        story.append(Spacer(1, 10))

        # Match the report table, including banded-edge marks above dimensions.
        story.append(Paragraph("Parts to cut", h2_style))
        groups = {}
        for p in pieces:
            e = p.get("edges") or {}
            wb = int(bool(e.get("top"))) + int(bool(e.get("bottom")))
            hb = int(bool(e.get("left"))) + int(bool(e.get("right")))
            width_bands, height_bands = (hb, wb) if p.get("turn") else (wb, hb)
            key = (str(p.get("label", "Part")), float(p["w"]), float(p["h"]), width_bands, height_bands)
            if key not in groups:
                groups[key] = 0
            groups[key] += 1

        def measurement(value, bands):
            label = fmt_dim(value)
            drawing = Drawing(100, 18)
            drawing.add(String(0, 1, label, fontSize=9, fillColor=colors.HexColor("#334b43")))
            for n in range(bands):
                drawing.add(Line(0, 12 + n * 2, len(label) * 5, 12 + n * 2,
                                 strokeWidth=0.5, strokeColor=colors.HexColor("#334b43")))
            return drawing

        table_data = [["LABEL", "WIDTH (cm)", "HEIGHT (cm)", "QTY"]]
        for (label, w, h, wb, hb), count in groups.items():
            table_data.append([label, measurement(w, wb), measurement(h, hb), str(count)])

        t = Table(table_data, colWidths=[126, 165, 174, 75], repeatRows=1)
        t.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#edf0e8")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#bdc4b8")),
                ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#334b43")),
            ])
        )
        story.append(t)

    doc.build(story)

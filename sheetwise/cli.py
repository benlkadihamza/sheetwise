from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Dict, List

from .banding import banding_total
from .optimizer import optimize
from .report import generate_html_report, generate_pdf_report
from .server import run_server
from .svg import fmt_dim, render_sheet_svg


def parse_stock_spec(s: str) -> List[Dict[str, Any]]:
    """Parse stock from file path or dimensions string like 244x122 or 244x122:5."""
    if os.path.isfile(s):
        with open(s, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else [data]
    # Check for dimension string: WxH or WxH:QTY
    parts = s.split(":")
    dims = parts[0].lower().split("x")
    if len(dims) == 2:
        w, h = float(dims[0]), float(dims[1])
        qty = int(parts[1]) if len(parts) > 1 else None
        res = {"w": w, "h": h, "label": "Stock sheet"}
        if qty is not None:
            res["qty"] = qty
        return [res]
    raise ValueError(f"Unrecognized stock format: {s}")


def parse_parts_spec(s: str) -> List[Dict[str, Any]]:
    """Parse parts from file path or JSON string."""
    if os.path.isfile(s):
        with open(s, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else [data]
    try:
        data = json.loads(s)
        return data if isinstance(data, list) else [data]
    except Exception:
        raise ValueError(f"Expected a valid JSON file or JSON array for parts, got: {s}")


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="sheetwise",
        description="Sheetwise — Intelligent sheet cutting layout planner with guillotine optimization.",
    )
    subparsers = parser.add_subparsers(dest="command", help="Available subcommands")

    # Command: optimize
    opt_p = subparsers.add_parser("optimize", help="Optimize cutting layout for given parts and stock")
    opt_p.add_argument("--parts", required=True, help="Path to parts JSON file or JSON string")
    opt_p.add_argument("--stock", required=True, help="Stock sheet dimensions (e.g. '244x122' or '244x122:3') or JSON file")
    opt_p.add_argument("--kerf", type=float, default=4.0, help="Saw kerf in millimeters (default: 4.0 mm)")
    opt_p.add_argument("--rotate", action="store_true", help="Allow 90° rotation for rotatable parts")
    opt_p.add_argument("--no-split", action="store_true", help="Disallow splitting quantities across sheets")
    opt_p.add_argument("--out", help="Path to write layout JSON result")
    opt_p.add_argument("--svg", help="Path to export SVG diagram (or prefix for multiple sheets)")
    opt_p.add_argument("--pdf", help="Path to export PDF report")
    opt_p.add_argument("--html", help="Path to export HTML printable report")

    # Command: server
    srv_p = subparsers.add_parser("server", help="Start the web application and REST API server")
    srv_p.add_argument("--port", type=int, default=4174, help="Port to listen on (default: 4174)")
    srv_p.add_argument("--host", default="127.0.0.1", help="Host interface (default: 127.0.0.1)")

    # Command: check
    subparsers.add_parser("check", help="Run the test suite and verify optimizer constraints")

    args = parser.parse_args(argv)

    if not args.command:
        parser.print_help()
        return 0

    if args.command == "server":
        run_server(port=args.port, host=args.host)
        return 0

    if args.command == "check":
        from ..check import run_checks
        run_checks()
        return 0

    if args.command == "optimize":
        parts = parse_parts_spec(args.parts)
        stock = parse_stock_spec(args.stock)
        kerf_cm = args.kerf / 10.0  # Convert mm to cm

        # Default part allowRotate if global rotate is set
        if args.rotate:
            for p in parts:
                if "allowRotate" not in p and "allow_rotate" not in p:
                    p["allowRotate"] = True

        split_quantities = not args.no_split
        print(f"Optimizing: {len(parts)} part types ({sum(p.get('qty', 1) for p in parts)} pieces)...")
        res = optimize(parts, stock, kerf_cm, args.rotate, split_quantities=split_quantities)

        sheets = res["sheets"]
        unplaced = res["unplaced"]
        area = res["area"]
        used = res["used"]
        util = (used / area * 100.0) if area > 0 else 0.0

        print("\n--- OPTIMIZATION SUMMARY ---")
        print(f"Sheets required:       {len(sheets)}")
        print(f"Pieces placed:         {sum(len(s['pieces']) for s in sheets)}")
        print(f"Unplaced pieces:       {len(unplaced)}")
        print(f"Material utilization:  {util:.1f}%")
        print(f"Arrangements tested:   {res['arrangementsEvaluated']}")
        print(f"Total edge banding:    {banding_total(parts) / 100:.2f} m")

        if unplaced:
            print("\nWARNING: The following pieces could not fit:")
            for p in unplaced:
                print(f"  - {p.get('label', 'Part')}: {fmt_dim(p['w'])} × {fmt_dim(p['h'])} cm")

        # Export outputs
        if args.out:
            with open(args.out, "w", encoding="utf-8") as f:
                json.dump(res if isinstance(res, dict) else res.to_dict(), f, indent=2)
            print(f"Saved layout JSON: {args.out}")

        if args.svg:
            if len(sheets) == 1:
                svg_data = render_sheet_svg(sheets[0])
                svg_filename = args.svg if args.svg.endswith(".svg") else f"{args.svg}.svg"
                with open(svg_filename, "w", encoding="utf-8") as f:
                    f.write(svg_data)
                print(f"Saved SVG: {svg_filename}")
            else:
                base, ext = os.path.splitext(args.svg)
                ext = ext or ".svg"
                for i, s in enumerate(sheets):
                    svg_filename = f"{base}_{i + 1}{ext}"
                    with open(svg_filename, "w", encoding="utf-8") as f:
                        f.write(render_sheet_svg(s))
                    print(f"Saved SVG (Sheet {i + 1}): {svg_filename}")

        if args.html:
            html = generate_html_report(res, parts, kerf_cm)
            with open(args.html, "w", encoding="utf-8") as f:
                f.write(html)
            print(f"Saved HTML report: {args.html}")

        if args.pdf:
            generate_pdf_report(res, parts, kerf_cm, args.pdf)
            print(f"Saved PDF report: {args.pdf}")

        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())

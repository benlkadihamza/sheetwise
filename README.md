# Sheetwise (Python Rebuild)

A powerful sheet cutting planner and guillotine layout optimizer rebuilt in Python. Enter stock dimensions and part quantities, calculate optimal cutting layouts, measure edge remnants, account for saw kerf and edge banding, and generate printable reports, PDF exports, and SVG diagrams.

---

## Highlights

- **Pure Python with Zero Required Dependencies**: Core optimizer, geometric solvers, data models, CLI, and web server run purely using standard library Python 3.8+.
- **100% Behavioral Parity**: Pass all test suites verifying kerf tolerance, bounds, rotation, edge remnants, automatic sheet scaling, grouped placement, and fill-first exhaustion.
- **Full Interactive Web UI & REST API**: Run the built-in HTTP server to access the browser workspace or integrate with backend systems via JSON endpoints.
- **Export Options**: Export layout SVGs, printable HTML reports, and native PDFs.
- **Rich CLI & Python Library**: Optimize layouts via command line or import `sheetwise` directly in your Python applications.

---

## Quickstart

### 1. Run the Web Application

Start the local server (default port `4174`):

```sh
python server.py
# or
python -m sheetwise server
```

Open [http://127.0.0.1:4174/](http://127.0.0.1:4174/) in your browser. Set the `PORT` environment variable to use a different port.

### 2. Run the Test Suite

Verify all mathematical constraints, non-overlapping rules, and 100+ randomized layouts:

```sh
python check.py
# or
python -m unittest discover tests
```

---

## Command Line Interface (CLI)

Sheetwise includes a full-featured CLI:

```sh
# Show CLI options
python -m sheetwise --help

# Optimize a cutting job and export SVG + PDF + JSON
python -m sheetwise optimize \
  --parts examples/parts.json \
  --stock examples/stock.json \
  --kerf 4 \
  --rotate \
  --out layout.json \
  --svg layout.svg \
  --pdf report.pdf
```

### CLI Options for `optimize`:

- `--parts <path|json>`: Path to parts JSON file or inline JSON string.
- `--stock <dimensions|path>`: Stock sheet dimensions (e.g. `244x122` or `244x122:3` for 3 sheets) or path to JSON file.
- `--kerf <mm>`: Saw kerf width in millimeters (default: `4.0` mm).
- `--rotate`: Allow 90-degree rotation when optimizing piece arrangement.
- `--no-split`: Keep grouped part quantities together instead of packing individual pieces.
- `--out <file.json>`: Save full optimization result in JSON format.
- `--svg <file.svg>`: Export SVG cutting diagram(s).
- `--html <file.html>`: Generate a standalone printable HTML report.
- `--pdf <file.pdf>`: Generate a PDF report (requires `reportlab`).

---

## Python API Usage

Use `sheetwise` in your Python scripts and pipelines:

```python
from sheetwise import optimize, render_sheet_svg, banding_total

parts = [
    {"label": "Side panel", "w": 72, "h": 40, "qty": 4, "edges": {"top": True, "bottom": True}},
    {"label": "Shelf", "w": 56, "h": 38, "qty": 6, "edges": {"left": True, "right": True}},
    {"label": "Door", "w": 70, "h": 30, "qty": 2, "allowRotate": True},
]

stock = [
    {"label": "Birch plywood", "w": 244, "h": 122}
]

# Run optimization (kerf is specified in cm: 4mm = 0.4cm)
result = optimize(parts, stock, kerf=0.4, rotate=True, split_quantities=True)

print(f"Sheets required: {len(result.sheets)}")
print(f"Utilization: {result.utilization_percentage:.1f}%")
print(f"Edge banding total: {banding_total(parts):.2f} cm")

# Generate SVG for the first sheet
svg_markup = render_sheet_svg(result.sheets[0])
with open("sheet_1.svg", "w", encoding="utf-8") as f:
    f.write(svg_markup)
```

---

## Project Structure

```
sheetwise/
├── __init__.py          # Public Python API exports
├── __main__.py          # CLI entry point (`python -m sheetwise`)
├── models.py            # Dataclasses (Part, Stock, SheetLayout, Piece, FreeRect, etc.)
├── optimizer.py         # Guillotine cutting optimizer & heuristic search
├── banding.py           # Edge banding perimeter calculations
├── units.py             # Metric conversions (mm to cm)
├── svg.py               # Vector diagram generation with dimensions & remnants
├── report.py            # Printable HTML and PDF report generator
├── server.py            # Local HTTP server and REST API
└── cli.py               # Command-line interface implementation
server.py                # Standalone preview server runner (`python server.py`)
check.py                 # Comprehensive constraint and regression test suite
app.py                   # Application entry point
dist/                    # Static web application files (HTML, CSS, JS)
examples/                # Example input files (parts.json, stock.json)
tests/                   # Python unittest test suite
pyproject.toml           # Modern Python package configuration
requirements.txt         # Optional dependencies
README.md                # Documentation
```

---

## REST API Endpoints

When `server.py` is running, the following endpoints are available:

- `GET /`: Serves the interactive browser application.
- `GET /api/status`: Health check and server backend info.
- `POST /api/optimize`: Run optimizer with JSON payload `{"parts": [...], "stock": [...], "kerf": 0.4, "rotate": true}`.
- `POST /api/export/svg`: Returns SVG diagram XML for a sheet.
- `POST /api/export/html`: Returns standalone printable HTML cutting report.
- `POST /api/export/pdf`: Returns downloadable PDF cutting report.

---

## Node Compatibility

The original Node.js scripts remain available if needed:
- `npm run start:node` (or `node server.cjs`)
- `npm run test:node` (or `node check.cjs`)

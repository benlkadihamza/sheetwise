"""Sheetwise — A python sheet cutting planner and guillotine layout optimizer.

Calculate stock requirements, guillotine cutting layouts, remnant dimensions,
edge banding lengths, and generate printable reports and SVG diagrams.
"""

from .banding import banding_length, banding_total
from .models import (
    EdgeBanding,
    FreeRect,
    OptimizationResult,
    Part,
    Piece,
    SheetLayout,
    Stock,
)
from .optimizer import optimize, place_group
from .report import generate_html_report, generate_pdf_report
from .server import SheetwiseRequestHandler, run_server
from .svg import render_sheet_svg
from .units import project_in_centimeters

__version__ = "1.0.0"

__all__ = [
    "EdgeBanding",
    "FreeRect",
    "OptimizationResult",
    "Part",
    "Piece",
    "SheetLayout",
    "Stock",
    "banding_length",
    "banding_total",
    "generate_html_report",
    "generate_pdf_report",
    "optimize",
    "place_group",
    "project_in_centimeters",
    "render_sheet_svg",
    "run_server",
    "SheetwiseRequestHandler",
]

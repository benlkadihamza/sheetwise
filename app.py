#!/usr/bin/env python3
"""Main entry point for Sheetwise application.

Run with:
    python app.py
"""

from server import main if "main" in dir() else None
from sheetwise.server import run_server

if __name__ == "__main__":
    run_server()

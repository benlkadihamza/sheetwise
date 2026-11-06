#!/usr/bin/env python3
"""Sheetwise local preview server and REST API.

Run with:
    python server.py
"""

import os
from sheetwise.server import run_server

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 4174))
    run_server(port=port)

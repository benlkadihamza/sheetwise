from __future__ import annotations

import io
import json
import mimetypes
import os
import sys
import tempfile
import urllib.parse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Dict, Optional

from .banding import banding_total
from .optimizer import optimize
from .report import generate_html_report, generate_pdf_report
from .svg import render_sheet_svg


class SheetwiseRequestHandler(BaseHTTPRequestHandler):
    """HTTP request handler providing static web application serving and REST API."""

    def __init__(self, *args: Any, dist_dir: Optional[str] = None, **kwargs: Any) -> None:
        if dist_dir is None:
            # Locate dist directory relative to project root
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            dist_dir = os.path.join(base_dir, "dist")
        self.dist_dir = os.path.abspath(dist_dir)
        super().__init__(*args, **kwargs)

    def log_message(self, format: str, *args: Any) -> None:
        # Cleaner console logs
        sys.stderr.write(f"[{self.log_date_time_string()}] {format % args}\n")

    def send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path == "/api/status":
            self.send_json({
                "status": "ok",
                "service": "Sheetwise",
                "version": "1.0.0",
                "backend": "Python " + sys.version.split()[0],
            })
            return

        self.serve_static(path)

    def do_POST(self) -> None:
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        content_length = int(self.headers.get("Content-Length", 0))
        if content_length > 10 * 1024 * 1024:  # 10 MB limit
            self.send_error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "Payload too large")
            return

        body = self.rfile.read(content_length)
        try:
            data = json.loads(body.decode("utf-8")) if body else {}
        except Exception as e:
            self.send_error(HTTPStatus.BAD_REQUEST, f"Invalid JSON payload: {e}")
            return

        if path == "/api/optimize":
            self.handle_api_optimize(data)
        elif path == "/api/export/svg":
            self.handle_api_export_svg(data)
        elif path == "/api/export/pdf":
            self.handle_api_export_pdf(data)
        elif path == "/api/export/html":
            self.handle_api_export_html(data)
        else:
            self.send_error(HTTPStatus.NOT_FOUND, "Endpoint not found")

    def handle_api_optimize(self, data: Dict[str, Any]) -> None:
        try:
            parts = data.get("parts", [])
            stock = data.get("stock", [])
            kerf = float(data.get("kerf", 0.4))
            rotate = bool(data.get("rotate", False))
            split_quantities = bool(data.get("splitQuantities", data.get("split_quantities", True)))

            result = optimize(parts, stock, kerf, rotate, split_quantities=split_quantities)
            res_dict = result if isinstance(result, dict) else result.to_dict()
            res_dict["bandingTotal"] = banding_total(parts)

            self.send_json(res_dict)
        except Exception as e:
            self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, f"Optimization error: {e}")

    def handle_api_export_svg(self, data: Dict[str, Any]) -> None:
        try:
            sheet = data.get("sheet", data)
            svg_content = render_sheet_svg(sheet)
            svg_bytes = svg_content.encode("utf-8")

            self.send_response(HTTPStatus.OK)
            self.send_cors_headers()
            self.send_header("Content-Type", "image/svg+xml; charset=utf-8")
            self.send_header("Content-Length", str(len(svg_bytes)))
            self.end_headers()
            self.wfile.write(svg_bytes)
        except Exception as e:
            self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, f"SVG rendering error: {e}")

    def handle_api_export_html(self, data: Dict[str, Any]) -> None:
        try:
            result = data.get("result", {})
            parts = data.get("parts", [])
            kerf = float(data.get("kerf", 0.4))
            html = generate_html_report(result, parts, kerf)
            html_bytes = html.encode("utf-8")

            self.send_response(HTTPStatus.OK)
            self.send_cors_headers()
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(html_bytes)))
            self.end_headers()
            self.wfile.write(html_bytes)
        except Exception as e:
            self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, f"HTML report error: {e}")

    def handle_api_export_pdf(self, data: Dict[str, Any]) -> None:
        try:
            result = data.get("result", {})
            parts = data.get("parts", [])
            kerf = float(data.get("kerf", 0.4))

            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                tmp_path = tmp.name

            try:
                generate_pdf_report(result, parts, kerf, tmp_path)
                with open(tmp_path, "rb") as f:
                    pdf_bytes = f.read()
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)

            self.send_response(HTTPStatus.OK)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Disposition", 'attachment; filename="sheetwise_report.pdf"')
            self.send_header("Content-Length", str(len(pdf_bytes)))
            self.end_headers()
            self.wfile.write(pdf_bytes)
        except Exception as e:
            self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, f"PDF export error: {e}")

    def serve_static(self, req_path: str) -> None:
        if req_path in ("/", ""):
            req_path = "/index.html"

        # Sanitize path to prevent directory traversal
        norm_path = os.path.normpath(urllib.parse.unquote(req_path).lstrip("/"))
        file_path = os.path.abspath(os.path.join(self.dist_dir, norm_path))

        # Check that file_path is strictly inside dist_dir
        if not file_path.startswith(self.dist_dir + os.sep) and file_path != self.dist_dir:
            self.send_error(HTTPStatus.FORBIDDEN, "Forbidden")
            return

        if not os.path.isfile(file_path):
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return

        content_type, _ = mimetypes.guess_type(file_path)
        if file_path.endswith(".css"):
            content_type = "text/css; charset=utf-8"
        elif file_path.endswith(".js"):
            content_type = "application/javascript; charset=utf-8"
        elif file_path.endswith(".html"):
            content_type = "text/html; charset=utf-8"
        elif file_path.endswith(".svg"):
            content_type = "image/svg+xml; charset=utf-8"
        elif not content_type:
            content_type = "application/octet-stream"

        try:
            with open(file_path, "rb") as f:
                content = f.read()

            self.send_response(HTTPStatus.OK)
            self.send_cors_headers()
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, f"File read error: {e}")

    def send_json(self, data: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        encoded = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def run_server(
    port: Optional[int] = None,
    host: str = "127.0.0.1",
    dist_dir: Optional[str] = None,
) -> None:
    """Run the Sheetwise HTTP server."""
    if port is None:
        port = int(os.environ.get("PORT", 4174))

    handler_factory = lambda *args, **kwargs: SheetwiseRequestHandler(
        *args, dist_dir=dist_dir, **kwargs
    )
    httpd = HTTPServer((host, port), handler_factory)
    print(f"Sheetwise: http://{host}:{port}/")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Sheetwise server.")
        httpd.server_close()


if __name__ == "__main__":
    run_server()

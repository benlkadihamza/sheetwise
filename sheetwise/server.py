from __future__ import annotations

import hashlib
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

from .adapter import ProjectDataAdapter
from .banding import banding_total
from .db import CustomerRepository, CuttingRecordRepository, ProjectRepository, UserRepository, init_db
from .optimizer import optimize
from .report import generate_html_report, generate_pdf_report
from .storage import StorageManager
from .svg import render_sheet_svg


class SheetwiseRequestHandler(BaseHTTPRequestHandler):
    """HTTP request handler providing static web application serving and REST API."""

    def __init__(self, *args: Any, dist_dir: Optional[str] = None, **kwargs: Any) -> None:
        if dist_dir is None:
            # Locate dist directory relative to project root
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            dist_dir = os.path.join(base_dir, "dist")
        self.dist_dir = os.path.abspath(dist_dir)
        self.cust_repo = CustomerRepository()
        self.proj_repo = ProjectRepository()
        self.rec_repo = CuttingRecordRepository()
        self.user_repo = UserRepository()
        self.storage = StorageManager()
        super().__init__(*args, **kwargs)

    def log_message(self, format: str, *args: Any) -> None:
        # Cleaner console logs
        sys.stderr.write(f"[{self.log_date_time_string()}] {format % args}\n")

    def send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query_params = urllib.parse.parse_qs(parsed_url.query)

        if path == "/api/status":
            self.send_json({
                "status": "ok",
                "service": "Sheetwise",
                "version": "1.0.0",
                "backend": "Python " + sys.version.split()[0],
                "users_count": self.user_repo.count()
            })
            return

        # Auth check endpoint
        if path == "/api/auth/me":
            # For local session, can return user or status
            self.send_json({"authenticated": True})
            return

        # Customers API
        if path == "/api/customers":
            q = query_params.get("q", [None])[0]
            customers = self.cust_repo.list_all(query=q)
            self.send_json(customers)
            return

        if path.startswith("/api/customers/"):
            parts = [p for p in path.split("/") if p]
            # /api/customers/<id> or /api/customers/<id>/activity or /api/customers/<id>/projects
            if len(parts) == 3:
                customer_id = parts[2]
                customer = self.cust_repo.get_by_id(customer_id)
                if not customer:
                    self.send_error(HTTPStatus.NOT_FOUND, "Customer not found")
                    return
                self.send_json(customer)
                return
            elif len(parts) == 4 and parts[3] == "activity":
                customer_id = parts[2]
                activity = self.rec_repo.list_customer_activity(customer_id)
                self.send_json(activity)
                return
            elif len(parts) == 4 and parts[3] == "projects":
                customer_id = parts[2]
                projects = self.proj_repo.list_by_customer(customer_id)
                self.send_json(projects)
                return

        # Projects API
        if path.startswith("/api/projects/"):
            parts = [p for p in path.split("/") if p]
            if len(parts) == 3:
                project_id = parts[2]
                project = self.proj_repo.get_by_id(project_id)
                if not project:
                    self.send_error(HTTPStatus.NOT_FOUND, "Project not found")
                    return
                # Also include cutting record if exists
                rec = self.rec_repo.get_by_project_id(project_id)
                project["cutting_record"] = rec
                self.send_json(project)
                return

        # Records API
        if path.startswith("/api/records/"):
            parts = [p for p in path.split("/") if p]
            if len(parts) == 3:
                record_id = parts[2]
                record = self.rec_repo.get_by_id(record_id)
                if not record:
                    self.send_error(HTTPStatus.NOT_FOUND, "Record not found")
                    return
                self.send_json(record)
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
        elif path == "/api/auth/register":
            self.handle_auth_register(data)
        elif path == "/api/auth/login":
            self.handle_auth_login(data)
        elif path == "/api/export/svg":
            self.handle_api_export_svg(data)
        elif path == "/api/export/pdf":
            self.handle_api_export_pdf(data)
        elif path == "/api/export/html":
            self.handle_api_export_html(data)
        # Customer Management Endpoints
        elif path == "/api/customers":
            self.handle_create_customer(data)
        elif path == "/api/customers/check":
            self.handle_check_customer(data)
        # Project Management Endpoints
        elif path == "/api/projects":
            self.handle_create_project(data)
        # Cutting Record Save Endpoints
        elif path == "/api/records/quick":
            self.handle_save_quick_record(data)
        elif path == "/api/records/project":
            self.handle_save_project_record(data)
        else:
            self.send_error(HTTPStatus.NOT_FOUND, "Endpoint not found")

    def do_PUT(self) -> None:
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)
        try:
            data = json.loads(body.decode("utf-8")) if body else {}
        except Exception as e:
            self.send_error(HTTPStatus.BAD_REQUEST, f"Invalid JSON payload: {e}")
            return

        parts = [p for p in path.split("/") if p]
        if len(parts) == 3 and parts[1] == "customers":
            customer_id = parts[2]
            name = data.get("name")
            if not name or not str(name).strip():
                self.send_error(HTTPStatus.BAD_REQUEST, "Customer name is required")
                return
            updated = self.cust_repo.update(
                customer_id=customer_id,
                name=str(name).strip(),
                phone=data.get("phone"),
                email=data.get("email"),
                address=data.get("address"),
                notes=data.get("notes"),
            )
            if not updated:
                self.send_error(HTTPStatus.NOT_FOUND, "Customer not found")
                return
            self.send_json(updated)
            return

        if len(parts) == 3 and parts[1] == "projects":
            project_id = parts[2]
            updated = self.proj_repo.update(
                project_id=project_id,
                name=data.get("name"),
                description=data.get("description"),
                status=data.get("status"),
            )
            if not updated:
                self.send_error(HTTPStatus.NOT_FOUND, "Project not found")
                return
            self.send_json(updated)
            return

        if len(parts) == 3 and parts[1] == "records":
            record_id = parts[2]
            cutting_data = data.get("cutting_data", data)
            rec = self.rec_repo.get_by_id(record_id)
            if not rec:
                self.send_error(HTTPStatus.NOT_FOUND, "Record not found")
                return

            # Save updated file
            try:
                storage_rel = self.storage.save_cutting_record_files(
                    record_type=rec["record_type"],
                    record_id=rec["id"],
                    cutting_data=cutting_data,
                    customer_id=rec["customer_id"],
                    project_id=rec["project_id"]
                )
            except Exception:
                storage_rel = rec["storage_path"]

            updated = self.rec_repo.update(
                record_id=record_id,
                cutting_data=cutting_data,
                storage_path=storage_rel,
                customer_id=data.get("customer_id", rec["customer_id"]),
                name=data.get("name")
            )
            self.send_json(updated)
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Endpoint not found")

    def do_DELETE(self) -> None:
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        parts = [p for p in path.split("/") if p]

        if len(parts) == 3 and parts[1] == "customers":
            customer_id = parts[2]
            ok = self.cust_repo.delete(customer_id)
            if not ok:
                self.send_error(HTTPStatus.NOT_FOUND, "Customer not found")
                return
            self.send_json({"success": True, "deleted_id": customer_id})
            return

        if len(parts) == 3 and parts[1] == "projects":
            project_id = parts[2]
            ok = self.proj_repo.delete(project_id)
            if not ok:
                self.send_error(HTTPStatus.NOT_FOUND, "Project not found")
                return
            self.send_json({"success": True, "deleted_id": project_id})
            return

        if len(parts) == 3 and parts[1] == "records":
            record_id = parts[2]
            ok = self.rec_repo.delete(record_id)
            if not ok:
                self.send_error(HTTPStatus.NOT_FOUND, "Record not found")
                return
            self.send_json({"success": True, "deleted_id": record_id})
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Endpoint not found")

    def handle_auth_register(self, data: Dict[str, Any]) -> None:
        name = (data.get("name") or "").strip()
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""

        if not name or not email or not password:
            self.send_error(HTTPStatus.BAD_REQUEST, "Name, email, and password are required")
            return

        if self.user_repo.get_by_email(email):
            self.send_error(HTTPStatus.CONFLICT, "User with this email already exists")
            return

        pwd_hash = hashlib.sha256(password.encode("utf-8")).hexdigest()
        user = self.user_repo.create(name=name, email=email, password_hash=pwd_hash)
        self.send_json({"success": True, "user": user}, status=HTTPStatus.CREATED)

    def handle_auth_login(self, data: Dict[str, Any]) -> None:
        username = (data.get("username") or data.get("email") or "").strip().lower()
        password = data.get("password") or ""

        if not username or not password:
            self.send_error(HTTPStatus.BAD_REQUEST, "Username and password are required")
            return

        user = self.user_repo.get_by_email(username)
        if not user:
            self.send_error(HTTPStatus.UNAUTHORIZED, "Invalid username or password")
            return

        pwd_hash = hashlib.sha256(password.encode("utf-8")).hexdigest()
        if user["password_hash"] != pwd_hash:
            self.send_error(HTTPStatus.UNAUTHORIZED, "Invalid username or password")
            return

        self.send_json({
            "success": True,
            "user": {
                "id": user["id"],
                "name": user["name"],
                "username": user["email"],
                "created_at": user["created_at"]
            }
        })

    def handle_create_customer(self, data: Dict[str, Any]) -> None:
        name = data.get("name")
        if not name or not str(name).strip():
            self.send_error(HTTPStatus.BAD_REQUEST, "Customer full name is required")
            return
        c = self.cust_repo.create(
            name=str(name).strip(),
            phone=data.get("phone"),
            email=data.get("email"),
            address=data.get("address"),
            notes=data.get("notes"),
        )
        self.send_json(c, status=HTTPStatus.CREATED)

    def handle_check_customer(self, data: Dict[str, Any]) -> None:
        name = data.get("name")
        if not name or not str(name).strip():
            self.send_json({"exists": False, "customer": None})
            return
        c = self.cust_repo.find_by_exact_name(str(name).strip())
        if c:
            self.send_json({"exists": True, "customer": c})
        else:
            self.send_json({"exists": False, "customer": None})

    def handle_create_project(self, data: Dict[str, Any]) -> None:
        customer_id = data.get("customer_id")
        name = data.get("name")
        if not customer_id or not self.cust_repo.get_by_id(customer_id):
            self.send_error(HTTPStatus.BAD_REQUEST, "Valid customer_id is required")
            return
        if not name or not str(name).strip():
            self.send_error(HTTPStatus.BAD_REQUEST, "Project name is required")
            return

        proj = self.proj_repo.create(
            customer_id=customer_id,
            name=str(name).strip(),
            description=data.get("description"),
            status=data.get("status", "active"),
        )
        self.send_json(proj, status=HTTPStatus.CREATED)

    def handle_save_quick_record(self, data: Dict[str, Any]) -> None:
        cutting_data = data.get("cutting_data")
        name = data.get("name")
        if not cutting_data or not isinstance(cutting_data, dict):
            self.send_error(HTTPStatus.BAD_REQUEST, "cutting_data dictionary is required")
            return
        customer_id = data.get("customer_id")
        if customer_id and not self.cust_repo.get_by_id(customer_id):
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid customer_id")
            return

        record_id = data.get("record_id")
        if record_id:
            # Updating an existing quick record
            existing = self.rec_repo.get_by_id(record_id)
            if not existing or existing["record_type"] != "quick":
                self.send_error(HTTPStatus.NOT_FOUND, "Quick cutting record not found")
                return
            storage_rel = self.storage.save_cutting_record_files(
                record_type="quick",
                record_id=existing["id"],
                cutting_data=cutting_data,
                customer_id=customer_id or existing["customer_id"]
            )
            rec = self.rec_repo.update(
                record_id=existing["id"],
                cutting_data=cutting_data,
                storage_path=storage_rel,
                customer_id=customer_id,
                name=name
            )
            self.send_json(rec)
            return

        # Creating new quick record
        # Pre-generate UUID so storage can use it
        import uuid
        new_id = str(uuid.uuid4())
        storage_rel = self.storage.save_cutting_record_files(
            record_type="quick",
            record_id=new_id,
            cutting_data=cutting_data,
            customer_id=customer_id
        )
        rec = self.rec_repo.create(
            record_type="quick",
            cutting_data=cutting_data,
            customer_id=customer_id,
            project_id=None,
            storage_path=storage_rel,
            record_id=new_id,
            name=name
        )
        self.send_json(rec, status=HTTPStatus.CREATED)

    def handle_save_project_record(self, data: Dict[str, Any]) -> None:
        project_id = data.get("project_id")
        cutting_data = data.get("cutting_data")
        if not project_id:
            self.send_error(HTTPStatus.BAD_REQUEST, "project_id is required")
            return
        if not cutting_data or not isinstance(cutting_data, dict):
            self.send_error(HTTPStatus.BAD_REQUEST, "cutting_data dictionary is required")
            return

        project = self.proj_repo.get_by_id(project_id)
        if not project:
            self.send_error(HTTPStatus.NOT_FOUND, "Project not found")
            return

        customer_id = project["customer_id"]

        # Check if project already has a cutting record
        existing = self.rec_repo.get_by_project_id(project_id)
        if existing:
            # Update existing record
            storage_rel = self.storage.save_cutting_record_files(
                record_type="project",
                record_id=existing["id"],
                cutting_data=cutting_data,
                customer_id=customer_id,
                project_id=project_id,
                project_meta=project
            )
            rec = self.rec_repo.update(
                record_id=existing["id"],
                cutting_data=cutting_data,
                storage_path=storage_rel
            )
            # Update project timestamp
            self.proj_repo.update(project_id=project_id)
            self.send_json(rec)
            return
        else:
            import uuid
            new_id = str(uuid.uuid4())
            storage_rel = self.storage.save_cutting_record_files(
                record_type="project",
                record_id=new_id,
                cutting_data=cutting_data,
                customer_id=customer_id,
                project_id=project_id,
                project_meta=project
            )
            rec = self.rec_repo.create(
                record_type="project",
                cutting_data=cutting_data,
                customer_id=customer_id,
                project_id=project_id,
                storage_path=storage_rel,
                record_id=new_id
            )
            self.proj_repo.update(project_id=project_id)
            self.send_json(rec, status=HTTPStatus.CREATED)

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

            bio = io.BytesIO()
            generate_pdf_report(result, parts, kerf, bio)
            pdf_bytes = bio.getvalue()

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
    host: str = "0.0.0.0",
    dist_dir: Optional[str] = None,
) -> None:
    """Run the Sheetwise HTTP server."""
    if port is None:
        port = int(os.environ.get("PORT", 4174))

    # Ensure DB is initialized
    init_db()

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

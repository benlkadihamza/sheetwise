"""
Database models and migration manager for Sheetwise Customer & Project Management.
Supports both PostgreSQL (Neon Lakebase Postgres) and SQLite with seamless switching,
foreign keys, UUID primary keys, and transaction safety.
"""

from __future__ import annotations

import contextlib
import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Generator, List, Optional

try:
    from dotenv import load_dotenv
    # Load .env / .env.local if present
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    load_dotenv(os.path.join(base_dir, ".env.local"))
    load_dotenv(os.path.join(base_dir, ".env"))
except ImportError:
    pass

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False


def get_database_url() -> Optional[str]:
    return os.environ.get("DATABASE_URL")


def get_sqlite_path() -> str:
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.environ.get("SHEETWISE_DB_PATH", os.path.join(base_dir, "sheetwise.db"))


def is_postgres() -> bool:
    db_url = get_database_url()
    return bool(db_url and HAS_PSYCOPG2 and (db_url.startswith("postgres://") or db_url.startswith("postgresql://")))


class DBWrapper:
    """Unified wrapper around SQLite or psycopg2 connection."""
    def __init__(self, raw_conn: Any, is_pg: bool):
        self.raw_conn = raw_conn
        self.is_pg = is_pg

    def cursor(self):
        if self.is_pg:
            return self.raw_conn.cursor(cursor_factory=RealDictCursor)
        return self.raw_conn.cursor()

    def commit(self):
        self.raw_conn.commit()

    def rollback(self):
        self.raw_conn.rollback()

    def close(self):
        self.raw_conn.close()

    def execute(self, sql: str, params: Optional[tuple] = None):
        cur = self.cursor()
        if self.is_pg:
            # Convert ? placeholders to %s for postgres
            sql = sql.replace("?", "%s")
        if params is not None:
            cur.execute(sql, params)
        else:
            cur.execute(sql)
        return cur


@contextlib.contextmanager
def get_connection(db_path: Optional[str] = None) -> Generator[DBWrapper, None, None]:
    if is_postgres() and db_path is None:
        db_url = get_database_url()
        # Clean sslmode if necessary for connection
        conn = psycopg2.connect(db_url)
        wrapper = DBWrapper(conn, is_pg=True)
        try:
            yield wrapper
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    else:
        # SQLite fallback (or explicit sqlite path passed)
        if db_path is None:
            db_path = get_sqlite_path()
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        wrapper = DBWrapper(conn, is_pg=False)
        try:
            yield wrapper
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def init_db(db_path: Optional[str] = None) -> None:
    """Initialize database and run migrations safely."""
    with get_connection(db_path) as conn:
        if conn.is_pg:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    applied_at TIMESTAMP WITH TIME ZONE NOT NULL
                );
            """)
            cur = conn.execute("SELECT MAX(version) AS ver FROM schema_migrations;")
            row = cur.fetchone()
            current_version = row["ver"] if (row and row["ver"] is not None) else 0

            if current_version < 1:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS customers (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        phone TEXT,
                        email TEXT,
                        address TEXT,
                        notes TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                """)

                conn.execute("""
                    CREATE TABLE IF NOT EXISTS projects (
                        id TEXT PRIMARY KEY,
                        customer_id TEXT NOT NULL,
                        name TEXT NOT NULL,
                        description TEXT,
                        status TEXT NOT NULL DEFAULT 'active',
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
                    );
                """)

                conn.execute("""
                    CREATE TABLE IF NOT EXISTS cutting_records (
                        id TEXT PRIMARY KEY,
                        customer_id TEXT,
                        project_id TEXT,
                        record_type TEXT NOT NULL,
                        name TEXT,
                        cutting_data TEXT NOT NULL,
                        storage_path TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
                        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                        CHECK (
                            (record_type = 'project' AND project_id IS NOT NULL) OR
                            (record_type = 'quick' AND project_id IS NULL)
                        )
                    );
                """)

                conn.execute("CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_projects_customer_id ON projects(customer_id);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_cutting_records_customer_id ON cutting_records(customer_id);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_cutting_records_project_id ON cutting_records(project_id);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_cutting_records_type ON cutting_records(record_type);")

                now_str = datetime.now(timezone.utc).isoformat()
                conn.execute("INSERT INTO schema_migrations (version, applied_at) VALUES (%s, %s);", (1, now_str))

            if current_version < 2:
                # Add optional name column if not exists
                cur = conn.execute("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name='cutting_records' AND column_name='name';
                """)
                if not cur.fetchone():
                    conn.execute("ALTER TABLE cutting_records ADD COLUMN name TEXT;")
                now_str = datetime.now(timezone.utc).isoformat()
                conn.execute("INSERT INTO schema_migrations (version, applied_at) VALUES (%s, %s);", (2, now_str))
        else:
            # SQLite migrations
            conn.execute("""
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    applied_at TEXT NOT NULL
                );
            """)
            
            cur = conn.execute("SELECT MAX(version) FROM schema_migrations;")
            row = cur.fetchone()
            current_version = row[0] if (row and row[0] is not None) else 0

            if current_version < 1:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS customers (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        phone TEXT,
                        email TEXT,
                        address TEXT,
                        notes TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                """)

                conn.execute("""
                    CREATE TABLE IF NOT EXISTS projects (
                        id TEXT PRIMARY KEY,
                        customer_id TEXT NOT NULL,
                        name TEXT NOT NULL,
                        description TEXT,
                        status TEXT NOT NULL DEFAULT 'active',
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
                    );
                """)

                conn.execute("""
                    CREATE TABLE IF NOT EXISTS cutting_records (
                        id TEXT PRIMARY KEY,
                        customer_id TEXT,
                        project_id TEXT,
                        record_type TEXT NOT NULL,
                        name TEXT,
                        cutting_data TEXT NOT NULL,
                        storage_path TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
                        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                        CHECK (
                            (record_type = 'project' AND project_id IS NOT NULL) OR
                            (record_type = 'quick' AND project_id IS NULL)
                        )
                    );
                """)

                conn.execute("CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_projects_customer_id ON projects(customer_id);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_cutting_records_customer_id ON cutting_records(customer_id);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_cutting_records_project_id ON cutting_records(project_id);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_cutting_records_type ON cutting_records(record_type);")

                now_str = datetime.now(timezone.utc).isoformat()
                conn.execute("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?);", (1, now_str))

            if current_version < 2:
                cur = conn.execute("PRAGMA table_info(cutting_records);")
                cols = [c[1] for c in cur.fetchall()]
                if "name" not in cols:
                    conn.execute("ALTER TABLE cutting_records ADD COLUMN name TEXT;")
                now_str = datetime.now(timezone.utc).isoformat()
                conn.execute("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?);", (2, now_str))


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


# Customer DAO
class CustomerRepository:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path

    def create(self, name: str, phone: Optional[str] = None, email: Optional[str] = None,
               address: Optional[str] = None, notes: Optional[str] = None, customer_id: Optional[str] = None) -> Dict[str, Any]:
        cid = customer_id or str(uuid.uuid4())
        now = utc_now()
        name = name.strip()
        phone = phone.strip() if phone else None
        email = email.strip() if email else None
        address = address.strip() if address else None
        notes = notes.strip() if notes else None

        with get_connection(self.db_path) as conn:
            conn.execute("""
                INSERT INTO customers (id, name, phone, email, address, notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """, (cid, name, phone, email, address, notes, now, now))
        return self.get_by_id(cid) # type: ignore

    def update(self, customer_id: str, name: str, phone: Optional[str] = None, email: Optional[str] = None,
               address: Optional[str] = None, notes: Optional[str] = None) -> Optional[Dict[str, Any]]:
        now = utc_now()
        name = name.strip()
        phone = phone.strip() if phone else None
        email = email.strip() if email else None
        address = address.strip() if address else None
        notes = notes.strip() if notes else None

        with get_connection(self.db_path) as conn:
            cur = conn.execute("""
                UPDATE customers
                SET name = ?, phone = ?, email = ?, address = ?, notes = ?, updated_at = ?
                WHERE id = ?;
            """, (name, phone, email, address, notes, now, customer_id))
            if cur.rowcount == 0:
                return None
        return self.get_by_id(customer_id)

    def delete(self, customer_id: str) -> bool:
        with get_connection(self.db_path) as conn:
            cur = conn.execute("DELETE FROM customers WHERE id = ?;", (customer_id,))
            return cur.rowcount > 0

    def get_by_id(self, customer_id: str) -> Optional[Dict[str, Any]]:
        with get_connection(self.db_path) as conn:
            cur = conn.execute("""
                SELECT c.*,
                    (SELECT COUNT(*) FROM projects p WHERE p.customer_id = c.id) AS project_count,
                    (SELECT COUNT(*) FROM cutting_records r WHERE r.customer_id = c.id AND r.record_type = 'quick') AS quick_count
                FROM customers c
                WHERE c.id = ?;
            """, (customer_id,))
            row = cur.fetchone()
            return dict(row) if row else None

    def find_by_exact_name(self, name: str) -> Optional[Dict[str, Any]]:
        with get_connection(self.db_path) as conn:
            cur = conn.execute("""
                SELECT c.*,
                    (SELECT COUNT(*) FROM projects p WHERE p.customer_id = c.id) AS project_count,
                    (SELECT COUNT(*) FROM cutting_records r WHERE r.customer_id = c.id AND r.record_type = 'quick') AS quick_count
                FROM customers c
                WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(?))
                LIMIT 1;
            """, (name,))
            row = cur.fetchone()
            return dict(row) if row else None

    def list_all(self, query: Optional[str] = None) -> List[Dict[str, Any]]:
        with get_connection(self.db_path) as conn:
            if query and query.strip():
                q = f"%{query.strip().lower()}%"
                cur = conn.execute("""
                    SELECT c.*,
                        (SELECT COUNT(*) FROM projects p WHERE p.customer_id = c.id) AS project_count,
                        (SELECT COUNT(*) FROM cutting_records r WHERE r.customer_id = c.id AND r.record_type = 'quick') AS quick_count
                    FROM customers c
                    WHERE LOWER(c.name) LIKE ? OR LOWER(COALESCE(c.phone, '')) LIKE ?
                    ORDER BY c.created_at DESC;
                """, (q, q))
            else:
                cur = conn.execute("""
                    SELECT c.*,
                        (SELECT COUNT(*) FROM projects p WHERE p.customer_id = c.id) AS project_count,
                        (SELECT COUNT(*) FROM cutting_records r WHERE r.customer_id = c.id AND r.record_type = 'quick') AS quick_count
                    FROM customers c
                    ORDER BY c.created_at DESC;
                """)
            return [dict(r) for r in cur.fetchall()]


# Project DAO
class ProjectRepository:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path

    def create(self, customer_id: str, name: str, description: Optional[str] = None,
               status: str = "active", project_id: Optional[str] = None) -> Dict[str, Any]:
        pid = project_id or str(uuid.uuid4())
        now = utc_now()
        name = name.strip()
        description = description.strip() if description else None

        with get_connection(self.db_path) as conn:
            conn.execute("""
                INSERT INTO projects (id, customer_id, name, description, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?);
            """, (pid, customer_id, name, description, status, now, now))
        return self.get_by_id(pid) # type: ignore

    def update(self, project_id: str, name: Optional[str] = None, description: Optional[str] = None,
               status: Optional[str] = None) -> Optional[Dict[str, Any]]:
        now = utc_now()
        existing = self.get_by_id(project_id)
        if not existing:
            return None

        new_name = name.strip() if name is not None else existing["name"]
        new_desc = description.strip() if description is not None else existing["description"]
        new_status = status if status is not None else existing["status"]

        with get_connection(self.db_path) as conn:
            conn.execute("""
                UPDATE projects
                SET name = ?, description = ?, status = ?, updated_at = ?
                WHERE id = ?;
            """, (new_name, new_desc, new_status, now, project_id))
        return self.get_by_id(project_id)

    def delete(self, project_id: str) -> bool:
        with get_connection(self.db_path) as conn:
            cur = conn.execute("DELETE FROM projects WHERE id = ?;", (project_id,))
            return cur.rowcount > 0

    def get_by_id(self, project_id: str) -> Optional[Dict[str, Any]]:
        with get_connection(self.db_path) as conn:
            cur = conn.execute("""
                SELECT p.*, c.name AS customer_name
                FROM projects p
                JOIN customers c ON p.customer_id = c.id
                WHERE p.id = ?;
            """, (project_id,))
            row = cur.fetchone()
            return dict(row) if row else None

    def list_by_customer(self, customer_id: str) -> List[Dict[str, Any]]:
        with get_connection(self.db_path) as conn:
            cur = conn.execute("""
                SELECT p.*, c.name AS customer_name
                FROM projects p
                JOIN customers c ON p.customer_id = c.id
                WHERE p.customer_id = ?
                ORDER BY p.updated_at DESC;
            """, (customer_id,))
            return [dict(r) for r in cur.fetchall()]


# CuttingRecord DAO
class CuttingRecordRepository:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path

    def create(self, record_type: str, cutting_data: Dict[str, Any],
               customer_id: Optional[str] = None, project_id: Optional[str] = None,
               storage_path: Optional[str] = None, record_id: Optional[str] = None,
               name: Optional[str] = None) -> Dict[str, Any]:
        rid = record_id or str(uuid.uuid4())
        now = utc_now()
        data_str = json.dumps(cutting_data)
        record_name = name.strip() if name and name.strip() else None

        if record_type == "project" and not project_id:
            raise ValueError("project_id is required for record_type='project'")
        if record_type == "quick" and project_id:
            raise ValueError("project_id must be null for record_type='quick'")

        with get_connection(self.db_path) as conn:
            conn.execute("""
                INSERT INTO cutting_records (id, customer_id, project_id, record_type, name, cutting_data, storage_path, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (rid, customer_id, project_id, record_type, record_name, data_str, storage_path, now, now))
        return self.get_by_id(rid) # type: ignore

    def update(self, record_id: str, cutting_data: Dict[str, Any],
               storage_path: Optional[str] = None, customer_id: Optional[str] = None,
               name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        now = utc_now()
        data_str = json.dumps(cutting_data)
        existing = self.get_by_id(record_id)
        if not existing:
            return None

        final_customer_id = customer_id if customer_id is not None else existing["customer_id"]
        final_storage_path = storage_path if storage_path is not None else existing["storage_path"]
        final_name = name.strip() if (name is not None and name.strip()) else existing.get("name")

        with get_connection(self.db_path) as conn:
            conn.execute("""
                UPDATE cutting_records
                SET cutting_data = ?, storage_path = ?, customer_id = ?, name = ?, updated_at = ?
                WHERE id = ?;
            """, (data_str, final_storage_path, final_customer_id, final_name, now, record_id))
        return self.get_by_id(record_id)

    def delete(self, record_id: str) -> bool:
        with get_connection(self.db_path) as conn:
            cur = conn.execute("DELETE FROM cutting_records WHERE id = ?;", (record_id,))
            return cur.rowcount > 0

    def get_by_id(self, record_id: str) -> Optional[Dict[str, Any]]:
        with get_connection(self.db_path) as conn:
            cur = conn.execute("""
                SELECT r.*, c.name AS customer_name, p.name AS project_name
                FROM cutting_records r
                LEFT JOIN customers c ON r.customer_id = c.id
                LEFT JOIN projects p ON r.project_id = p.id
                WHERE r.id = ?;
            """, (record_id,))
            row = cur.fetchone()
            if not row:
                return None
            res = dict(row)
            try:
                res["cutting_data"] = json.loads(res["cutting_data"])
            except Exception:
                pass
            return res

    def get_by_project_id(self, project_id: str) -> Optional[Dict[str, Any]]:
        with get_connection(self.db_path) as conn:
            cur = conn.execute("""
                SELECT r.*, c.name AS customer_name, p.name AS project_name
                FROM cutting_records r
                LEFT JOIN customers c ON r.customer_id = c.id
                LEFT JOIN projects p ON r.project_id = p.id
                WHERE r.project_id = ?
                ORDER BY r.updated_at DESC
                LIMIT 1;
            """, (project_id,))
            row = cur.fetchone()
            if not row:
                return None
            res = dict(row)
            try:
                res["cutting_data"] = json.loads(res["cutting_data"])
            except Exception:
                pass
            return res

    def list_by_customer(self, customer_id: str) -> List[Dict[str, Any]]:
        with get_connection(self.db_path) as conn:
            cur = conn.execute("""
                SELECT r.*, c.name AS customer_name, p.name AS project_name
                FROM cutting_records r
                LEFT JOIN customers c ON r.customer_id = c.id
                LEFT JOIN projects p ON r.project_id = p.id
                WHERE r.customer_id = ?
                ORDER BY r.updated_at DESC;
            """, (customer_id,))
            records = []
            for row in cur.fetchall():
                item = dict(row)
                try:
                    item["cutting_data"] = json.loads(item["cutting_data"])
                except Exception:
                    pass
                records.append(item)
            return records

    def list_customer_activity(self, customer_id: str) -> List[Dict[str, Any]]:
        """Unified activity list: projects and quick cutting records together."""
        with get_connection(self.db_path) as conn:
            # Fetch projects
            cur_p = conn.execute("""
                SELECT 
                    p.id AS id,
                    'project' AS type,
                    p.name AS name,
                    p.status AS status,
                    p.created_at AS created_at,
                    p.updated_at AS updated_at,
                    r.id AS cutting_record_id,
                    r.storage_path AS storage_path
                FROM projects p
                LEFT JOIN cutting_records r ON r.project_id = p.id
                WHERE p.customer_id = ?;
            """, (customer_id,))
            projects = [dict(r) for r in cur_p.fetchall()]

            # Fetch quick cuts
            cur_q = conn.execute("""
                SELECT 
                    r.id AS id,
                    'quick' AS type,
                    COALESCE(r.name, ('Quick Cut ' || substr(r.id, 1, 8))) AS name,
                    'completed' AS status,
                    r.created_at AS created_at,
                    r.updated_at AS updated_at,
                    r.id AS cutting_record_id,
                    r.storage_path AS storage_path
                FROM cutting_records r
                WHERE r.customer_id = ? AND r.record_type = 'quick';
            """, (customer_id,))
            quick_cuts = [dict(r) for r in cur_q.fetchall()]

            combined = projects + quick_cuts
            combined.sort(key=lambda x: x.get("updated_at") or x.get("created_at") or "", reverse=True)
            return combined

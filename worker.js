import { neon } from "@neondatabase/serverless";

// The Neon client is created per DATABASE_URL so the underlying fetch keeps its
// HTTP connection alive across requests in the same isolate. (fetchConnectionCache
// is always enabled in @neondatabase/serverless >= 1.x, so no config needed.)
let _sqlCache = null;
let _sqlCacheUrl = null;

function getSql(dbUrl) {
  if (!_sqlCache || _sqlCacheUrl !== dbUrl) {
    _sqlCache = neon(dbUrl);
    _sqlCacheUrl = dbUrl;
  }
  return _sqlCache;
}

// Every DB round trip to Neon is an HTTP request (~700 ms on a cold-ish
// compute node), so each endpoint below is written to need as few as possible:
// reads are single statements, and writes are single CTE statements instead of
// "INSERT ... then SELECT ..." pairs, or run in parallel when independent.
const CUSTOMER_SELECT = `
  SELECT c.*,
    (SELECT COUNT(*)::int FROM projects p WHERE p.customer_id = c.id) AS project_count,
    (SELECT COUNT(*)::int FROM cutting_records r WHERE r.customer_id = c.id AND r.record_type = 'quick') AS quick_count
  FROM customers c`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Only intercept /api routes; all other routes fall back to static assets
    if (!pathname.startsWith("/api/")) {
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not found", { status: 404 });
    }

    const dbUrl = env.DATABASE_URL;
    if (!dbUrl) {
      return new Response(JSON.stringify({ error: "DATABASE_URL secret is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sql = getSql(dbUrl);
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });

    try {
      if (pathname === "/api/status") {
        return json({
          status: "ok",
          service: "Sheetwise Cloudflare Worker",
          database: "Neon Postgres"
        });
      }

      // GET /api/warm — cheap SELECT 1 used by the page to start Neon's resume
      // in parallel with the app booting. Never throws.
      if (pathname === "/api/warm") {
        const t0 = Date.now();
        let ok = false;
        try {
          await sql`SELECT 1`;
          ok = true;
        } catch { /* ignore: warm-up only */ }
        return json({ ok, warm_ms: Date.now() - t0 });
      }

      // POST /api/auth/register
      if (pathname === "/api/auth/register" && request.method === "POST") {
        const data = await request.json();
        const name = (data.name || "").trim();
        const email = (data.email || "").trim().toLowerCase();
        const password = data.password || "";

        if (!name || !email || !password) {
          return json({ error: "Name, email, and password required" }, 400);
        }

        const msgUint8 = new TextEncoder().encode(password);
        const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const pwdHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

        const uid = crypto.randomUUID();
        const now = new Date().toISOString();

        // Single round trip: insert only if the email is free, otherwise return nothing.
        const inserted = await sql`
          INSERT INTO users (id, name, email, password_hash, created_at)
          SELECT ${uid}, ${name}, ${email}, ${pwdHash}, ${now}
          WHERE NOT EXISTS (SELECT 1 FROM users WHERE LOWER(email) = ${email})
          RETURNING id, name, email, created_at;
        `;
        if (inserted.length === 0) {
          return json({ error: "User already exists with this email" }, 409);
        }

        return json({ success: true, user: inserted[0] }, 201);
      }

      // POST /api/auth/login
      if (pathname === "/api/auth/login" && request.method === "POST") {
        const data = await request.json();
        const username = (data.username || data.email || "").trim().toLowerCase();
        const password = data.password || "";

        if (!username || !password) {
          return json({ error: "Username and password required" }, 400);
        }

        const users = await sql`SELECT * FROM users WHERE LOWER(email) = ${username} LIMIT 1;`;
        if (users.length === 0) {
          return json({ error: "Invalid username or password" }, 401);
        }

        const msgUint8 = new TextEncoder().encode(password);
        const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const pwdHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

        const user = users[0];
        if (user.password_hash !== pwdHash) {
          return json({ error: "Invalid username or password" }, 401);
        }

        return json({
          success: true,
          user: { id: user.id, name: user.name, username: user.email, created_at: user.created_at }
        });
      }

      // GET /api/customers or /api/customers?q=...
      if (pathname === "/api/customers" && request.method === "GET") {
        const q = (url.searchParams.get("q") || "").trim();
        let rows;
        if (q) {
          const query = `%${q.toLowerCase()}%`;
          rows = await sql.query(
            `${CUSTOMER_SELECT}
             WHERE LOWER(c.name) LIKE $1 OR LOWER(COALESCE(c.phone, '')) LIKE $1
             ORDER BY c.created_at DESC;`,
            [query]
          );
        } else {
          rows = await sql.query(`${CUSTOMER_SELECT} ORDER BY c.created_at DESC;`);
        }
        return json(rows);
      }

      // POST /api/customers
      if (pathname === "/api/customers" && request.method === "POST") {
        const data = await request.json();
        const name = (data.name || "").trim();
        if (!name) {
          return json({ error: "Customer full name is required" }, 400);
        }
        const cid = crypto.randomUUID();
        const now = new Date().toISOString();
        const phone = data.phone?.trim() || null;
        const email = data.email?.trim() || null;
        const address = data.address?.trim() || null;
        const notes = data.notes?.trim() || null;

        // Insert and return the created row (with counts) in one round trip.
        const created = await sql`
          WITH ins AS (
            INSERT INTO customers (id, name, phone, email, address, notes, created_at, updated_at)
            VALUES (${cid}, ${name}, ${phone}, ${email}, ${address}, ${notes}, ${now}, ${now})
            RETURNING *
          )
          SELECT ins.*, 0 AS project_count, 0::int AS quick_count FROM ins;
        `;

        return json(created[0], 201);
      }

      // POST /api/customers/check
      if (pathname === "/api/customers/check" && request.method === "POST") {
        const data = await request.json();
        const name = (data.name || "").trim().toLowerCase();
        if (!name) {
          return json({ exists: false, customer: null });
        }
        const found = await sql`
          SELECT c.*,
            (SELECT COUNT(*)::int FROM projects p WHERE p.customer_id = c.id) AS project_count,
            (SELECT COUNT(*)::int FROM cutting_records r WHERE r.customer_id = c.id AND r.record_type = 'quick') AS quick_count
          FROM customers c
          WHERE LOWER(TRIM(c.name)) = ${name}
          LIMIT 1;
        `;
        return json({ exists: found.length > 0, customer: found.length > 0 ? found[0] : null });
      }

      // Customer subroutes: /api/customers/:id, /api/customers/:id/activity
      if (pathname.startsWith("/api/customers/")) {
        const parts = pathname.split("/").filter(Boolean);
        const customerId = parts[2];

        if (parts.length === 3) {
          if (request.method === "GET") {
            const rows = await sql.query(`${CUSTOMER_SELECT} WHERE c.id = $1;`, [customerId]);
            if (rows.length === 0) {
              return json({ error: "Customer not found" }, 404);
            }
            return json(rows[0]);
          }

          if (request.method === "PUT") {
            const data = await request.json();
            const name = (data.name || "").trim();
            if (!name) {
              return json({ error: "Customer name is required" }, 400);
            }
            const now = new Date().toISOString();
            const phone = data.phone?.trim() || null;
            const email = data.email?.trim() || null;
            const address = data.address?.trim() || null;
            const notes = data.notes?.trim() || null;

            // Update and return the row in one round trip.
            const rows = await sql`
              WITH upd AS (
                UPDATE customers
                SET name = ${name}, phone = ${phone}, email = ${email}, address = ${address}, notes = ${notes}, updated_at = ${now}
                WHERE id = ${customerId}
                RETURNING *
              )
              SELECT upd.*,
                (SELECT COUNT(*)::int FROM projects p WHERE p.customer_id = upd.id) AS project_count,
                (SELECT COUNT(*)::int FROM cutting_records r WHERE r.customer_id = upd.id AND r.record_type = 'quick') AS quick_count
              FROM upd;
            `;
            if (rows.length === 0) {
              return json({ error: "Customer not found" }, 404);
            }
            return json(rows[0]);
          }

          if (request.method === "DELETE") {
            await sql`DELETE FROM customers WHERE id = ${customerId};`;
            return json({ success: true, deleted_id: customerId });
          }
        } else if (parts.length === 4 && parts[3] === "activity") {
          // Projects + quick cuts in one statement.
          const combined = await sql`
            SELECT * FROM (
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
              WHERE p.customer_id = ${customerId}
              UNION ALL
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
              WHERE r.customer_id = ${customerId} AND r.record_type = 'quick'
            ) items
            ORDER BY COALESCE(updated_at, created_at) DESC;
          `;
          return json(combined);
        }
      }

      // POST /api/projects
      if (pathname === "/api/projects" && request.method === "POST") {
        const data = await request.json();
        const customerId = data.customer_id;
        const name = (data.name || "").trim();
        if (!customerId || !name) {
          return json({ error: "customer_id and name are required" }, 400);
        }
        const pid = crypto.randomUUID();
        const now = new Date().toISOString();
        const description = data.description?.trim() || null;
        const status = data.status || "active";

        // Insert (with its customer name) in one round trip.
        const row = await sql`
          WITH ins AS (
            INSERT INTO projects (id, customer_id, name, description, status, created_at, updated_at)
            VALUES (${pid}, ${customerId}, ${name}, ${description}, ${status}, ${now}, ${now})
            RETURNING *
          )
          SELECT ins.*, c.name AS customer_name
          FROM ins JOIN customers c ON ins.customer_id = c.id;
        `;
        if (row.length === 0) {
          return json({ error: "Customer not found" }, 404);
        }

        return json(row[0], 201);
      }

      // Project subroutes: /api/projects/:id
      if (pathname.startsWith("/api/projects/")) {
        const parts = pathname.split("/").filter(Boolean);
        const projectId = parts[2];

        if (request.method === "GET") {
          const projs = await sql`
            SELECT p.*, c.name AS customer_name
            FROM projects p
            JOIN customers c ON p.customer_id = c.id
            WHERE p.id = ${projectId};
          `;
          if (projs.length === 0) {
            return json({ error: "Project not found" }, 404);
          }
          const recs = await sql`
            SELECT r.*, c.name AS customer_name, p.name AS project_name
            FROM cutting_records r
            LEFT JOIN customers c ON r.customer_id = c.id
            LEFT JOIN projects p ON r.project_id = p.id
            WHERE r.project_id = ${projectId}
            ORDER BY r.updated_at DESC
            LIMIT 1;
          `;
          const proj = projs[0];
          if (recs.length > 0) {
            const rec = recs[0];
            try { rec.cutting_data = JSON.parse(rec.cutting_data); } catch {}
            proj.cutting_record = rec;
          } else {
            proj.cutting_record = null;
          }
          return json(proj);
        }

        if (request.method === "DELETE") {
          await sql`DELETE FROM projects WHERE id = ${projectId};`;
          return json({ success: true, deleted_id: projectId });
        }
      }

      // POST /api/records/quick
      if (pathname === "/api/records/quick" && request.method === "POST") {
        const data = await request.json();
        const cuttingData = data.cutting_data;
        const name = data.name?.trim() || null;
        const customerId = data.customer_id || null;
        const recordId = data.record_id || crypto.randomUUID();
        const now = new Date().toISOString();
        const dataStr = JSON.stringify(cuttingData);

        // Upsert and return the saved record (with customer name) in one round trip.
        const rows = await sql`
          WITH saved AS (
            INSERT INTO cutting_records (id, customer_id, project_id, record_type, name, cutting_data, created_at, updated_at)
            VALUES (${recordId}, ${customerId}, NULL, 'quick', ${name}, ${dataStr}, ${now}, ${now})
            ON CONFLICT (id) DO UPDATE
              SET cutting_data = EXCLUDED.cutting_data,
                  customer_id = EXCLUDED.customer_id,
                  name = EXCLUDED.name,
                  updated_at = EXCLUDED.updated_at
            RETURNING *
          )
          SELECT saved.*, c.name AS customer_name
          FROM saved LEFT JOIN customers c ON saved.customer_id = c.id;
        `;
        const resObj = rows[0];
        try { resObj.cutting_data = JSON.parse(resObj.cutting_data); } catch {}

        return json(resObj);
      }

      // POST /api/records/project
      if (pathname === "/api/records/project" && request.method === "POST") {
        const data = await request.json();
        const projectId = data.project_id;
        const cuttingData = data.cutting_data;
        if (!projectId || !cuttingData) {
          return json({ error: "project_id and cutting_data required" }, 400);
        }

        const now = new Date().toISOString();
        const dataStr = JSON.stringify(cuttingData);
        const rid = crypto.randomUUID();

        // One record per project, saved and returned in a single round trip
        // (there is no unique index on project_id, so this can't use ON CONFLICT).
        const rows = await sql`
          WITH proj AS (
            SELECT id, customer_id FROM projects WHERE id = ${projectId}
          ),
          existing AS (
            SELECT r.id FROM cutting_records r
            WHERE r.project_id = ${projectId}
            ORDER BY r.updated_at DESC LIMIT 1
          ),
          updated AS (
            UPDATE cutting_records r
            SET cutting_data = ${dataStr}, updated_at = ${now}
            FROM existing e
            WHERE r.id = e.id
            RETURNING r.*
          ),
          inserted AS (
            INSERT INTO cutting_records (id, customer_id, project_id, record_type, cutting_data, created_at, updated_at)
            SELECT ${rid}, proj.customer_id, proj.id, 'project', ${dataStr}, ${now}, ${now}
            FROM proj
            WHERE NOT EXISTS (SELECT 1 FROM existing)
            RETURNING *
          ),
          saved AS (
            SELECT * FROM updated UNION ALL SELECT * FROM inserted
          )
          SELECT saved.*, c.name AS customer_name, p.name AS project_name
          FROM saved
          LEFT JOIN customers c ON saved.customer_id = c.id
          LEFT JOIN projects p ON saved.project_id = p.id;
        `;
        if (rows.length === 0) {
          return json({ error: "Project not found" }, 404);
        }
        await sql`UPDATE projects SET updated_at = ${now} WHERE id = ${projectId};`;

        const resObj = rows[0];
        try { resObj.cutting_data = JSON.parse(resObj.cutting_data); } catch {}

        return json(resObj);
      }

      // Record subroutes: /api/records/:id
      if (pathname.startsWith("/api/records/")) {
        const parts = pathname.split("/").filter(Boolean);
        const recordId = parts[2];

        if (request.method === "GET") {
          const rows = await sql`
            SELECT r.*, c.name AS customer_name, p.name AS project_name
            FROM cutting_records r
            LEFT JOIN customers c ON r.customer_id = c.id
            LEFT JOIN projects p ON r.project_id = p.id
            WHERE r.id = ${recordId};
          `;
          if (rows.length === 0) {
            return json({ error: "Record not found" }, 404);
          }
          const rec = rows[0];
          try { rec.cutting_data = JSON.parse(rec.cutting_data); } catch {}
          return json(rec);
        }

        if (request.method === "DELETE") {
          await sql`DELETE FROM cutting_records WHERE id = ${recordId};`;
          return json({ success: true, deleted_id: recordId });
        }
      }

      return json({ error: "Endpoint not found" }, 404);
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  },

  // Cron trigger (see wrangler.toml): keeps the Neon compute awake during
  // working hours so the first page load of the day doesn't wait for a resume.
  async scheduled(controller, env, ctx) {
    const dbUrl = env.DATABASE_URL;
    if (!dbUrl) return;
    const sql = getSql(dbUrl);
    ctx.waitUntil(sql`SELECT 1;`);
  }
};

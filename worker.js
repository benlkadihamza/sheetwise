import { neon } from "@neondatabase/serverless";

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

    const sql = neon(dbUrl);

    try {
      if (pathname === "/api/status") {
        return new Response(JSON.stringify({
          status: "ok",
          service: "Sheetwise Cloudflare Worker",
          database: "Neon Postgres"
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // POST /api/auth/register
      if (pathname === "/api/auth/register" && request.method === "POST") {
        const data = await request.json();
        const name = (data.name || "").trim();
        const email = (data.email || "").trim().toLowerCase();
        const password = data.password || "";

        if (!name || !email || !password) {
          return new Response(JSON.stringify({ error: "Name, email, and password required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const existing = await sql`SELECT id FROM users WHERE LOWER(email) = ${email};`;
        if (existing.length > 0) {
          return new Response(JSON.stringify({ error: "User already exists with this email" }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // SHA-256 password hash in WebCrypto
        const msgUint8 = new TextEncoder().encode(password);
        const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const pwdHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

        const uid = crypto.randomUUID();
        const now = new Date().toISOString();

        await sql`
          INSERT INTO users (id, name, email, password_hash, created_at)
          VALUES (${uid}, ${name}, ${email}, ${pwdHash}, ${now});
        `;

        return new Response(JSON.stringify({
          success: true,
          user: { id: uid, name, email, created_at: now }
        }), {
          status: 201,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // POST /api/auth/login
      if (pathname === "/api/auth/login" && request.method === "POST") {
        const data = await request.json();
        const username = (data.username || data.email || "").trim().toLowerCase();
        const password = data.password || "";

        if (!username || !password) {
          return new Response(JSON.stringify({ error: "Username and password required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const users = await sql`SELECT * FROM users WHERE LOWER(email) = ${username};`;
        if (users.length === 0) {
          return new Response(JSON.stringify({ error: "Invalid username or password" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const msgUint8 = new TextEncoder().encode(password);
        const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const pwdHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

        const user = users[0];
        if (user.password_hash !== pwdHash) {
          return new Response(JSON.stringify({ error: "Invalid username or password" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify({
          success: true,
          user: { id: user.id, name: user.name, username: user.email, created_at: user.created_at }
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // GET /api/customers or /api/customers?q=...
      if (pathname === "/api/customers" && request.method === "GET") {
        const q = url.searchParams.get("q");
        let rows;
        if (q && q.trim()) {
          const query = `%${q.trim().toLowerCase()}%`;
          rows = await sql`
            SELECT c.*,
              (SELECT COUNT(*) FROM projects p WHERE p.customer_id = c.id) AS project_count,
              (SELECT COUNT(*) FROM cutting_records r WHERE r.customer_id = c.id AND r.record_type = 'quick') AS quick_count
            FROM customers c
            WHERE LOWER(c.name) LIKE ${query} OR LOWER(COALESCE(c.phone, '')) LIKE ${query}
            ORDER BY c.created_at DESC;
          `;
        } else {
          rows = await sql`
            SELECT c.*,
              (SELECT COUNT(*) FROM projects p WHERE p.customer_id = c.id) AS project_count,
              (SELECT COUNT(*) FROM cutting_records r WHERE r.customer_id = c.id AND r.record_type = 'quick') AS quick_count
            FROM customers c
            ORDER BY c.created_at DESC;
          `;
        }
        return new Response(JSON.stringify(rows), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // POST /api/customers
      if (pathname === "/api/customers" && request.method === "POST") {
        const data = await request.json();
        const name = (data.name || "").trim();
        if (!name) {
          return new Response(JSON.stringify({ error: "Customer full name is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const cid = crypto.randomUUID();
        const now = new Date().toISOString();
        const phone = data.phone?.trim() || null;
        const email = data.email?.trim() || null;
        const address = data.address?.trim() || null;
        const notes = data.notes?.trim() || null;

        await sql`
          INSERT INTO customers (id, name, phone, email, address, notes, created_at, updated_at)
          VALUES (${cid}, ${name}, ${phone}, ${email}, ${address}, ${notes}, ${now}, ${now});
        `;

        const created = await sql`
          SELECT c.*,
            (SELECT COUNT(*) FROM projects p WHERE p.customer_id = c.id) AS project_count,
            (SELECT COUNT(*) FROM cutting_records r WHERE r.customer_id = c.id AND r.record_type = 'quick') AS quick_count
          FROM customers c
          WHERE c.id = ${cid};
        `;

        return new Response(JSON.stringify(created[0]), {
          status: 201,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // POST /api/customers/check
      if (pathname === "/api/customers/check" && request.method === "POST") {
        const data = await request.json();
        const name = (data.name || "").trim().toLowerCase();
        if (!name) {
          return new Response(JSON.stringify({ exists: false, customer: null }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const found = await sql`
          SELECT c.*,
            (SELECT COUNT(*) FROM projects p WHERE p.customer_id = c.id) AS project_count,
            (SELECT COUNT(*) FROM cutting_records r WHERE r.customer_id = c.id AND r.record_type = 'quick') AS quick_count
          FROM customers c
          WHERE LOWER(TRIM(c.name)) = ${name}
          LIMIT 1;
        `;
        return new Response(JSON.stringify({
          exists: found.length > 0,
          customer: found.length > 0 ? found[0] : null
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Customer subroutes: /api/customers/:id, /api/customers/:id/activity
      if (pathname.startsWith("/api/customers/")) {
        const parts = pathname.split("/").filter(Boolean);
        const customerId = parts[2];

        if (parts.length === 3) {
          if (request.method === "GET") {
            const rows = await sql`
              SELECT c.*,
                (SELECT COUNT(*) FROM projects p WHERE p.customer_id = c.id) AS project_count,
                (SELECT COUNT(*) FROM cutting_records r WHERE r.customer_id = c.id AND r.record_type = 'quick') AS quick_count
              FROM customers c
              WHERE c.id = ${customerId};
            `;
            if (rows.length === 0) {
              return new Response(JSON.stringify({ error: "Customer not found" }), {
                status: 404,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
              });
            }
            return new Response(JSON.stringify(rows[0]), {
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }

          if (request.method === "PUT") {
            const data = await request.json();
            const name = (data.name || "").trim();
            if (!name) {
              return new Response(JSON.stringify({ error: "Customer name is required" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
              });
            }
            const now = new Date().toISOString();
            const phone = data.phone?.trim() || null;
            const email = data.email?.trim() || null;
            const address = data.address?.trim() || null;
            const notes = data.notes?.trim() || null;

            await sql`
              UPDATE customers
              SET name = ${name}, phone = ${phone}, email = ${email}, address = ${address}, notes = ${notes}, updated_at = ${now}
              WHERE id = ${customerId};
            `;

            const rows = await sql`
              SELECT c.*,
                (SELECT COUNT(*) FROM projects p WHERE p.customer_id = c.id) AS project_count,
                (SELECT COUNT(*) FROM cutting_records r WHERE r.customer_id = c.id AND r.record_type = 'quick') AS quick_count
              FROM customers c
              WHERE c.id = ${customerId};
            `;
            return new Response(JSON.stringify(rows[0]), {
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }

          if (request.method === "DELETE") {
            await sql`DELETE FROM customers WHERE id = ${customerId};`;
            return new Response(JSON.stringify({ success: true, deleted_id: customerId }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
        } else if (parts.length === 4 && parts[3] === "activity") {
          const projects = await sql`
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
            WHERE p.customer_id = ${customerId};
          `;

          const quickCuts = await sql`
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
            WHERE r.customer_id = ${customerId} AND r.record_type = 'quick';
          `;

          const combined = [...projects, ...quickCuts];
          combined.sort((a, b) => (b.updated_at || b.created_at || "").localeCompare(a.updated_at || a.created_at || ""));

          return new Response(JSON.stringify(combined), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }

      // POST /api/projects
      if (pathname === "/api/projects" && request.method === "POST") {
        const data = await request.json();
        const customerId = data.customer_id;
        const name = (data.name || "").trim();
        if (!customerId || !name) {
          return new Response(JSON.stringify({ error: "customer_id and name are required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const pid = crypto.randomUUID();
        const now = new Date().toISOString();
        const description = data.description?.trim() || null;
        const status = data.status || "active";

        await sql`
          INSERT INTO projects (id, customer_id, name, description, status, created_at, updated_at)
          VALUES (${pid}, ${customerId}, ${name}, ${description}, ${status}, ${now}, ${now});
        `;

        const row = await sql`
          SELECT p.*, c.name AS customer_name
          FROM projects p
          JOIN customers c ON p.customer_id = c.id
          WHERE p.id = ${pid};
        `;

        return new Response(JSON.stringify(row[0]), {
          status: 201,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
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
            return new Response(JSON.stringify({ error: "Project not found" }), {
              status: 404,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
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
          return new Response(JSON.stringify(proj), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        if (request.method === "DELETE") {
          await sql`DELETE FROM projects WHERE id = ${projectId};`;
          return new Response(JSON.stringify({ success: true, deleted_id: projectId }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
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

        if (data.record_id) {
          await sql`
            UPDATE cutting_records
            SET cutting_data = ${dataStr}, customer_id = ${customerId}, name = ${name}, updated_at = ${now}
            WHERE id = ${recordId};
          `;
        } else {
          await sql`
            INSERT INTO cutting_records (id, customer_id, project_id, record_type, name, cutting_data, created_at, updated_at)
            VALUES (${recordId}, ${customerId}, NULL, 'quick', ${name}, ${dataStr}, ${now}, ${now});
          `;
        }

        const rows = await sql`
          SELECT r.*, c.name AS customer_name
          FROM cutting_records r
          LEFT JOIN customers c ON r.customer_id = c.id
          WHERE r.id = ${recordId};
        `;
        const resObj = rows[0];
        try { resObj.cutting_data = JSON.parse(resObj.cutting_data); } catch {}

        return new Response(JSON.stringify(resObj), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // POST /api/records/project
      if (pathname === "/api/records/project" && request.method === "POST") {
        const data = await request.json();
        const projectId = data.project_id;
        const cuttingData = data.cutting_data;
        if (!projectId || !cuttingData) {
          return new Response(JSON.stringify({ error: "project_id and cutting_data required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const projs = await sql`SELECT * FROM projects WHERE id = ${projectId};`;
        if (projs.length === 0) {
          return new Response(JSON.stringify({ error: "Project not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const customerId = projs[0].customer_id;
        const now = new Date().toISOString();
        const dataStr = JSON.stringify(cuttingData);

        const existing = await sql`SELECT id FROM cutting_records WHERE project_id = ${projectId};`;
        let rid = existing.length > 0 ? existing[0].id : crypto.randomUUID();

        if (existing.length > 0) {
          await sql`
            UPDATE cutting_records
            SET cutting_data = ${dataStr}, updated_at = ${now}
            WHERE id = ${rid};
          `;
        } else {
          await sql`
            INSERT INTO cutting_records (id, customer_id, project_id, record_type, cutting_data, created_at, updated_at)
            VALUES (${rid}, ${customerId}, ${projectId}, 'project', ${dataStr}, ${now}, ${now});
          `;
        }
        await sql`UPDATE projects SET updated_at = ${now} WHERE id = ${projectId};`;

        const rows = await sql`SELECT * FROM cutting_records WHERE id = ${rid};`;
        const resObj = rows[0];
        try { resObj.cutting_data = JSON.parse(resObj.cutting_data); } catch {}

        return new Response(JSON.stringify(resObj), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
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
            return new Response(JSON.stringify({ error: "Record not found" }), {
              status: 404,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
          const rec = rows[0];
          try { rec.cutting_data = JSON.parse(rec.cutting_data); } catch {}
          return new Response(JSON.stringify(rec), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        if (request.method === "DELETE") {
          await sql`DELETE FROM cutting_records WHERE id = ${recordId};`;
          return new Response(JSON.stringify({ success: true, deleted_id: recordId }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }

      return new Response(JSON.stringify({ error: "Endpoint not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};

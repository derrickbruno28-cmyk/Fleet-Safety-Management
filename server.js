const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { Pool } = require("pg");

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const ROOT = process.cwd();
const DATABASE_URL = process.env.DATABASE_URL || "";
const CRON_TOKEN = process.env.CRON_TOKEN || "";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const dbEnabled = Boolean(DATABASE_URL);
const pool = dbEnabled
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
    })
  : null;

let memoryState = {};
let lastStateWriteAt = null;
const presenceSessions = new Map();

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 5_000_000) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

async function ensureDb() {
  if (!dbEnabled) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cron_runs (
      id BIGSERIAL PRIMARY KEY,
      run_type TEXT NOT NULL,
      ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      details JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await pool.query(
    `INSERT INTO app_state (id, data) VALUES (1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING`
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS incident_media (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      content BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state_history (
      id BIGSERIAL PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'unknown',
      state JSONB NOT NULL,
      state_updated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppState() {
  if (!dbEnabled) return memoryState || {};
  const { rows } = await pool.query("SELECT data FROM app_state WHERE id = 1");
  if (!rows.length) return {};
  return rows[0].data || {};
}

async function putAppState(nextState, source = "unknown") {
  if (!dbEnabled) {
    memoryState = nextState || {};
    lastStateWriteAt = new Date().toISOString();
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const curRes = await client.query("SELECT data, updated_at FROM app_state WHERE id = 1 FOR UPDATE");
    if (curRes.rows.length) {
      const cur = curRes.rows[0];
      await client.query(
        `
          INSERT INTO app_state_history (source, state, state_updated_at)
          VALUES ($1, $2::jsonb, $3)
        `,
        [source, JSON.stringify(cur.data || {}), cur.updated_at || null]
      );
    }
    await client.query(
      `
        INSERT INTO app_state (id, data, updated_at)
        VALUES (1, $1::jsonb, NOW())
        ON CONFLICT (id)
        DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
      `,
      [JSON.stringify(nextState || {})]
    );
    // Keep only the most recent 500 state backups.
    await client.query(`
      DELETE FROM app_state_history
      WHERE id IN (
        SELECT id FROM app_state_history
        ORDER BY created_at DESC
        OFFSET 500
      )
    `);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  lastStateWriteAt = new Date().toISOString();
}

function cleanupPresenceSessions() {
  const now = Date.now();
  for (const [sessionId, meta] of presenceSessions.entries()) {
    if (!meta || !meta.lastSeenAt || now - meta.lastSeenAt > 35_000) {
      presenceSessions.delete(sessionId);
    }
  }
}

async function runHourlyMaintenance() {
  const state = await getAppState();
  const nowIso = new Date().toISOString();

  const result = {
    ranAt: nowIso,
    drivers: Array.isArray(state.drivers) ? state.drivers.length : 0,
    checkCalls: Array.isArray(state.checkCalls) ? state.checkCalls.length : 0,
    discipline: Array.isArray(state.discipline) ? state.discipline.length : 0,
    trainingAssignments: Array.isArray(state?.training?.assignments) ? state.training.assignments.length : 0
  };

  if (typeof state === "object" && state !== null) {
    state.system = state.system || {};
    state.system.lastHourlyCronRun = nowIso;
    state.system.lastHourlyCronSummary = result;
  }
  await putAppState(state, "hourly-cron");

  if (dbEnabled) {
    await pool.query(
      "INSERT INTO cron_runs (run_type, details) VALUES ($1, $2::jsonb)",
      ["hourly", JSON.stringify(result)]
    );
  }
  return result;
}

async function fetchSamsaraList(token, endpoints) {
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const list =
        (Array.isArray(data) && data) ||
        (Array.isArray(data.data) && data.data) ||
        (Array.isArray(data.vehicles) && data.vehicles) ||
        (Array.isArray(data.trailers) && data.trailers) ||
        [];
      if (Array.isArray(list)) return list;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Failed to fetch list");
}

async function fetchSamsaraDrivers(token) {
  return fetchSamsaraList(token, [
    "https://api.samsara.com/fleet/drivers",
    "https://api.samsara.com/v1/fleet/drivers"
  ]);
}

function normalizeAssetRecord(raw, assetType, company) {
  const location = raw.location || raw.gps || raw.lastKnownLocation || {};
  const lat = raw.latitude ?? location.latitude ?? raw.lat ?? null;
  const lng = raw.longitude ?? location.longitude ?? raw.lng ?? null;
  return {
    id: raw.id || raw.assetId || null,
    company,
    assetType,
    unitNumber: raw.unitNumber || raw.name || raw.vehicleNumber || raw.truckNumber || "",
    trailerNumber: raw.trailerNumber || raw.trailer || raw.trailerName || "",
    latitude: Number.isFinite(Number(lat)) ? Number(lat) : null,
    longitude: Number.isFinite(Number(lng)) ? Number(lng) : null,
    lastSeenAt: raw.lastSeenAt || raw.lastReportTime || raw.updatedAt || raw.updated_at || ""
  };
}

async function fetchSamsaraAssets(token, company = "Company") {
  const vehicles = await fetchSamsaraList(token, [
    "https://api.samsara.com/fleet/vehicles",
    "https://api.samsara.com/v1/fleet/vehicles"
  ]).catch(() => []);

  const trailers = await fetchSamsaraList(token, [
    "https://api.samsara.com/fleet/trailers",
    "https://api.samsara.com/v1/fleet/trailers"
  ]).catch(() => []);

  const out = [];
  vehicles.forEach((v) => out.push(normalizeAssetRecord(v, "Truck", company)));
  trailers.forEach((t) => out.push(normalizeAssetRecord(t, "Trailer", company)));
  return out;
}

function sanitizeFilename(name) {
  return String(name || "file")
    .replace(/[^\w.\-() ]+/g, "_")
    .slice(0, 180);
}

function parseDataUrl(value) {
  const raw = String(value || "");
  const m = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mimeType: m[1], base64: m[2] };
}

function serveStatic(req, res, urlObj) {
  let pathname = decodeURIComponent(urlObj.pathname);
  if (pathname === "/") pathname = "/index.html";
  const safePath = path.normalize(path.join(ROOT, pathname));
  if (!safePath.startsWith(ROOT)) {
    sendJson(res, 403, { error: "Forbidden path" });
    return;
  }

  fs.readFile(safePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        sendJson(res, 404, { error: "Not found" });
      } else {
        sendJson(res, 500, { error: "File read error" });
      }
      return;
    }
    const ext = path.extname(safePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && urlObj.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, dbEnabled, now: new Date().toISOString() });
    return;
  }

  if (req.method === "POST" && urlObj.pathname === "/api/presence/heartbeat") {
    try {
      const raw = await readBody(req);
      const parsed = raw ? JSON.parse(raw) : {};
      const sessionId =
        typeof parsed.sessionId === "string" && parsed.sessionId.trim()
          ? parsed.sessionId.trim()
          : `anon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      presenceSessions.set(sessionId, { lastSeenAt: Date.now() });
      cleanupPresenceSessions();
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 400, { error: error.message || "heartbeat failed" });
    }
    return;
  }

  if (req.method === "GET" && urlObj.pathname === "/api/presence/status") {
    cleanupPresenceSessions();
    sendJson(res, 200, {
      onlineUsers: presenceSessions.size || 1,
      lastStateWriteAt,
      lastSavedAt: lastStateWriteAt
    });
    return;
  }

  if (req.method === "GET" && urlObj.pathname === "/api/state") {
    try {
      const state = await getAppState();
      sendJson(res, 200, { state, lastSavedAt: lastStateWriteAt });
    } catch (error) {
      sendJson(res, 500, { error: error.message || "state read failed" });
    }
    return;
  }

  if (req.method === "PUT" && urlObj.pathname === "/api/state") {
    try {
      const raw = await readBody(req);
      const parsed = raw ? JSON.parse(raw) : {};
      const state = parsed && typeof parsed.state === "object" ? parsed.state : {};
      const source =
        parsed && typeof parsed.source === "string" && parsed.source.trim()
          ? parsed.source.trim().slice(0, 120)
          : "web-client";
      await putAppState(state, source);
      sendJson(res, 200, { ok: true, lastSavedAt: lastStateWriteAt });
    } catch (error) {
      sendJson(res, 500, { error: error.message || "state write failed" });
    }
    return;
  }

  if (req.method === "GET" && urlObj.pathname === "/api/state/history") {
    try {
      if (!dbEnabled) {
        sendJson(res, 200, { history: [] });
        return;
      }
      const limitRaw = Number(urlObj.searchParams.get("limit") || 30);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 30;
      const { rows } = await pool.query(
        `
          SELECT id, source, state_updated_at, created_at
          FROM app_state_history
          ORDER BY created_at DESC
          LIMIT $1
        `,
        [limit]
      );
      sendJson(res, 200, { history: rows });
    } catch (error) {
      sendJson(res, 500, { error: error.message || "state history read failed" });
    }
    return;
  }

  if (req.method === "POST" && urlObj.pathname === "/api/state/restore") {
    try {
      if (!dbEnabled) {
        sendJson(res, 503, { error: "Restore requires Postgres" });
        return;
      }
      const raw = await readBody(req);
      const parsed = raw ? JSON.parse(raw) : {};
      const historyId = Number(parsed.historyId);
      if (!Number.isFinite(historyId)) {
        sendJson(res, 400, { error: "Invalid historyId" });
        return;
      }
      const { rows } = await pool.query(
        "SELECT state FROM app_state_history WHERE id = $1",
        [historyId]
      );
      if (!rows.length) {
        sendJson(res, 404, { error: "Backup not found" });
        return;
      }
      await putAppState(rows[0].state || {}, `restore:${historyId}`);
      sendJson(res, 200, { ok: true, restoredFrom: historyId, lastSavedAt: lastStateWriteAt });
    } catch (error) {
      sendJson(res, 500, { error: error.message || "restore failed" });
    }
    return;
  }

  if (req.method === "POST" && urlObj.pathname === "/api/cron/hourly") {
    try {
      if (CRON_TOKEN) {
        const provided = req.headers["x-cron-token"] || "";
        if (String(provided) !== String(CRON_TOKEN)) {
          sendJson(res, 401, { error: "Unauthorized" });
          return;
        }
      }
      const details = await runHourlyMaintenance();
      sendJson(res, 200, { ok: true, details });
    } catch (error) {
      sendJson(res, 500, { error: error.message || "hourly cron failed" });
    }
    return;
  }

  if (req.method === "POST" && urlObj.pathname === "/api/samsara/drivers") {
    try {
      const raw = await readBody(req);
      const parsed = raw ? JSON.parse(raw) : {};
      const token = typeof parsed.token === "string" ? parsed.token.trim() : "";
      if (!token) {
        sendJson(res, 400, { error: "Missing token" });
        return;
      }
      const drivers = await fetchSamsaraDrivers(token);
      sendJson(res, 200, { drivers });
    } catch (error) {
      sendJson(res, 502, { error: error.message || "Samsara proxy failed" });
    }
    return;
  }

  if (req.method === "POST" && urlObj.pathname === "/api/samsara/assets") {
    try {
      const raw = await readBody(req);
      const parsed = raw ? JSON.parse(raw) : {};
      const token = typeof parsed.token === "string" ? parsed.token.trim() : "";
      const company = typeof parsed.company === "string" ? parsed.company.trim() : "Company";
      if (!token) {
        sendJson(res, 400, { error: "Missing token" });
        return;
      }
      const assets = await fetchSamsaraAssets(token, company);
      sendJson(res, 200, { assets });
    } catch (error) {
      sendJson(res, 502, { error: error.message || "Samsara asset proxy failed" });
    }
    return;
  }

  if (req.method === "POST" && urlObj.pathname === "/api/media/upload") {
    try {
      if (!dbEnabled) {
        sendJson(res, 503, { error: "Media upload requires Postgres" });
        return;
      }
      const raw = await readBody(req);
      const parsed = raw ? JSON.parse(raw) : {};
      const files = Array.isArray(parsed.files) ? parsed.files : [];
      if (!files.length) {
        sendJson(res, 400, { error: "No files provided" });
        return;
      }
      const uploaded = [];
      for (const f of files.slice(0, 20)) {
        const parsedData = parseDataUrl(f.data);
        if (!parsedData) continue;
        const buf = Buffer.from(parsedData.base64, "base64");
        if (!buf.length) continue;
        if (buf.length > 25 * 1024 * 1024) {
          throw new Error(`File too large: ${f.name || "file"}`);
        }
        const filename = sanitizeFilename(f.name || "incident-file");
        const mimeType = String(f.type || parsedData.mimeType || "application/octet-stream").slice(0, 120);
        const result = await pool.query(
          `INSERT INTO incident_media (filename, mime_type, size_bytes, content) VALUES ($1,$2,$3,$4) RETURNING id`,
          [filename, mimeType, buf.length, buf]
        );
        const id = result.rows[0].id;
        uploaded.push({
          mediaId: id,
          name: filename,
          type: mimeType,
          size: buf.length,
          url: `/api/media/${id}/download`
        });
      }
      sendJson(res, 200, { files: uploaded });
    } catch (error) {
      sendJson(res, 500, { error: error.message || "Media upload failed" });
    }
    return;
  }

  if (req.method === "GET" && /^\/api\/media\/\d+\/download$/.test(urlObj.pathname)) {
    try {
      if (!dbEnabled) {
        sendJson(res, 503, { error: "Media download requires Postgres" });
        return;
      }
      const id = Number(urlObj.pathname.split("/")[3]);
      if (!Number.isFinite(id)) {
        sendJson(res, 400, { error: "Invalid media id" });
        return;
      }
      const { rows } = await pool.query(
        "SELECT filename, mime_type, size_bytes, content FROM incident_media WHERE id = $1",
        [id]
      );
      if (!rows.length) {
        sendJson(res, 404, { error: "Media not found" });
        return;
      }
      const row = rows[0];
      res.writeHead(200, {
        "Content-Type": row.mime_type || "application/octet-stream",
        "Content-Length": String(row.size_bytes || row.content.length),
        "Content-Disposition": `attachment; filename=\"${sanitizeFilename(row.filename || `media-${id}`)}\"`
      });
      res.end(row.content);
    } catch (error) {
      sendJson(res, 500, { error: error.message || "Media download failed" });
    }
    return;
  }

  if (req.method === "DELETE" && /^\/api\/media\/\d+$/.test(urlObj.pathname)) {
    try {
      if (!dbEnabled) {
        sendJson(res, 503, { error: "Media delete requires Postgres" });
        return;
      }
      const id = Number(urlObj.pathname.split("/")[3]);
      if (!Number.isFinite(id)) {
        sendJson(res, 400, { error: "Invalid media id" });
        return;
      }
      await pool.query("DELETE FROM incident_media WHERE id = $1", [id]);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 500, { error: error.message || "Media delete failed" });
    }
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  serveStatic(req, res, urlObj);
});

ensureDb()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Safety module server running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("DB init failed:", error.message);
    process.exit(1);
  });

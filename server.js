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
}

async function getAppState() {
  if (!dbEnabled) return memoryState || {};
  const { rows } = await pool.query("SELECT data FROM app_state WHERE id = 1");
  if (!rows.length) return {};
  return rows[0].data || {};
}

async function putAppState(nextState) {
  if (!dbEnabled) {
    memoryState = nextState || {};
    return;
  }
  await pool.query(
    `
      INSERT INTO app_state (id, data, updated_at)
      VALUES (1, $1::jsonb, NOW())
      ON CONFLICT (id)
      DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `,
    [JSON.stringify(nextState || {})]
  );
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
  await putAppState(state);

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

  if (req.method === "GET" && urlObj.pathname === "/api/state") {
    try {
      const state = await getAppState();
      sendJson(res, 200, { state });
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
      await putAppState(state);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 500, { error: error.message || "state write failed" });
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

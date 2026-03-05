const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL || "";

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required for hourly cron");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
});

async function run() {
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
  await pool.query(`INSERT INTO app_state (id, data) VALUES (1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING`);

  const { rows } = await pool.query("SELECT data FROM app_state WHERE id = 1");
  const state = (rows[0] && rows[0].data) || {};
  const nowIso = new Date().toISOString();

  const details = {
    ranAt: nowIso,
    drivers: Array.isArray(state.drivers) ? state.drivers.length : 0,
    checkCalls: Array.isArray(state.checkCalls) ? state.checkCalls.length : 0,
    discipline: Array.isArray(state.discipline) ? state.discipline.length : 0,
    trainingAssignments: Array.isArray(state?.training?.assignments) ? state.training.assignments.length : 0
  };

  state.system = state.system || {};
  state.system.lastHourlyCronRun = nowIso;
  state.system.lastHourlyCronSummary = details;

  await pool.query(
    `
      INSERT INTO app_state (id, data, updated_at)
      VALUES (1, $1::jsonb, NOW())
      ON CONFLICT (id)
      DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `,
    [JSON.stringify(state)]
  );

  await pool.query("INSERT INTO cron_runs (run_type, details) VALUES ($1, $2::jsonb)", ["hourly", JSON.stringify(details)]);

  console.log("Hourly cron completed:", details);
}

run()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error("Hourly cron failed:", error.message);
    try {
      await pool.end();
    } catch (_) {}
    process.exit(1);
  });

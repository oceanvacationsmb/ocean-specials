import pg from "pg";

const { Pool } = pg;

let pool = null;

function isValidDatabaseUrl(value) {
  if (!value) return false;

  return (
    value.startsWith("postgres://") ||
    value.startsWith("postgresql://")
  );
}

export function getPool() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!isValidDatabaseUrl(databaseUrl)) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: {
        rejectUnauthorized: false
      }
    });
  }

  return pool;
}

export async function query(text, params = []) {
  const db = getPool();

  if (!db) {
    throw new Error("DATABASE_URL is missing or invalid");
  }

  return db.query(text, params);
}

export async function ensurePropertySettingsTable() {
  const db = getPool();

  if (!db) {
    return false;
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS property_settings (
      listing_id TEXT PRIMARY KEY,
      short_id TEXT,
      active BOOLEAN DEFAULT TRUE,
      airbnb_url TEXT,
      vrbo_url TEXT,
      flyer_image_url TEXT,
      min_nights INTEGER DEFAULT 1,
      max_nights INTEGER DEFAULT 45,
      scan_days INTEGER DEFAULT 45,
      off_season_active BOOLEAN DEFAULT FALSE,
      off_season_monthly_rate NUMERIC(10, 2),
      off_season_start_date DATE,
      off_season_end_date DATE,
      off_season_flyer_url TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await db.query(`ALTER TABLE property_settings ADD COLUMN IF NOT EXISTS short_id TEXT;`);
  await db.query(`ALTER TABLE property_settings ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;`);
  await db.query(`ALTER TABLE property_settings ADD COLUMN IF NOT EXISTS airbnb_url TEXT;`);
  await db.query(`ALTER TABLE property_settings ADD COLUMN IF NOT EXISTS vrbo_url TEXT;`);
  await db.query(`ALTER TABLE property_settings ADD COLUMN IF NOT EXISTS flyer_image_url TEXT;`);
  await db.query(`ALTER TABLE property_settings ADD COLUMN IF NOT EXISTS min_nights INTEGER DEFAULT 1;`);
  await db.query(`ALTER TABLE property_settings ADD COLUMN IF NOT EXISTS max_nights INTEGER DEFAULT 45;`);
  await db.query(`ALTER TABLE property_settings ADD COLUMN IF NOT EXISTS scan_days INTEGER DEFAULT 45;`);
  await db.query(`ALTER TABLE property_settings ADD COLUMN IF NOT EXISTS off_season_active BOOLEAN DEFAULT FALSE;`);
  await db.query(`ALTER TABLE property_settings ADD COLUMN IF NOT EXISTS off_season_monthly_rate NUMERIC(10, 2);`);
  await db.query(`ALTER TABLE property_settings ADD COLUMN IF NOT EXISTS off_season_start_date DATE;`);
  await db.query(`ALTER TABLE property_settings ADD COLUMN IF NOT EXISTS off_season_end_date DATE;`);
  await db.query(`ALTER TABLE property_settings ADD COLUMN IF NOT EXISTS off_season_flyer_url TEXT;`);

  return true;
}

export async function ensureAppSettingsTable() {
  const db = getPool();

  if (!db) {
    return false;
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  return true;
}

export async function getAppSetting(key, defaultValue = "") {
  const db = getPool();

  if (!db) {
    return defaultValue;
  }

  await ensureAppSettingsTable();

  const result = await query(
    `
      SELECT setting_value
      FROM app_settings
      WHERE setting_key = $1
      LIMIT 1
    `,
    [key]
  );

  if (!result.rows.length) {
    return defaultValue;
  }

  return result.rows[0].setting_value || defaultValue;
}

export async function setAppSetting(key, value) {
  const db = getPool();

  if (!db) {
    return value || "";
  }

  await ensureAppSettingsTable();

  await query(
    `
      INSERT INTO app_settings (
        setting_key,
        setting_value,
        updated_at
      )
      VALUES ($1, $2, NOW())
      ON CONFLICT (setting_key)
      DO UPDATE SET
        setting_value = EXCLUDED.setting_value,
        updated_at = NOW()
    `,
    [key, value || ""]
  );

  return value || "";
}

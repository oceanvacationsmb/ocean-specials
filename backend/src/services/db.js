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
      selling_points TEXT,
      direct_booking_url TEXT,
      airbnb_url TEXT,
      vrbo_url TEXT,
      flyer_image_url TEXT,
      min_nights INTEGER DEFAULT 1,
      max_nights INTEGER DEFAULT 30,
      scan_days INTEGER DEFAULT 15,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await db.query(`
    ALTER TABLE property_settings
    ADD COLUMN IF NOT EXISTS flyer_image_url TEXT;
  `);

  await db.query(`
    ALTER TABLE property_settings
    ADD COLUMN IF NOT EXISTS direct_booking_url TEXT;
  `);

  await db.query(`
    ALTER TABLE property_settings
    ADD COLUMN IF NOT EXISTS airbnb_url TEXT;
  `);

  await db.query(`
    ALTER TABLE property_settings
    ADD COLUMN IF NOT EXISTS vrbo_url TEXT;
  `);

  await db.query(`
    ALTER TABLE property_settings
    ADD COLUMN IF NOT EXISTS selling_points TEXT;
  `);

  await db.query(`
    ALTER TABLE property_settings
    ADD COLUMN IF NOT EXISTS min_nights INTEGER DEFAULT 1;
  `);

  await db.query(`
    ALTER TABLE property_settings
    ADD COLUMN IF NOT EXISTS max_nights INTEGER DEFAULT 30;
  `);

  await db.query(`
    ALTER TABLE property_settings
    ADD COLUMN IF NOT EXISTS scan_days INTEGER DEFAULT 15;
  `);

  return true;
}

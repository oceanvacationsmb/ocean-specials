import pg from "pg";

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
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
    throw new Error("DATABASE_URL is missing");
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
      min_nights INTEGER DEFAULT 1,
      max_nights INTEGER DEFAULT 30,
      scan_days INTEGER DEFAULT 15,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  return true;
}

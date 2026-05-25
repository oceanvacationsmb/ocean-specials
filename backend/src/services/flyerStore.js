import { ensurePropertySettingsTable, query, getPool } from "./db.js";

export async function ensureFlyersTable() {
  if (!getPool()) {
    return false;
  }

  await ensurePropertySettingsTable();

  await query(`
    CREATE TABLE IF NOT EXISTS generated_flyers (
      id SERIAL PRIMARY KEY,
      property_id TEXT,
      listing_id TEXT,
      scan_from TEXT,
      scan_to TEXT,
      cloudinary_public_id TEXT,
      flyer_url TEXT,
      caption TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '7 days'
    );
  `);

  return true;
}

export async function saveGeneratedFlyer({
  propertyId,
  listingId,
  scanFrom,
  scanTo,
  cloudinaryPublicId,
  flyerUrl,
  caption
}) {
  if (!getPool()) {
    return null;
  }

  await ensureFlyersTable();

  const result = await query(
    `
      INSERT INTO generated_flyers (
        property_id,
        listing_id,
        scan_from,
        scan_to,
        cloudinary_public_id,
        flyer_url,
        caption
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
    [
      propertyId,
      listingId,
      scanFrom,
      scanTo,
      cloudinaryPublicId,
      flyerUrl,
      caption
    ]
  );

  return result.rows[0];
}

export async function getExpiredFlyers() {
  if (!getPool()) {
    return [];
  }

  await ensureFlyersTable();

  const result = await query(`
    SELECT *
    FROM generated_flyers
    WHERE expires_at < NOW()
  `);

  return result.rows;
}

export async function deleteFlyerRecord(id) {
  if (!getPool()) {
    return;
  }

  await query(
    `
      DELETE FROM generated_flyers
      WHERE id = $1
    `,
    [id]
  );
}

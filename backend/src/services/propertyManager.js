import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { getAllListings } from "./guestyApi.js";
import { ensurePropertySettingsTable, query, getPool } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, "../data/property-config.json");

function getRawListings(data) {
  const rawListings =
    data.results ||
    data.listings ||
    data.data ||
    data.items ||
    data;

  return Array.isArray(rawListings) ? rawListings : [];
}

function getPicture(listing) {
  return (
    listing.picture?.regular ||
    listing.picture?.large ||
    listing.picture ||
    listing.pictures?.[0]?.regular ||
    listing.pictures?.[0]?.large ||
    listing.pictures?.[0]?.url ||
    ""
  );
}

function getCity(listing) {
  return (
    listing.address?.city ||
    listing.location?.city ||
    listing.city ||
    ""
  );
}

function getBedrooms(listing) {
  return (
    listing.bedrooms ||
    listing.bedroomsCount ||
    listing.accommodates?.bedrooms ||
    ""
  );
}

function getBathrooms(listing) {
  return (
    listing.bathrooms ||
    listing.bathroomsCount ||
    listing.accommodates?.bathrooms ||
    listing.terms?.bathrooms ||
    ""
  );
}

function getSleeps(listing) {
  if (typeof listing.accommodates === "number") return listing.accommodates;

  return (
    listing.guests ||
    listing.personCapacity ||
    listing.occupancy ||
    listing.terms?.maxOccupancy ||
    listing.accommodates?.guests ||
    ""
  );
}

function getTitle(listing) {
  return (
    listing.nickname ||
    listing.title ||
    listing.name ||
    listing.publicName ||
    ""
  );
}

function buildDefaultShortId(title, listingId) {
  const match = String(title).match(/\b\d{3,4}[A-Z]?(?:-\d+)?\b/i);

  if (match) {
    return match[0].toUpperCase();
  }

  return String(listingId).slice(-6).toUpperCase();
}

async function readJsonFallbackConfig() {
  try {
    const text = await fs.readFile(CONFIG_PATH, "utf8");
    return JSON.parse(text || "{}");
  } catch (error) {
    return {};
  }
}

async function getSavedSettingsFromDatabase() {
  await ensurePropertySettingsTable();

  const result = await query(`
    SELECT
      listing_id,
      short_id,
      active,
      selling_points,
      direct_booking_url,
      airbnb_url,
      vrbo_url,
      min_nights,
      max_nights,
      scan_days
    FROM property_settings
  `);

  const settings = {};

  for (const row of result.rows) {
    settings[row.listing_id] = {
      shortId: row.short_id || "",
      active: row.active !== false,
      sellingPoints: row.selling_points || "",
      directBookingUrl: row.direct_booking_url || "",
      airbnbUrl: row.airbnb_url || "",
      vrboUrl: row.vrbo_url || "",
      minNights: Number(row.min_nights || 1),
      maxNights: Number(row.max_nights || 30),
      scanDays: Number(row.scan_days || 15)
    };
  }

  return settings;
}

async function getSavedSettings() {
  if (getPool()) {
    return getSavedSettingsFromDatabase();
  }

  return readJsonFallbackConfig();
}

export async function getManagedProperties() {
  const data = await getAllListings();
  const rawListings = getRawListings(data);
  const savedSettings = await getSavedSettings();

  return rawListings.map((listing) => {
    const listingId = listing._id || listing.id || "";
    const saved = savedSettings[listingId] || {};

    const title = getTitle(listing);
    const shortId = saved.shortId || buildDefaultShortId(title, listingId);

    return {
      listingId,
      shortId,
      title,
      city: getCity(listing),
      bedrooms: getBedrooms(listing),
      bathrooms: getBathrooms(listing),
      sleeps: getSleeps(listing),
      picture: getPicture(listing),

      active: saved.active !== false,

      sellingPoints: saved.sellingPoints || "",
      directBookingUrl: saved.directBookingUrl || "",
      airbnbUrl: saved.airbnbUrl || "",
      vrboUrl: saved.vrboUrl || "",

      minNights: Number(saved.minNights ?? 1),
      maxNights: Number(saved.maxNights ?? 30),
      scanDays: Number(saved.scanDays ?? 15)
    };
  });
}

export async function saveManagedProperty(listingId, data) {
  const savedData = {
    shortId: data.shortId || "",
    active: data.active !== false,
    sellingPoints: data.sellingPoints || "",
    directBookingUrl: data.directBookingUrl || "",
    airbnbUrl: data.airbnbUrl || "",
    vrboUrl: data.vrboUrl || "",
    minNights: Number(data.minNights ?? 1),
    maxNights: Number(data.maxNights ?? 30),
    scanDays: Number(data.scanDays ?? 15)
  };

  if (getPool()) {
    await ensurePropertySettingsTable();

    await query(
      `
        INSERT INTO property_settings (
          listing_id,
          short_id,
          active,
          selling_points,
          direct_booking_url,
          airbnb_url,
          vrbo_url,
          min_nights,
          max_nights,
          scan_days,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (listing_id)
        DO UPDATE SET
          short_id = EXCLUDED.short_id,
          active = EXCLUDED.active,
          selling_points = EXCLUDED.selling_points,
          direct_booking_url = EXCLUDED.direct_booking_url,
          airbnb_url = EXCLUDED.airbnb_url,
          vrbo_url = EXCLUDED.vrbo_url,
          min_nights = EXCLUDED.min_nights,
          max_nights = EXCLUDED.max_nights,
          scan_days = EXCLUDED.scan_days,
          updated_at = NOW()
      `,
      [
        listingId,
        savedData.shortId,
        savedData.active,
        savedData.sellingPoints,
        savedData.directBookingUrl,
        savedData.airbnbUrl,
        savedData.vrboUrl,
        savedData.minNights,
        savedData.maxNights,
        savedData.scanDays
      ]
    );

    return savedData;
  }

  const config = await readJsonFallbackConfig();

  config[listingId] = {
    ...(config[listingId] || {}),
    ...savedData
  };

  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));

  return savedData;
}

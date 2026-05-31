import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { getAllListings } from "./guestyApi.js";
import { ensurePropertySettingsTable, query, getPool } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, "../data/property-config.json");
const shortIdCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base"
});

function getRawListings(data) {
  const rawListings =
    data.results ||
    data.listings ||
    data.data ||
    data.items ||
    data;

  return Array.isArray(rawListings) ? rawListings : [];
}

function getPictureFromValue(value) {
  if (!value) return "";

  if (typeof value === "string") {
    return value;
  }

  return (
    value.large ||
    value.regular ||
    value.original ||
    value.thumbnail ||
    value.url ||
    ""
  );
}

function getPicture(listing) {
  return (
    getPictureFromValue(listing.picture) ||
    getPictureFromValue(listing.pictures?.[0]) ||
    ""
  );
}

function getPictures(listing) {
  const urls = [];

  const main = getPicture(listing);

  if (main) {
    urls.push(main);
  }

  if (Array.isArray(listing.pictures)) {
    for (const picture of listing.pictures) {
      const url = getPictureFromValue(picture);

      if (url) {
        urls.push(url);
      }
    }
  }

  return [...new Set(urls)].slice(0, 10);
}

function getCity(listing) {
  return (
    listing.address?.city ||
    listing.location?.city ||
    listing.city ||
    "North Myrtle Beach"
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
    listing.bathroomsNumber ||
    listing.accommodates?.bathrooms ||
    listing.terms?.bathrooms ||
    ""
  );
}

function getSleeps(listing) {
  if (typeof listing.accommodates === "number") {
    return listing.accommodates;
  }

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
    listing.title ||
    listing.name ||
    listing.publicName ||
    listing.nickname ||
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

function comparePropertiesByShortId(a, b) {
  return shortIdCollator.compare(
    String(a.shortId || ""),
    String(b.shortId || "")
  );
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
      airbnb_url,
      vrbo_url,
      flyer_image_url,
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
      airbnbUrl: row.airbnb_url || "",
      vrboUrl: row.vrbo_url || "",
      flyerImageUrl: row.flyer_image_url || "",
      minNights: Number(row.min_nights || 1),
      maxNights: Number(row.max_nights || 45),
      scanDays: Number(row.scan_days || 45)
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

  return getManagedPropertiesFromListings(data);
}

export async function getManagedPropertiesFromListings(data) {
  const rawListings = getRawListings(data);
  const savedSettings = await getSavedSettings();

  return rawListings
    .map((listing) => {
      const listingId = listing._id || listing.id || "";
      const saved = savedSettings[listingId] || {};

      const title = getTitle(listing);
      const shortId = saved.shortId || buildDefaultShortId(title, listingId);
      const pictures = getPictures(listing);

      return {
        listingId,
        shortId,
        title,
        city: getCity(listing),
        bedrooms: getBedrooms(listing),
        bathrooms: getBathrooms(listing),
        sleeps: getSleeps(listing),
        picture: pictures[0] || "",
        pictures,

        active: saved.active !== false,

        airbnbUrl: saved.airbnbUrl || "",
        vrboUrl: saved.vrboUrl || "",
        flyerImageUrl: saved.flyerImageUrl || "",

        minNights: Number(saved.minNights ?? 1),
        maxNights: Number(saved.maxNights ?? 45),
        scanDays: Number(saved.scanDays ?? 45)
      };
    })
    .sort(comparePropertiesByShortId);
}

export async function saveManagedProperty(listingId, data) {
  const savedData = {
    shortId: data.shortId || "",
    active: data.active !== false,
    airbnbUrl: data.airbnbUrl || "",
    vrboUrl: data.vrboUrl || "",
    flyerImageUrl: data.flyerImageUrl || "",
    minNights: Number(data.minNights ?? 1),
    maxNights: Number(data.maxNights ?? 45),
    scanDays: Number(data.scanDays ?? 45)
  };

  if (getPool()) {
    await ensurePropertySettingsTable();

    await query(
      `
        INSERT INTO property_settings (
          listing_id,
          short_id,
          active,
          airbnb_url,
          vrbo_url,
          flyer_image_url,
          min_nights,
          max_nights,
          scan_days,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT (listing_id)
        DO UPDATE SET
          short_id = EXCLUDED.short_id,
          active = EXCLUDED.active,
          airbnb_url = EXCLUDED.airbnb_url,
          vrbo_url = EXCLUDED.vrbo_url,
          flyer_image_url = EXCLUDED.flyer_image_url,
          min_nights = EXCLUDED.min_nights,
          max_nights = EXCLUDED.max_nights,
          scan_days = EXCLUDED.scan_days,
          updated_at = NOW()
      `,
      [
        listingId,
        savedData.shortId,
        savedData.active,
        savedData.airbnbUrl,
        savedData.vrboUrl,
        savedData.flyerImageUrl,
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

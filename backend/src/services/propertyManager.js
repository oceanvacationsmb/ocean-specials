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

function getLastDayOfFebruary(year) {
  return new Date(Date.UTC(year, 2, 0)).toISOString().slice(0, 10);
}

function getMonthValue(value) {
  return String(value || "").slice(0, 7);
}

function formatDateOnly(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  const text = String(value);
  const dateOnlyMatch = text.match(/^\d{4}-\d{2}-\d{2}/);

  if (dateOnlyMatch) {
    return dateOnlyMatch[0];
  }

  const parsed = new Date(text);

  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toISOString().slice(0, 10);
}

function getFirstDayOfMonth(value, fallback) {
  const monthValue = getMonthValue(value || fallback);

  if (!/^\d{4}-\d{2}$/.test(monthValue)) {
    return fallback;
  }

  return `${monthValue}-01`;
}

function getLastDayOfMonth(value, fallback) {
  const monthValue = getMonthValue(value || fallback);

  if (!/^\d{4}-\d{2}$/.test(monthValue)) {
    return fallback;
  }

  const [year, month] = monthValue.split("-").map(Number);

  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function getDefaultOffSeasonPeriod(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const startYear = month <= 1 ? year - 1 : year;
  const endYear = startYear + 1;

  return {
    startDate: `${startYear}-10-01`,
    endDate: getLastDayOfFebruary(endYear)
  };
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
      scan_days,
      off_season_active,
      off_season_monthly_rate,
      off_season_start_date,
      off_season_end_date,
      off_season_flyer_url
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
      scanDays: Number(row.scan_days || 45),
      offSeasonActive: row.off_season_active === true,
      offSeasonMonthlyRate: Number(row.off_season_monthly_rate || 0),
      offSeasonStartDate: formatDateOnly(row.off_season_start_date),
      offSeasonEndDate: formatDateOnly(row.off_season_end_date),
      offSeasonFlyerUrl: row.off_season_flyer_url || ""
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
  const defaultOffSeasonPeriod = getDefaultOffSeasonPeriod();

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
        scanDays: Number(saved.scanDays ?? 45),
        offSeasonActive: saved.offSeasonActive === true,
        offSeasonMonthlyRate: Number(saved.offSeasonMonthlyRate || 0),
        offSeasonStartDate:
          saved.offSeasonStartDate || defaultOffSeasonPeriod.startDate,
        offSeasonEndDate:
          saved.offSeasonEndDate || defaultOffSeasonPeriod.endDate,
        offSeasonStartMonth: getMonthValue(
          saved.offSeasonStartDate || defaultOffSeasonPeriod.startDate
        ),
        offSeasonEndMonth: getMonthValue(
          saved.offSeasonEndDate || defaultOffSeasonPeriod.endDate
        ),
        offSeasonFlyerUrl: saved.offSeasonFlyerUrl || ""
      };
    })
    .sort(comparePropertiesByShortId);
}

export async function saveManagedProperty(listingId, data) {
  const defaultOffSeasonPeriod = getDefaultOffSeasonPeriod();
  const hasFlyerImageUrl =
    Object.prototype.hasOwnProperty.call(data, "flyerImageUrl");
  const savedData = {
    shortId: data.shortId || "",
    active: data.active !== false,
    airbnbUrl: data.airbnbUrl || "",
    vrboUrl: data.vrboUrl || "",
    flyerImageUrl: hasFlyerImageUrl ? data.flyerImageUrl || "" : null,
    minNights: Number(data.minNights ?? 1),
    maxNights: Number(data.maxNights ?? 45),
    scanDays: Number(data.scanDays ?? 45),
    offSeasonActive: data.offSeasonActive === true,
    offSeasonMonthlyRate: Number(data.offSeasonMonthlyRate || 0),
    offSeasonStartDate: getFirstDayOfMonth(
      data.offSeasonStartMonth || data.offSeasonStartDate,
      defaultOffSeasonPeriod.startDate
    ),
    offSeasonEndDate: getLastDayOfMonth(
      data.offSeasonEndMonth || data.offSeasonEndDate,
      defaultOffSeasonPeriod.endDate
    )
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
          off_season_active,
          off_season_monthly_rate,
          off_season_start_date,
          off_season_end_date,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
        ON CONFLICT (listing_id)
        DO UPDATE SET
          short_id = EXCLUDED.short_id,
          active = EXCLUDED.active,
          airbnb_url = EXCLUDED.airbnb_url,
          vrbo_url = EXCLUDED.vrbo_url,
          flyer_image_url = COALESCE(EXCLUDED.flyer_image_url, property_settings.flyer_image_url),
          min_nights = EXCLUDED.min_nights,
          max_nights = EXCLUDED.max_nights,
          scan_days = EXCLUDED.scan_days,
          off_season_active = EXCLUDED.off_season_active,
          off_season_monthly_rate = EXCLUDED.off_season_monthly_rate,
          off_season_start_date = EXCLUDED.off_season_start_date,
          off_season_end_date = EXCLUDED.off_season_end_date,
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
        savedData.scanDays,
        savedData.offSeasonActive,
        savedData.offSeasonMonthlyRate,
        savedData.offSeasonStartDate,
        savedData.offSeasonEndDate
      ]
    );

    return savedData;
  }

  const config = await readJsonFallbackConfig();

  config[listingId] = {
    ...(config[listingId] || {}),
    ...savedData,
    flyerImageUrl: hasFlyerImageUrl
      ? savedData.flyerImageUrl
      : config[listingId]?.flyerImageUrl || ""
  };

  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));

  return savedData;
}

export async function saveOffSeasonFlyerUrl(listingId, flyerUrl) {
  const cleanUrl = String(flyerUrl || "").trim();

  if (getPool()) {
    await ensurePropertySettingsTable();

    await query(
      `
        UPDATE property_settings
        SET
          off_season_flyer_url = $2,
          updated_at = NOW()
        WHERE listing_id = $1
      `,
      [listingId, cleanUrl]
    );

    return cleanUrl;
  }

  const config = await readJsonFallbackConfig();

  config[listingId] = {
    ...(config[listingId] || {}),
    offSeasonFlyerUrl: cleanUrl
  };

  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));

  return cleanUrl;
}

export async function saveFlyerImageUrl(listingId, flyerUrl) {
  const cleanUrl = String(flyerUrl || "").trim();

  if (getPool()) {
    await ensurePropertySettingsTable();

    await query(
      `
        UPDATE property_settings
        SET
          flyer_image_url = $2,
          updated_at = NOW()
        WHERE listing_id = $1
      `,
      [listingId, cleanUrl]
    );

    return cleanUrl;
  }

  const config = await readJsonFallbackConfig();

  config[listingId] = {
    ...(config[listingId] || {}),
    flyerImageUrl: cleanUrl
  };

  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));

  return cleanUrl;
}

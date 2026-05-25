import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { getAllListings } from "./guestyApi.js";

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
  const match = String(title).match(/\b\d{3,4}[A-Z]?\b/i);

  if (match) {
    return match[0].toUpperCase();
  }

  return String(listingId).slice(-6).toUpperCase();
}

export async function readPropertyConfig() {
  try {
    const text = await fs.readFile(CONFIG_PATH, "utf8");
    return JSON.parse(text || "{}");
  } catch (error) {
    return {};
  }
}

export async function savePropertyConfig(config) {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export async function getManagedProperties() {
  const data = await getAllListings();
  const config = await readPropertyConfig();
  const rawListings = getRawListings(data);

  return rawListings.map((listing) => {
    const listingId = listing._id || listing.id || "";
    const saved = config[listingId] || {};

    const title = getTitle(listing);
    const shortId = saved.shortId || buildDefaultShortId(title, listingId);

    return {
      listingId,
      shortId,
      title,
      city: getCity(listing),
      bedrooms: getBedrooms(listing),
      sleeps: getSleeps(listing),
      picture: getPicture(listing),

      active: saved.active === true,

      sellingPoints: saved.sellingPoints || "",
      directBookingUrl: saved.directBookingUrl || "",
      airbnbUrl: saved.airbnbUrl || "",
      vrboUrl: saved.vrboUrl || "",

      minNights: saved.minNights || 2,
      maxNights: saved.maxNights || 7,
      scanDays: saved.scanDays || 30
    };
  });
}

export async function saveManagedProperty(listingId, data) {
  const config = await readPropertyConfig();

  config[listingId] = {
    ...(config[listingId] || {}),

    shortId: data.shortId || "",
    active: data.active === true,

    sellingPoints: data.sellingPoints || "",
    directBookingUrl: data.directBookingUrl || "",
    airbnbUrl: data.airbnbUrl || "",
    vrboUrl: data.vrboUrl || "",

    minNights: Number(data.minNights || 2),
    maxNights: Number(data.maxNights || 7),
    scanDays: Number(data.scanDays || 30)
  };

  await savePropertyConfig(config);

  return config[listingId];
}

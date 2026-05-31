import fs from "fs/promises";

import { getAllListings } from "./guestyApi.js";
import { uploadFlyerToCloudinary } from "./cloudinaryService.js";
import {
  getManagedPropertiesFromListings,
  saveOffSeasonFlyerUrl
} from "./propertyManager.js";
import { createWinterFlyer } from "./winterFlyerBuilder.js";

function cleanText(value) {
  return String(value || "").trim();
}

function getAmenities(listing) {
  const values = Array.isArray(listing.amenities) ? listing.amenities : [];

  return new Set(
    values
      .map((value) =>
        cleanText(
          typeof value === "string"
            ? value
            : value?.name || value?.title || value?.label || ""
        ).toLowerCase()
      )
      .filter(Boolean)
  );
}

function hasAmenity(available, matches) {
  return matches.some((match) => available.has(match));
}

function getWinterHighlights(listing, shortId) {
  const available = getAmenities(listing);
  const highlights = ["FREE WIFI"];
  const listingText =
    `${listing.title || ""} ${listing.nickname || ""}`.toLowerCase();
  const hasPrivatePool =
    available.has("private pool") ||
    listingText.includes("private pool") ||
    listingText.includes("pvt pool");

  if (
    hasAmenity(available, [
      "beach",
      "beach access",
      "beach front",
      "beachfront",
      "near ocean",
      "ocean front",
      "oceanfront",
      "waterfront"
    ])
  ) {
    highlights.push("Close to the Beach");
  }

  if (shortId === "2000" || shortId === "469") {
    highlights.push("Heated Indoor Pool");
  } else if (hasPrivatePool) {
    highlights.push("Private Pool (Not Heated)");
  }

  const options = [
    { label: "Hot Tub", matches: ["hot tub", "jacuzzi"] },
    { label: "Ping-Pong Table", matches: ["ping pong table", "ping-pong table", "table tennis"] },
    { label: "Pool Table", matches: ["pool table", "billiards"] },
    { label: "Game Room", matches: ["game room", "games room"] },
    { label: "Ocean View", matches: ["ocean view", "sea view", "beach view", "water view"] },
    { label: "BBQ Grill", matches: ["bbq grill", "barbecue grill"] },
    { label: "Elevator", matches: ["elevator"] },
    { label: "Free Parking", matches: ["free parking on premises", "free parking on street", "free parking"] }
  ];

  for (const option of options) {
    if (highlights.length >= 6) {
      break;
    }

    if (hasAmenity(available, option.matches)) {
      highlights.push(option.label);
    }
  }

  return highlights;
}

function getListingImageUrl(listing) {
  return cleanText(
    listing.picture?.regular ||
    listing.picture?.large ||
    listing.picture?.thumbnail ||
    listing.pictures?.[0]?.original ||
    listing.pictures?.[0]?.regular ||
    listing.pictures?.[0]?.thumbnail ||
    ""
  );
}

function getBedrooms(listing) {
  return Number(listing.bedrooms || listing.bedroomsCount || 0);
}

function getBathrooms(listing) {
  return Number(listing.bathrooms || listing.bathroomsCount || 0);
}

function getSleeps(listing) {
  return Number(listing.accommodates || listing.sleeps || listing.guests || 0);
}

function formatMonthlyRate(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

export async function ensureOffSeasonFlyer({
  listing,
  savedProperty,
  listingId,
  shortId
}, { force = false } = {}) {
  const existingUrl = cleanText(savedProperty.offSeasonFlyerUrl);

  if (existingUrl && !force) {
    return {
      flyerUrl: existingUrl,
      created: false
    };
  }

  const safeId = String(shortId || listingId || "property")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .toLowerCase();
  const bedrooms = getBedrooms(listing);
  const bathrooms = getBathrooms(listing);
  const sleeps = getSleeps(listing);

  const { localFilePath } = await createWinterFlyer({
    propertyId: shortId,
    title: [
      bedrooms ? `${bedrooms}BR Monthly Rental` : "Monthly Rental",
      sleeps ? `Sleeps ${sleeps}` : "",
      shortId
    ].filter(Boolean).join(" | "),
    location:
      listing.address?.city ||
      listing.city ||
      "North Myrtle Beach",
    monthlyRate: formatMonthlyRate(savedProperty.offSeasonMonthlyRate),
    bedrooms,
    bathrooms,
    sleeps,
    highlights: getWinterHighlights(listing, shortId),
    startDate: savedProperty.offSeasonStartDate,
    endDate: savedProperty.offSeasonEndDate,
    photoUrl: getListingImageUrl(listing)
  });

  try {
    const uploaded = await uploadFlyerToCloudinary(
      localFilePath,
      `winter-${safeId}`
    );

    await saveOffSeasonFlyerUrl(listingId, uploaded.url);

    savedProperty.offSeasonFlyerUrl = uploaded.url;

    return {
      flyerUrl: uploaded.url,
      created: true
    };
  } finally {
    await fs.unlink(localFilePath).catch(() => {});
  }
}

function normalizeListingsResponse(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.listings)) return data.listings;
  if (Array.isArray(data.data)) return data.data;

  return [];
}

export async function regenerateOffSeasonFlyer(listingId) {
  const listingsResponse = await getAllListings();
  const listings = normalizeListingsResponse(listingsResponse);
  const listing = listings.find((item) =>
    (item._id || item.id || "") === listingId
  );

  if (!listing) {
    throw new Error("Property was not found in Guesty");
  }

  const properties = await getManagedPropertiesFromListings(listingsResponse);
  const savedProperty = properties.find((item) => item.listingId === listingId);

  if (!savedProperty) {
    throw new Error("Property settings were not found");
  }

  const flyer = await ensureOffSeasonFlyer(
    {
      listing,
      savedProperty,
      listingId,
      shortId: savedProperty.shortId
    },
    {
      force: true
    }
  );

  return {
    ...flyer,
    listingId,
    propertyId: savedProperty.shortId
  };
}

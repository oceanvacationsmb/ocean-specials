import { getListingCalendar } from "./guestyApi.js";
import { findAvailableGaps } from "./gapFinder.js";
import { getManagedProperties } from "./propertyManager.js";

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toYmd(date) {
  return date.toISOString().slice(0, 10);
}

function diffDays(startYmd, endYmd) {
  const start = new Date(startYmd + "T00:00:00");
  const end = new Date(endYmd + "T00:00:00");

  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

function niceDate(ymd) {
  const date = new Date(ymd + "T00:00:00");

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

function normalizeSellingPoints(value, sleeps) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  const points = [];

  if (sleeps) {
    points.push(`Sleeps ${sleeps}`);
  }

  return points;
}

function addOrUpdateParams(url, params) {
  if (!url) return "";

  try {
    const parsed = new URL(url);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        parsed.searchParams.set(key, value);
      }
    }

    return parsed.toString();
  } catch (error) {
    return url;
  }
}

function buildGenericLinks(property) {
  const directBookingUrl =
    property.directBookingUrl ||
    `https://oceanvacationsmb.guestybookings.com/properties/${property.listingId}`;

  return {
    direct: directBookingUrl,
    airbnb: property.airbnbUrl || "",
    vrbo: property.vrboUrl || ""
  };
}

function buildDatedLinks(property, checkIn, checkOut) {
  const generic = buildGenericLinks(property);

  return {
    direct: addOrUpdateParams(generic.direct, {
      checkIn,
      checkOut
    }),
    airbnb: addOrUpdateParams(generic.airbnb, {
      check_in: checkIn,
      check_out: checkOut
    }),
    vrbo: addOrUpdateParams(generic.vrbo, {
      arrival: checkIn,
      departure: checkOut
    })
  };
}

function buildFactsLine(property) {
  const parts = [];

  if (property.bedrooms) {
    parts.push(`${property.bedrooms} Bedrooms`);
  }

  if (property.bathrooms) {
    parts.push(`${property.bathrooms} Bathrooms`);
  }

  if (property.sleeps) {
    parts.push(`Sleeps ${property.sleeps}`);
  }

  return parts.join(" • ");
}

function choosePostLinks(property, specials) {
  const sorted = [...specials].sort((a, b) => a.checkIn.localeCompare(b.checkIn));

  if (sorted.length === 1 && sorted[0].nights <= 4) {
    return buildDatedLinks(property, sorted[0].checkIn, sorted[0].checkOut);
  }

  return buildGenericLinks(property);
}

function getOpenRange(specials) {
  const sorted = [...specials].sort((a, b) => a.checkIn.localeCompare(b.checkIn));

  if (!sorted.length) {
    return "Contact us for dates";
  }

  if (sorted.length === 1) {
    return `${sorted[0].checkInNice} to ${sorted[0].checkOutNice}`;
  }

  return `${sorted[0].checkInNice} to ${sorted[sorted.length - 1].checkOutNice}`;
}

function buildLinksSection(postLinks, flyerImageUrl) {
  const lines = [];

  if (postLinks.airbnb) {
    lines.push(`Airbnb:
${postLinks.airbnb}`);
  }

  if (postLinks.vrbo) {
    lines.push(`VRBO:
${postLinks.vrbo}`);
  }

  if (postLinks.direct) {
    lines.push(`Book direct and save up to 20%:
${postLinks.direct}`);
  }

  if (flyerImageUrl) {
    lines.push(flyerImageUrl);
  }

  return lines.join("\n\n");
}

function createPropertyPost(property, specials) {
  const sortedSpecials = [...specials].sort((a, b) =>
    a.checkIn.localeCompare(b.checkIn)
  );

  const openRange = getOpenRange(sortedSpecials);
  const facts = buildFactsLine(property);
  const postLinks = choosePostLinks(property, sortedSpecials);
  const linksSection = buildLinksSection(postLinks, property.flyerImageUrl);

  const message = `LAST MINUTE DEALS IN "${property.location}"

Open availability between ${openRange}

${property.propertyTitle}
${facts}

${linksSection}`;

  return {
    propertyId: property.propertyId,
    listingId: property.listingId,
    propertyTitle: property.propertyTitle,
    location: property.location,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    sleeps: property.sleeps,

    photoUrl: property.photoUrl,
    photoUrls: property.photoUrls || [],
    flyerImageUrl: property.flyerImageUrl || "",

    directBookingUrl: property.directBookingUrl,
    airbnbUrl: property.airbnbUrl,
    vrboUrl: property.vrboUrl,

    postDirectLink: postLinks.direct,
    postAirbnbLink: postLinks.airbnb,
    postVrboLink: postLinks.vrbo,

    specials: sortedSpecials,
    message
  };
}

function convertManagedProperty(property) {
  return {
    listingId: property.listingId,
    propertyId: property.shortId,
    propertyTitle: property.title,
    location: property.city || "North Myrtle Beach",
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    sleeps: property.sleeps,

    photoUrl: property.picture,
    photoUrls: property.pictures || [],

    sellingPoints: normalizeSellingPoints(property.sellingPoints, property.sleeps),

    directBookingUrl: property.directBookingUrl,
    airbnbUrl: property.airbnbUrl,
    vrboUrl: property.vrboUrl,
    flyerImageUrl: property.flyerImageUrl || "",

    minNights: Number(property.minNights || 1),
    maxNights: Number(property.maxNights || 30),
    scanDays: Number(property.scanDays || 15),

    active: property.active !== false
  };
}

async function scanProperty(property, scanFromYmd, scanToYmd) {
  const calendar = await getListingCalendar(
    property.listingId,
    scanFromYmd,
    scanToYmd
  );

  const calendarDays =
    calendar.days ||
    calendar.results ||
    calendar.data ||
    calendar.calendar ||
    calendar;

  const gaps = findAvailableGaps(
    calendarDays,
    property.minNights,
    property.maxNights
  );

  const specials = gaps.map((gap) => ({
    ...gap,
    nights: gap.nights || diffDays(gap.checkIn, gap.checkOut),
    checkInNice: niceDate(gap.checkIn),
    checkOutNice: niceDate(gap.checkOut)
  }));

  return {
    property,
    specials
  };
}

export async function generateSpecials(selectedPropertyIds = [], options = {}) {
  const today = new Date();
  const scanFromYmd = options.from || toYmd(today);

  const defaultScanDays = Number(options.days || 15);
  const scanToYmd =
    options.to ||
    toYmd(addDays(new Date(scanFromYmd + "T00:00:00"), defaultScanDays));

  const managedProperties = await getManagedProperties();

  const selectedSet = new Set(
    Array.isArray(selectedPropertyIds)
      ? selectedPropertyIds.filter(Boolean)
      : []
  );

  const properties = managedProperties
    .filter((property) => property.active !== false)
    .filter((property) => {
      if (!selectedSet.size) return true;
      return selectedSet.has(property.listingId);
    })
    .map(convertManagedProperty);

  const propertyResults = [];

  for (const property of properties) {
    try {
      const result = await scanProperty(property, scanFromYmd, scanToYmd);

      if (result.specials.length) {
        propertyResults.push(result);
      }
    } catch (error) {
      propertyResults.push({
        property,
        specials: [],
        error: error.message
      });
    }
  }

  const propertyPosts = propertyResults
    .filter((result) => result.specials.length)
    .map((result) => createPropertyPost(result.property, result.specials));

  return {
    ok: true,
    scan: {
      from: scanFromYmd,
      to: scanToYmd
    },
    count: propertyPosts.length,
    propertyPosts,
    results: propertyResults
  };
}

import { getListingCalendar } from "./guestyApi.js";
import { findAvailableGaps } from "./gapFinder.js";
import { getManagedProperties } from "./propertyManager.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function buildDirectBookingUrl(property) {
  return `https://oceanvacationsmb.guestybookings.com/properties/${property.listingId}`;
}

function buildGenericLinks(property) {
  return {
    airbnb: property.airbnbUrl || "",
    vrbo: property.vrboUrl || "",
    direct: buildDirectBookingUrl(property)
  };
}

function buildDatedLinks(property, checkIn, checkOut) {
  const generic = buildGenericLinks(property);

  return {
    airbnb: addOrUpdateParams(generic.airbnb, {
      check_in: checkIn,
      check_out: checkOut
    }),
    vrbo: addOrUpdateParams(generic.vrbo, {
      arrival: checkIn,
      departure: checkOut
    }),
    direct: addOrUpdateParams(generic.direct, {
      checkIn,
      checkOut
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
  const sorted = [...specials].sort((a, b) =>
    a.checkIn.localeCompare(b.checkIn)
  );

  if (sorted.length === 1 && sorted[0].nights <= 4) {
    return buildDatedLinks(property, sorted[0].checkIn, sorted[0].checkOut);
  }

  return buildGenericLinks(property);
}

function formatGapLine(gap) {
  const nightText = gap.nights === 1 ? "1 night" : `${gap.nights} nights`;

  return `• ${gap.checkInNice} to ${gap.checkOutNice} (${nightText})`;
}

function buildAvailabilitySections(specials) {
  const sorted = [...specials].sort((a, b) =>
    a.checkIn.localeCompare(b.checkIn)
  );

  if (!sorted.length) {
    return "Contact us for open dates.";
  }

  const sections = [];

  for (const gap of sorted) {
    const gapNights = gap.nights || diffDays(gap.checkIn, gap.checkOut);
    const nightText = gapNights === 1 ? "1 night" : `${gapNights} nights`;

    if (gapNights >= 4) {
      sections.push(
        `Flexible availability between ${gap.checkInNice} and ${gap.checkOutNice}:\n${formatGapLine({
          ...gap,
          nights: gapNights
        })}`
      );
    } else {
      sections.push(
        `Available now for ${nightText} between ${gap.checkInNice} and ${gap.checkOutNice}:\n${formatGapLine({
          ...gap,
          nights: gapNights
        })}`
      );
    }
  }

  return `Available dates:\n\n${sections.join("\n\n")}`;
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
    lines.push(`Flyer:
${flyerImageUrl}`);
  }

  return lines.join("\n\n");
}

function createPropertyPost(property, specials) {
  const sortedSpecials = [...specials].sort((a, b) =>
    a.checkIn.localeCompare(b.checkIn)
  );

  const facts = buildFactsLine(property);
  const availabilitySections = buildAvailabilitySections(sortedSpecials);
  const postLinks = choosePostLinks(property, sortedSpecials);
  const linksSection = buildLinksSection(postLinks, property.flyerImageUrl);

  const titleLine = facts
    ? `LAST MINUTE DEALS IN "${property.location}" - ${facts}`
    : `LAST MINUTE DEALS IN "${property.location}"`;

  const message = `${titleLine}

${availabilitySections}

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

    airbnbUrl: property.airbnbUrl,
    vrboUrl: property.vrboUrl,

    postAirbnbLink: postLinks.airbnb,
    postVrboLink: postLinks.vrbo,
    postDirectLink: postLinks.direct,

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

    airbnbUrl: property.airbnbUrl,
    vrboUrl: property.vrboUrl,
    flyerImageUrl: property.flyerImageUrl || "",

    minNights: 1,
    maxNights: 60,
    scanDays: 60,

    active: property.active !== false
  };
}

async function getListingCalendarWithRetry(listingId, scanFromYmd, scanToYmd) {
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await getListingCalendar(listingId, scanFromYmd, scanToYmd);
    } catch (error) {
      const status = error.response?.status;

      if (status !== 429 || attempt === maxAttempts) {
        throw error;
      }

      const waitMs = attempt * 3500;

      console.log(
        `Guesty rate limit for ${listingId}. Retry ${attempt}/${maxAttempts} in ${waitMs}ms`
      );

      await sleep(waitMs);
    }
  }

  throw new Error("Calendar retry failed");
}

async function scanProperty(property, scanFromYmd, scanToYmd) {
  const calendar = await getListingCalendarWithRetry(
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
    1,
    60
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

  const scanDays = 60;

  const startDate = addDays(today, 2);
  const scanFromYmd = toYmd(startDate);
  const scanToYmd = toYmd(addDays(startDate, scanDays));

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
      console.log(`Scanning ${property.propertyId} ${property.listingId}`);

      const result = await scanProperty(property, scanFromYmd, scanToYmd);

      propertyResults.push(result);

      await sleep(1200);
    } catch (error) {
      propertyResults.push({
        property,
        specials: [],
        error: error.message
      });

      await sleep(2500);
    }
  }

  const propertyPosts = propertyResults
    .filter((result) => result.specials.length)
    .map((result) => createPropertyPost(result.property, result.specials));

  return {
    ok: true,
    scan: {
      from: scanFromYmd,
      to: scanToYmd,
      days: scanDays
    },
    count: propertyPosts.length,
    propertyPosts,
    results: propertyResults
  };
}

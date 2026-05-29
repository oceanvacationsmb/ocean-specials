import {
  getAllListings,
  getListingCalendar
} from "./guestyApi.js";

import * as db from "./db.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(value) {
  return String(value || "").trim();
}

function getDateOnly(value) {
  if (!value) return "";

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return "";
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function diffNights(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.round((end - start) / 86400000);
}

function getTodayPlusDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(date) {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

async function loadSavedProperties() {
  if (typeof db.getManagedProperties === "function") {
    const rows = await db.getManagedProperties();
    return Array.isArray(rows) ? rows : [];
  }

  if (typeof db.getAllManagedProperties === "function") {
    const rows = await db.getAllManagedProperties();
    return Array.isArray(rows) ? rows : [];
  }

  if (typeof db.getProperties === "function") {
    const rows = await db.getProperties();
    return Array.isArray(rows) ? rows : [];
  }

  if (typeof db.getPropertySettings === "function") {
    const rows = await db.getPropertySettings();
    return Array.isArray(rows) ? rows : [];
  }

  if (typeof db.getAllPropertySettings === "function") {
    const rows = await db.getAllPropertySettings();
    return Array.isArray(rows) ? rows : [];
  }

  return [];
}

function normalizeListingsResponse(data) {
  if (!data) return [];

  if (Array.isArray(data)) return data;

  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.listings)) return data.listings;
  if (Array.isArray(data.data)) return data.data;

  if (data.result && Array.isArray(data.result.results)) return data.result.results;
  if (data.result && Array.isArray(data.result.listings)) return data.result.listings;
  if (data.result && Array.isArray(data.result.data)) return data.result.data;

  return [];
}

function normalizeCalendarDays(calendarData) {
  if (!calendarData) return [];

  if (Array.isArray(calendarData)) return calendarData;

  if (Array.isArray(calendarData.days)) return calendarData.days;
  if (Array.isArray(calendarData.calendar)) return calendarData.calendar;
  if (Array.isArray(calendarData.results)) return calendarData.results;
  if (Array.isArray(calendarData.data)) return calendarData.data;
  if (Array.isArray(calendarData.result)) return calendarData.result;

  if (calendarData.result) {
    if (Array.isArray(calendarData.result.days)) return calendarData.result.days;
    if (Array.isArray(calendarData.result.calendar)) return calendarData.result.calendar;
    if (Array.isArray(calendarData.result.results)) return calendarData.result.results;
    if (Array.isArray(calendarData.result.data)) return calendarData.result.data;
  }

  if (calendarData.data) {
    if (Array.isArray(calendarData.data.days)) return calendarData.data.days;
    if (Array.isArray(calendarData.data.calendar)) return calendarData.data.calendar;
    if (Array.isArray(calendarData.data.results)) return calendarData.data.results;
  }

  const objectSources = [
    calendarData.calendar,
    calendarData.days,
    calendarData.data,
    calendarData.result?.calendar,
    calendarData.result?.days,
    calendarData.result?.data
  ];

  for (const source of objectSources) {
    if (source && typeof source === "object" && !Array.isArray(source)) {
      return Object.entries(source).map(([date, value]) => ({
        date,
        ...(value || {})
      }));
    }
  }

  return Object.entries(calendarData)
    .filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key))
    .map(([date, value]) => ({
      date,
      ...(value || {})
    }));
}

function getCalendarDayDate(day) {
  return (
    getDateOnly(day.date) ||
    getDateOnly(day.day) ||
    getDateOnly(day.currentDate) ||
    getDateOnly(day.startDate) ||
    getDateOnly(day.from)
  );
}

function isAvailableCalendarDay(day) {
  const status = String(
    day.status ||
    day.availability ||
    day.availableStatus ||
    day.state ||
    day.blockedReason ||
    day.reason ||
    ""
  ).toLowerCase();

  if (day.available === true) return true;
  if (day.isAvailable === true) return true;
  if (day.bookable === true) return true;
  if (day.isBookable === true) return true;
  if (day.canBook === true) return true;
  if (day.canCheckIn === true && day.canCheckOut === true) return true;

  if (status === "available") return true;
  if (status === "bookable") return true;
  if (status === "free") return true;
  if (status.includes("available") && !status.includes("unavailable")) return true;

  if (day.available === false) return false;
  if (day.isAvailable === false) return false;
  if (day.bookable === false) return false;
  if (day.isBookable === false) return false;
  if (day.canBook === false) return false;

  if (
    day.blocked === true ||
    day.isBlocked === true ||
    day.reserved === true ||
    day.isReserved === true
  ) {
    return false;
  }

  if (
    status.includes("blocked") ||
    status.includes("reserved") ||
    status.includes("unavailable") ||
    status.includes("booked") ||
    status.includes("occupied") ||
    status.includes("closed")
  ) {
    return false;
  }

  return false;
}

function findAvailableGaps(calendarData, minNights = 1, maxNights = 60) {
  const calendarDays = normalizeCalendarDays(calendarData)
    .map((day) => ({
      ...day,
      _date: getCalendarDayDate(day),
      _available: isAvailableCalendarDay(day)
    }))
    .filter((day) => day._date)
    .sort((a, b) => a._date.localeCompare(b._date));

  const gaps = [];
  let gapStart = null;
  let previousDate = null;

  for (const day of calendarDays) {
    if (day._available) {
      if (!gapStart) {
        gapStart = day._date;
      }

      previousDate = day._date;
      continue;
    }

    if (gapStart && previousDate) {
      const gapEnd = addDays(previousDate, 1);
      const nights = diffNights(gapStart, gapEnd);

      if (nights >= minNights && nights <= maxNights) {
        gaps.push({
          startDate: gapStart,
          endDate: gapEnd,
          nights
        });
      }
    }

    gapStart = null;
    previousDate = day._date;
  }

  if (gapStart && previousDate) {
    const gapEnd = addDays(previousDate, 1);
    const nights = diffNights(gapStart, gapEnd);

    if (nights >= minNights && nights <= maxNights) {
      gaps.push({
        startDate: gapStart,
        endDate: gapEnd,
        nights
      });
    }
  }

  return gaps;
}

function getListingId(listing) {
  return listing._id || listing.id || listing.listingId || "";
}

function getPropertyShortId(listing) {
  const text = `${listing.nickname || ""} ${listing.title || ""}`;
  const match = text.match(/\b\d{3,5}(?:[-/]\d+)?[A-Z]?\b/i);

  if (match) return match[0];

  return getListingId(listing).slice(-6);
}

function getLocation(listing, savedProperty = {}) {
  return (
    cleanText(savedProperty.location) ||
    cleanText(listing.address?.city) ||
    cleanText(listing.city) ||
    "North Myrtle Beach"
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

function getFactsLine(listing) {
  const facts = [];

  const bedrooms = getBedrooms(listing);
  const bathrooms = getBathrooms(listing);
  const sleeps = getSleeps(listing);

  if (bedrooms) facts.push(`${bedrooms} Bedrooms`);
  if (bathrooms) facts.push(`${bathrooms} Bathrooms`);
  if (sleeps) facts.push(`Sleeps ${sleeps}`);

  return facts.join(" • ");
}

function makeDirectUrl(listingId) {
  return `https://oceanvacationsmb.guestybookings.com/properties/${listingId}`;
}

function formatGapTitle(gap) {
  const start = formatDate(gap.startDate);
  const end = formatDate(gap.endDate);

  if (gap.nights >= 4) {
    return `Flexible availability between ${start} and ${end}:`;
  }

  return `Available now for ${gap.nights} ${gap.nights === 1 ? "night" : "nights"} between ${start} and ${end}:`;
}

function buildPost({ listing, savedProperty, gaps }) {
  const listingId = getListingId(listing);
  const location = getLocation(listing, savedProperty);
  const factsLine = getFactsLine(listing);

  const airbnbUrl = cleanText(savedProperty.airbnb_url || savedProperty.airbnbUrl);
  const vrboUrl = cleanText(savedProperty.vrbo_url || savedProperty.vrboUrl);
  const flyerUrl = cleanText(savedProperty.flyer_url || savedProperty.flyerUrl);
  const directUrl =
    cleanText(savedProperty.direct_url || savedProperty.directUrl) ||
    makeDirectUrl(listingId);

  const lines = [];

  lines.push(`LAST MINUTE DEALS IN "${location}"${factsLine ? ` - ${factsLine}` : ""}`);
  lines.push("");
  lines.push("Available dates:");
  lines.push("");

  for (const gap of gaps) {
    lines.push(formatGapTitle(gap));
    lines.push(`• ${formatDate(gap.startDate)} to ${formatDate(gap.endDate)} (${gap.nights} ${gap.nights === 1 ? "night" : "nights"})`);
    lines.push("");
  }

  if (airbnbUrl) {
    lines.push("Airbnb:");
    lines.push(airbnbUrl);
    lines.push("");
  }

  if (vrboUrl) {
    lines.push("VRBO:");
    lines.push(vrboUrl);
    lines.push("");
  }

  lines.push("Book direct and save up to 20%:");
  lines.push(directUrl);
  lines.push("");

  if (flyerUrl) {
    lines.push("Flyer:");
    lines.push(flyerUrl);
  }

  return lines.join("\n").trim();
}

function mergeListingWithSavedSettings(listing, savedProperties) {
  const listingId = getListingId(listing);
  const shortId = getPropertyShortId(listing);

  const saved =
    savedProperties.find((item) => item.listing_id === listingId) ||
    savedProperties.find((item) => item.listingId === listingId) ||
    savedProperties.find((item) => item.property_id === listingId) ||
    savedProperties.find((item) => item.propertyId === listingId) ||
    savedProperties.find((item) => item.short_id === shortId) ||
    savedProperties.find((item) => item.shortId === shortId) ||
    {};

  return {
    listing,
    savedProperty: saved,
    listingId,
    shortId,
    active: saved.active !== false && saved.is_active !== false
  };
}

async function scanProperty(property, scanFrom, scanTo) {
  const {
    listing,
    savedProperty,
    listingId,
    shortId
  } = property;

  console.log(`Scanning ${shortId} ${listingId}`);

  try {
    const calendar = await getListingCalendar(listingId, scanFrom, scanTo);
    const calendarDays = normalizeCalendarDays(calendar);
    const gaps = findAvailableGaps(calendar, 1, 60);

    return {
      listingId,
      shortId,
      title: listing.title || listing.nickname || shortId,
      specials: gaps,
      gaps,
      error: null,
      calendarDaysCount: calendarDays.length,
      availableDaysCount: calendarDays.filter((day) => isAvailableCalendarDay(day)).length,
      firstCalendarDay: calendarDays[0] || null,
      post: gaps.length
        ? buildPost({
            listing,
            savedProperty,
            gaps
          })
        : ""
    };
  } catch (error) {
    return {
      listingId,
      shortId,
      title: listing.title || listing.nickname || shortId,
      specials: [],
      gaps: [],
      error: error.message || "Calendar scan failed",
      calendarDaysCount: 0,
      availableDaysCount: 0,
      firstCalendarDay: null,
      post: ""
    };
  }
}

export async function generateSpecials() {
  const scanFrom = getTodayPlusDays(2);
  const scanTo = addDays(scanFrom, 60);

  const listingsResponse = await getAllListings();
  const listings = normalizeListingsResponse(listingsResponse);

  const savedProperties = await loadSavedProperties();

  const managedProperties = listings
    .map((listing) => mergeListingWithSavedSettings(listing, savedProperties))
    .filter((property) => property.active);

  const propertyResults = [];

  for (const property of managedProperties) {
    const result = await scanProperty(property, scanFrom, scanTo);
    propertyResults.push(result);

    await sleep(500);
  }

  const propertyPosts = propertyResults
    .filter((result) => result.specials.length > 0)
    .map((result) => ({
      listingId: result.listingId,
      shortId: result.shortId,
      title: result.title,
      specials: result.specials,
      message: result.post,
      post: result.post
    }));

  return {
    ok: true,

    range: {
      from: scanFrom,
      to: scanTo
    },

    scanRange: {
      from: scanFrom,
      to: scanTo
    },

    scanFrom,
    scanTo,
    scanDays: 60,

    totalProperties: managedProperties.length,
    foundProperties: propertyPosts.length,

    propertyPosts,
    results: propertyResults
  };
}

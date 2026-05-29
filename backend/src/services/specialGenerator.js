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
  const possibleFunctions = [
    "getManagedProperties",
    "getAllManagedProperties",
    "getProperties",
    "getPropertySettings",
    "getAllPropertySettings",
    "listManagedProperties",
    "listProperties"
  ];

  for (const name of possibleFunctions) {
    if (typeof db[name] === "function") {
      const rows = await db[name]();
      return Array.isArray(rows) ? rows : [];
    }
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

  const paths = [
    calendarData.days,
    calendarData.calendar,
    calendarData.results,
    calendarData.data,
    calendarData.result,
    calendarData.result?.days,
    calendarData.result?.calendar,
    calendarData.result?.results,
    calendarData.result?.data,
    calendarData.data?.days,
    calendarData.data?.calendar,
    calendarData.data?.results
  ];

  for (const value of paths) {
    if (Array.isArray(value)) return value;
  }

  const objectPaths = [
    calendarData.calendar,
    calendarData.days,
    calendarData.data,
    calendarData.result?.calendar,
    calendarData.result?.days,
    calendarData.result?.data
  ];

  for (const source of objectPaths) {
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
    ""
  ).toLowerCase();

  if (status === "available") return true;
  if (status === "bookable") return true;
  if (status === "free") return true;

  if (
    status === "booked" ||
    status === "blocked" ||
    status === "reserved" ||
    status === "unavailable" ||
    status === "occupied" ||
    status === "closed"
  ) {
    return false;
  }

  if (status.includes("available") && !status.includes("unavailable")) {
    return true;
  }

  if (
    status.includes("booked") ||
    status.includes("blocked") ||
    status.includes("reserved") ||
    status.includes("unavailable") ||
    status.includes("occupied") ||
    status.includes("closed")
  ) {
    return false;
  }

  if (day.available === true) return true;
  if (day.isAvailable === true) return true;
  if (day.bookable === true) return true;
  if (day.isBookable === true) return true;
  if (day.canBook === true) return true;

  if (day.available === false) return false;
  if (day.isAvailable === false) return false;
  if (day.bookable === false) return false;
  if (day.isBookable === false) return false;
  if (day.canBook === false) return false;

  if (day.blocked === true) return false;
  if (day.isBlocked === true) return false;
  if (day.reserved === true) return false;
  if (day.isReserved === true) return false;

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
  const vrboUrl = cleanText

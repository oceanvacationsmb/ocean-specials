import { getListingCalendar } from "./guestyApi.js";
import { findAvailableGaps } from "./gapFinder.js";
import { properties } from "../data/properties.js";

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

function getPromoType(daysUntilCheckIn) {
  if (daysUntilCheckIn <= 7) return "Last Minute Special";
  if (daysUntilCheckIn <= 14) return "Next Week Opening";
  if (daysUntilCheckIn <= 30) return "Open Gap Special";
  return "Direct Booking Special";
}

function getHeadline(daysUntilCheckIn) {
  if (daysUntilCheckIn <= 7) return "LAST MINUTE SPECIAL";
  if (daysUntilCheckIn <= 14) return "NEXT WEEK OPENING";
  if (daysUntilCheckIn <= 30) return "OPEN GAP SPECIAL";
  return "DIRECT BOOKING SPECIAL";
}

function createFacebookText(special) {
  const reviewLine = special.airbnbReviewUrl
    ? `\nSee reviews on Airbnb:\n${special.airbnbReviewUrl}\n`
    : "";

  return `${special.promoType} in ${special.location}

We have a ${special.nights} night opening at this ${special.bedrooms} bedroom property that sleeps up to ${special.sleeps} guests.

${special.sellingPoints.join(" • ")}

Available: ${special.checkInNice} to ${special.checkOutNice}

Book direct and save up to 20%.

Message us for the direct booking special and availability link.

${reviewLine}
Ocean Vacations
Call or text: 843-222-9751
Website: oceanvacationsmb.com`;
}

async function scanProperty(property, todayYmd) {
  const scanDays = property.scanDays || 30;
  const scanEndYmd = toYmd(addDays(new Date(todayYmd + "T00:00:00"), scanDays));

  const calendar = await getListingCalendar(
    property.listingId,
    todayYmd,
    scanEndYmd
  );

  const gaps = findAvailableGaps(
    calendar,
    property.minNights || 2,
    property.maxNights || 7
  );

  const specials = gaps.map((gap) => {
    const daysUntilCheckIn = diffDays(todayYmd, gap.checkIn);

    const special = {
      ok: true,
      propertyId: property.id,
      propertyTitle: property.title,
      location: property.location,
      bedrooms: property.bedrooms,
      sleeps: property.sleeps,
      sellingPoints: property.sellingPoints || [],
      photoUrl: property.photoUrl || "",
      checkIn: gap.checkIn,
      checkOut: gap.checkOut,
      checkInNice: niceDate(gap.checkIn),
      checkOutNice: niceDate(gap.checkOut),
      nights: gap.nights,
      daysUntilCheckIn,
      promoType: getPromoType(daysUntilCheckIn),
      headline: getHeadline(daysUntilCheckIn),
      offerText: "Save up to 20% when booking direct",
      callToAction: "Message us for the direct booking special",
      directBookingUrl: property.directBookingUrl,
      airbnbReviewUrl: property.airbnbReviewUrl || ""
    };

    special.facebookText = createFacebookText(special);

    return special;
  });

  return {
    propertyId: property.id,
    propertyTitle: property.title,
    scanFrom: todayYmd,
    scanTo: scanEndYmd,
    gapsFound: gaps.length,
    specials
  };
}

export async function generateSpecials(selectedPropertyIds = []) {
  const today = new Date();
  const todayYmd = toYmd(today);

  const activeProperties = properties.filter((property) => {
    if (!property.active) return false;

    if (selectedPropertyIds.length > 0) {
      return selectedPropertyIds.includes(property.id);
    }

    return true;
  });

  const propertyResults = [];
  const allSpecials = [];

  for (const property of activeProperties) {
    try {
      const result = await scanProperty(property, todayYmd);
      propertyResults.push(result);
      allSpecials.push(...result.specials);
    } catch (error) {
      propertyResults.push({
        propertyId: property.id,
        propertyTitle: property.title,
        error: error.message,
        details: error.response?.data || null,
        specials: []
      });
    }
  }

  return {
    ok: true,
    scan: {
      from: todayYmd,
      propertiesScanned: activeProperties.length,
      specialsCreated: allSpecials.length
    },
    propertyResults,
    specials: allSpecials
  };
}

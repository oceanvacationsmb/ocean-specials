import { getListingCalendar } from "./guestyApi.js";
import { findAvailableGaps } from "./gapFinder.js";

const property = {
  id: "827B",
  title: "6BR Murrells Inlet Home",
  listingId: "68db1a3f34efe70012fd1284",
  bedrooms: 6,
  sleeps: 18,
  location: "Murrells Inlet",
  sellingPoints: ["Private Pool", "Walk to Beach", "Sleeps 18"],
  directBookingUrl:
    "https://oceanvacationsmb.guestybookings.com/en/properties/68db1a3f34efe70012fd1284",
  airbnbReviewUrl: "",
  minNights: 2,
  maxNights: 7,
  scanDays: 30
};

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

We have a ${special.nights} night opening at this ${special.bedrooms} bedroom home that sleeps up to ${special.sleeps} guests.

${special.sellingPoints.join(" • ")}

Available: ${special.checkInNice} to ${special.checkOutNice}

Book direct and save up to 20%.

Message us for the direct booking special and availability link.

${reviewLine}
Ocean Vacations
Call or text: 843-222-9751
Website: oceanvacationsmb.com`;
}

export async function generateSpecials() {
  const today = new Date();
  const todayYmd = toYmd(today);
  const scanEndYmd = toYmd(addDays(today, property.scanDays));

  const calendar = await getListingCalendar(
    property.listingId,
    todayYmd,
    scanEndYmd
  );

  const gaps = findAvailableGaps(calendar, property.minNights, property.maxNights);

  const specials = gaps.map((gap) => {
    const daysUntilCheckIn = diffDays(todayYmd, gap.checkIn);

    const special = {
      ok: true,
      propertyId: property.id,
      propertyTitle: property.title,
      location: property.location,
      bedrooms: property.bedrooms,
      sleeps: property.sleeps,
      sellingPoints: property.sellingPoints,
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
      airbnbReviewUrl: property.airbnbReviewUrl
    };

    special.facebookText = createFacebookText(special);

    return special;
  });

  return {
    ok: true,
    property,
    scan: {
      from: todayYmd,
      to: scanEndYmd,
      scanDays: property.scanDays,
      gapsFound: gaps.length,
      specialsCreated: specials.length
    },
    specials
  };
}

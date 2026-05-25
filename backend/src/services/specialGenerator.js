import { getListingCalendar, createReservationQuote } from "./guestyApi.js";
import { findAvailableGaps } from "./gapFinder.js";
import { getTotalFromQuote, applyDiscount, formatMoney } from "./priceHelper.js";

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
  maxNights: 7
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

function getDiscountPercent(daysUntilCheckIn) {
  if (daysUntilCheckIn >= 0 && daysUntilCheckIn <= 7) return 15;
  if (daysUntilCheckIn >= 8 && daysUntilCheckIn <= 13) return 10;
  if (daysUntilCheckIn >= 14 && daysUntilCheckIn <= 30) return 5;
  return 0;
}

function getPromoType(daysUntilCheckIn) {
  if (daysUntilCheckIn <= 7) return "Last Minute Special";
  if (daysUntilCheckIn <= 13) return "Gap Stay Special";
  return "Open Date Special";
}

function createFacebookText(special) {
  const reviewLine = special.airbnbReviewUrl
    ? `\nSee reviews on Airbnb:\n${special.airbnbReviewUrl}\n`
    : "";

  return `Last minute opening in ${special.location}

We have a ${special.nights} night opening at this ${special.bedrooms} bedroom home that sleeps up to ${special.sleeps} guests.

${special.sellingPoints.join(" • ")}

Available: ${special.checkInNice} to ${special.checkOutNice}

Regular total: ${special.regularTotalFormatted}
Special direct price: ${special.specialTotalFormatted}
Save ${special.discountPercent}% when booking direct.

${reviewLine}
Direct booking:
${special.directBookingUrl}

Call or text:
843-222-9751

Ocean Vacations
oceanvacationsmb.com`;
}

function niceDate(ymd) {
  const date = new Date(ymd + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateSpecials() {
  const today = new Date();
  const todayYmd = toYmd(today);
  const scanEndYmd = toYmd(addDays(today, 30));

  const calendar = await getListingCalendar(
    property.listingId,
    todayYmd,
    scanEndYmd
  );

  const gaps = findAvailableGaps(calendar, property.minNights, property.maxNights);

  const specials = [];
  const gapsToQuote = gaps.slice(0, 1);
    for (const gap of gapsToQuote) {
    const daysUntilCheckIn = diffDays(todayYmd, gap.checkIn);
    const discountPercent = getDiscountPercent(daysUntilCheckIn);

    if (!discountPercent) continue;

    let quote;
    let price;

    try {
      quote = await createReservationQuote({
        listingId: property.listingId,
        checkInDateLocalized: gap.checkIn,
        checkOutDateLocalized: gap.checkOut,
        guestsCount: property.sleeps
      });

      price = getTotalFromQuote(quote);

      if (!price) {
        specials.push({
          propertyId: property.id,
          checkIn: gap.checkIn,
          checkOut: gap.checkOut,
          nights: gap.nights,
          ok: false,
          error: "Could not read price from Guesty quote"
        });

        continue;
      }
    } catch (error) {
      specials.push({
        propertyId: property.id,
        checkIn: gap.checkIn,
        checkOut: gap.checkOut,
        nights: gap.nights,
        ok: false,
        error: error.message,
        details: error.response?.data || null
      });

      continue;
    }

    const discount = applyDiscount(price.regularTotal, discountPercent);

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
      discountPercent,
      accommodation: price.accommodation,
      cleaning: price.cleaning,
      taxes: price.taxes,
      regularTotal: price.regularTotal,
      discountAmount: discount.discountAmount,
      specialTotal: discount.specialTotal,
      regularTotalFormatted: formatMoney(price.regularTotal),
      discountAmountFormatted: formatMoney(discount.discountAmount),
      specialTotalFormatted: formatMoney(discount.specialTotal),
      directBookingUrl: property.directBookingUrl,
      airbnbReviewUrl: property.airbnbReviewUrl
    };

    special.facebookText = createFacebookText(special);

    specials.push(special);

    await wait(800);
  }

  return {
    ok: true,
    property,
    scan: {
      from: todayYmd,
      to: scanEndYmd,
      gapsFound: gaps.length,
      specialsCreated: specials.filter((item) => item.ok).length
    },
    specials
  };
}

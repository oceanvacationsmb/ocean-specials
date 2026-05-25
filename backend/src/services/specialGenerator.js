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

function nightText(nights) {
  return nights === 1 ? "1 night" : `${nights} nights`;
}

function normalizeSellingPoints(value, sleeps) {
  if (!value) {
    return [`Sleeps ${sleeps}`];
  }

  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  return String(value)
    .split("•")
    .map((item) => item.trim())
    .filter(Boolean);
}

function addOrUpdateParams(url, params) {
  if (!url) return "";

  try {
    const cleanUrl = url.trim();
    const parsedUrl = new URL(cleanUrl);

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        parsedUrl.searchParams.set(key, String(value));
      }
    });

    return parsedUrl.toString();
  } catch (error) {
    return url;
  }
}

function buildDatedLinks(property, checkIn, checkOut) {
  const maxGuests = Number(property.sleeps || 1);
  const airbnbGuests = Math.min(maxGuests, 16);

  const directDateUrl = property.directBookingUrl
    ? addOrUpdateParams(property.directBookingUrl, {
        minOccupancy: maxGuests,
        checkIn,
        checkOut
      })
    : "";

  const airbnbDateUrl = property.airbnbUrl
    ? addOrUpdateParams(property.airbnbUrl, {
        check_in: checkIn,
        check_out: checkOut,
        adults: airbnbGuests
      })
    : "";

  const vrboDateUrl = property.vrboUrl
    ? addOrUpdateParams(property.vrboUrl, {
        startDate: checkIn,
        endDate: checkOut,
        adults: maxGuests
      })
    : "";

  return {
    directDateUrl,
    airbnbDateUrl,
    vrboDateUrl,
    maxGuests,
    airbnbGuests
  };
}

function createExactOpeningText(special) {
  const directLine = special.directDateUrl
    ? `Book direct and save up to 20%:\n${special.directDateUrl}\n`
    : "";

  const vrboLine = special.vrboDateUrl
    ? `\nVRBO listing with dates:\n${special.vrboDateUrl}\n`
    : "";

  const airbnbLine = special.airbnbDateUrl
    ? `\nAirbnb listing with dates:\n${special.airbnbDateUrl}\n`
    : "";

  return `${special.checkInNice} to ${special.checkOutNice}

We have a ${nightText(special.nights)} opening at this ${special.bedrooms} bedroom property that sleeps up to ${special.sleeps} guests for ${special.checkInNice} to ${special.checkOutNice}

${directLine}${vrboLine}${airbnbLine}`;
}

function createLongOpeningText(special) {
  const directLine = special.directBookingUrl
    ? `Book direct and save up to 20%:\n${special.directBookingUrl}\n`
    : "";

  const vrboLine = special.vrboUrl
    ? `\nVRBO listing:\n${special.vrboUrl}\n`
    : "";

  const airbnbLine = special.airbnbUrl
    ? `\nAirbnb listing:\n${special.airbnbUrl}\n`
    : "";

  return `${special.checkInNice} to ${special.checkOutNice}

Limited availability open dates between ${special.checkInNice} and ${special.checkOutNice}.

This ${special.bedrooms} bedroom property sleeps up to ${special.sleeps} guests. Flexible stay options may be available inside this open window.

${directLine}${vrboLine}${airbnbLine}`;
}

function createOpeningText(special) {
  if (special.nights > 7) {
    return createLongOpeningText(special);
  }

  return createExactOpeningText(special);
}

function createPropertyPost(property, specials) {
  const separator =
    "\n________________________________________________________________________________\n\n";

  const openingsText = specials
    .map((special) => createOpeningText(special))
    .join(separator);

  return `${property.sellingPoints.join(" • ")} in ${property.location}

*****OPEN AVAILABILITY SPECIALS*****

${openingsText}

oceanvacationsmb.com`;
}

function convertManagedProperty(property) {
  const directBookingUrl =
    property.directBookingUrl ||
    `https://oceanvacationsmb.guestybookings.com/en/properties/${property.listingId}`;

  return {
    id: property.shortId,
    title: property.title,
    listingId: property.listingId,

    bedrooms: property.bedrooms,
    sleeps: property.sleeps,
    location: property.city,

    sellingPoints: normalizeSellingPoints(property.sellingPoints, property.sleeps),

    photoUrl: property.picture || "",

    directBookingUrl,
    airbnbUrl: property.airbnbUrl || "",
    vrboUrl: property.vrboUrl || "",

    minNights: Number(property.minNights || 1),
    maxNights: Number(property.maxNights || 30),
    scanDays: Number(property.scanDays || 30),

    active: property.active === true
  };
}

async function scanProperty(property, todayYmd) {
  const scanDays = property.scanDays || 30;
  const scanEndYmd = toYmd(addDays(new Date(todayYmd + "T00:00:00"), scanDays));

  const calendar = await getListingCalendar(
    property.listingId,
    todayYmd,
    scanEndYmd
  );

  const gaps = findAvailableGaps(calendar, 1, scanDays);

  const specials = gaps.map((gap) => {
    const daysUntilCheckIn = diffDays(todayYmd, gap.checkIn);
    const datedLinks = buildDatedLinks(property, gap.checkIn, gap.checkOut);

    return {
      ok: true,

      propertyId: property.id,
      propertyTitle: property.title,
      listingId: property.listingId,

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

      directBookingUrl: property.directBookingUrl || "",
      airbnbUrl: property.airbnbUrl || "",
      vrboUrl: property.vrboUrl || "",

      directDateUrl: datedLinks.directDateUrl,
      airbnbDateUrl: datedLinks.airbnbDateUrl,
      vrboDateUrl: datedLinks.vrboDateUrl,

      maxGuests: datedLinks.maxGuests,
      airbnbGuests: datedLinks.airbnbGuests
    };
  });

  const propertyPost =
    specials.length > 0
      ? {
          ok: true,
          propertyId: property.id,
          propertyTitle: property.title,
          listingId: property.listingId,
          location: property.location,
          bedrooms: property.bedrooms,
          sleeps: property.sleeps,
          sellingPoints: property.sellingPoints || [],
          openingsCount: specials.length,
          firstCheckInNice: specials[0].checkInNice,
          lastCheckOutNice: specials[specials.length - 1].checkOutNice,
          facebookText: createPropertyPost(property, specials),
          specials
        }
      : null;

  return {
    propertyId: property.id,
    propertyTitle: property.title,
    scanFrom: todayYmd,
    scanTo: scanEndYmd,
    gapsFound: gaps.length,
    specials,
    propertyPost
  };
}

export async function generateSpecials(selectedPropertyIds = []) {
  const today = new Date();
  const todayYmd = toYmd(today);

  const managedProperties = await getManagedProperties();

  const activeProperties = managedProperties
    .map(convertManagedProperty)
    .filter((property) => {
      if (!property.active) return false;

      if (selectedPropertyIds.length > 0) {
        return (
          selectedPropertyIds.includes(property.id) ||
          selectedPropertyIds.includes(property.listingId)
        );
      }

      return true;
    });

  const propertyResults = [];
  const allSpecials = [];
  const propertyPosts = [];

  for (const property of activeProperties) {
    try {
      const result = await scanProperty(property, todayYmd);

      propertyResults.push(result);
      allSpecials.push(...result.specials);

      if (result.propertyPost) {
        propertyPosts.push(result.propertyPost);
      }
    } catch (error) {
      propertyResults.push({
        propertyId: property.id,
        propertyTitle: property.title,
        listingId: property.listingId,
        error: error.message,
        details: error.response?.data || null,
        specials: [],
        propertyPost: null
      });
    }
  }

  return {
    ok: true,
    scan: {
      from: todayYmd,
      propertiesScanned: activeProperties.length,
      specialsCreated: allSpecials.length,
      propertyPostsCreated: propertyPosts.length
    },
    propertyResults,
    specials: allSpecials,
    propertyPosts
  };
}

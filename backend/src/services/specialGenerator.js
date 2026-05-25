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
    const parsedUrl = new URL(url.trim());

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

function buildGenericLinks(property) {
  return {
    directLink:
      property.directBookingUrl ||
      `https://oceanvacationsmb.guestybookings.com/en/properties/${property.listingId}`,
    airbnbLink: property.airbnbUrl || "",
    vrboLink: property.vrboUrl || ""
  };
}

function buildDatedLinks(property, checkIn, checkOut) {
  const maxGuests = Number(property.sleeps || 1);
  const airbnbGuests = Math.min(maxGuests, 16);
  const generic = buildGenericLinks(property);

  return {
    directLink: generic.directLink
      ? addOrUpdateParams(generic.directLink, {
          minOccupancy: maxGuests,
          checkIn,
          checkOut
        })
      : "",
    airbnbLink: generic.airbnbLink
      ? addOrUpdateParams(generic.airbnbLink, {
          check_in: checkIn,
          check_out: checkOut,
          adults: airbnbGuests
        })
      : "",
    vrboLink: generic.vrboLink
      ? addOrUpdateParams(generic.vrboLink, {
          startDate: checkIn,
          endDate: checkOut,
          adults: maxGuests
        })
      : ""
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
  const generic = buildGenericLinks(property);

  if (specials.length === 1 && specials[0].nights <= 4) {
    return {
      directLink: specials[0].directLink || generic.directLink,
      airbnbLink: specials[0].airbnbLink || generic.airbnbLink,
      vrboLink: specials[0].vrboLink || generic.vrboLink
    };
  }

  return generic;
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

function createPropertyPost(property, specials) {
  const sorted = [...specials].sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const openRange = getOpenRange(sorted);
  const facts = buildFactsLine(property);
  const links = choosePostLinks(property, sorted);

  const airbnbLine = links.airbnbLink
    ? `\nAirbnb:\n${links.airbnbLink}\n`
    : "";

  const vrboLine = links.vrboLink
    ? `\nVRBO:\n${links.vrboLink}\n`
    : "";

  return `LAST MINUTE DEALS IN "${property.location}"

Open availability between ${openRange}

${property.title}
${facts}

Book direct and save up to 20%:
${links.directLink}${airbnbLine}${vrboLine}`;
}

function convertManagedProperty(property) {
  const directBookingUrl =
    property.directBookingUrl ||
    `https://oceanvacationsmb.guestybookings.com/en/properties/${property.listingId}`;

  return {
    id: property.shortId || property.id,
    title: property.title,
    listingId: property.listingId,

    bedrooms: Number(property.bedrooms || 0) || null,
    bathrooms: Number(property.bathrooms || 0) || null,
    sleeps: Number(property.sleeps || 0) || null,
    location: property.city || property.location || "",

    sellingPoints: normalizeSellingPoints(property.sellingPoints, property.sleeps),

    photoUrl: property.picture || property.photoUrl || "",

    directBookingUrl,
    airbnbUrl: property.airbnbUrl || "",
    vrboUrl: property.vrboUrl || "",

    minNights: 1,
    maxNights: 30,
    scanDays: Number(property.scanDays ?? 15),

    active: property.active === true
  };
}

async function scanProperty(property, scanFromYmd, scanToYmd) {
  const calendar = await getListingCalendar(
    property.listingId,
    scanFromYmd,
    scanToYmd
  );

  const maxScanNights = Math.max(1, diffDays(scanFromYmd, scanToYmd));
  const gaps = findAvailableGaps(calendar, 1, maxScanNights);

  const specials = gaps.map((gap) => {
    const useExactLinks = gap.nights <= 4;
    const links = useExactLinks
      ? buildDatedLinks(property, gap.checkIn, gap.checkOut)
      : buildGenericLinks(property);

    return {
      ok: true,
      propertyId: property.id,
      propertyTitle: property.title,
      listingId: property.listingId,

      location: property.location,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      sleeps: property.sleeps,
      sellingPoints: property.sellingPoints || [],

      photoUrl: property.photoUrl || "",

      checkIn: gap.checkIn,
      checkOut: gap.checkOut,
      checkInNice: niceDate(gap.checkIn),
      checkOutNice: niceDate(gap.checkOut),
      nights: gap.nights,

      directLink: links.directLink,
      airbnbLink: links.airbnbLink,
      vrboLink: links.vrboLink,

      directBookingUrl: property.directBookingUrl || "",
      airbnbUrl: property.airbnbUrl || "",
      vrboUrl: property.vrboUrl || ""
    };
  });

  const postLinks = choosePostLinks(property, specials);

  const propertyPost =
    specials.length > 0
      ? {
          ok: true,
          propertyId: property.id,
          propertyTitle: property.title,
          listingId: property.listingId,
          location: property.location,
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms,
          sleeps: property.sleeps,
          sellingPoints: property.sellingPoints || [],
          photoUrl: property.photoUrl || "",

          directBookingUrl: property.directBookingUrl || "",
          airbnbUrl: property.airbnbUrl || "",
          vrboUrl: property.vrboUrl || "",

          postDirectLink: postLinks.directLink,
          postAirbnbLink: postLinks.airbnbLink,
          postVrboLink: postLinks.vrboLink,

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
    listingId: property.listingId,
    scanFrom: scanFromYmd,
    scanTo: scanToYmd,
    gapsFound: gaps.length,
    specials,
    propertyPost
  };
}

export async function generateSpecials(selectedPropertyIds = [], options = {}) {
  const today = new Date();
  const todayYmd = toYmd(today);

  const scanFromYmd = options.scanFrom || todayYmd;
  const scanToYmd = options.scanTo || toYmd(addDays(today, 15));

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
      const result = await scanProperty(property, scanFromYmd, scanToYmd);

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
      from: scanFromYmd,
      to: scanToYmd,
      propertiesScanned: activeProperties.length,
      specialsCreated: allSpecials.length,
      propertyPostsCreated: propertyPosts.length
    },
    propertyResults,
    specials: allSpecials,
    propertyPosts
  };
}

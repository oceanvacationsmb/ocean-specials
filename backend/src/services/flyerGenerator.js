import fs from "fs/promises";

import { uploadFlyerToCloudinary } from "./cloudinaryService.js";
import { createTemplateFlyer } from "./templateFlyerBuilder.js";

function buildDirectBookingUrl(post) {
  return (
    post.postDirectLink ||
    post.directBookingUrl ||
    `https://oceanvacationsmb.guestybookings.com/en/properties/${post.listingId}`
  );
}

function getOpenRange(post) {
  const specials = [...(post.specials || [])].sort((a, b) =>
    a.checkIn.localeCompare(b.checkIn)
  );

  if (!specials.length) {
    return "Contact us for dates";
  }

  if (specials.length === 1) {
    return `${specials[0].checkInNice} to ${specials[0].checkOutNice}`;
  }

  return `${specials[0].checkInNice} to ${specials[specials.length - 1].checkOutNice}`;
}

function getFactsLine(post) {
  const parts = [];

  if (post.bedrooms) parts.push(`${post.bedrooms} Bedrooms`);
  if (post.bathrooms) parts.push(`${post.bathrooms} Bathrooms`);
  if (post.sleeps) parts.push(`Sleeps ${post.sleeps}`);

  return parts.join(" • ");
}

function buildCaption(post, flyerUrl) {
  const openRange = getOpenRange(post);
  const facts = getFactsLine(post);

  const directUrl = buildDirectBookingUrl(post);
  const airbnbUrl = post.postAirbnbLink || post.airbnbUrl || "";
  const vrboUrl = post.postVrboLink || post.vrboUrl || "";

  const airbnbLine = airbnbUrl
    ? `

Airbnb:
${airbnbUrl}`
    : "";

  const vrboLine = vrboUrl
    ? `

VRBO:
${vrboUrl}`
    : "";

  return `${flyerUrl}

LAST MINUTE DEALS IN "${post.location}"

Open availability between ${openRange}

${post.propertyTitle}
${facts}

Book direct and save up to 20%:
${directUrl}${airbnbLine}${vrboLine}`;
}

export async function generateAndUploadFlyer(post, scan) {
  console.log("USING FIXED TEMPLATE FLYER GENERATOR");

  const cleanId = String(post.propertyId || post.listingId || "property")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .toLowerCase();

  const publicId = `${cleanId}-${scan.from}-${scan.to}-${Date.now()}`;

  const { localFilePath } = await createTemplateFlyer(post, scan);

  const uploaded = await uploadFlyerToCloudinary(localFilePath, publicId);

  await fs.unlink(localFilePath).catch(() => {});

  const caption = buildCaption(post, uploaded.url);

  return {
    ok: true,
    flyerUrl: uploaded.url,
    cloudinaryPublicId: uploaded.publicId,
    caption
  };
}

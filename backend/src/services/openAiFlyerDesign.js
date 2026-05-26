import OpenAI from "openai";
import { toFile } from "openai/uploads";
import axios from "axios";
import sharp from "sharp";
import os from "os";
import path from "path";
import fs from "fs/promises";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function getOpenDateRangeText(post) {
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

  if (post.bedrooms) {
    parts.push(`${post.bedrooms} Bedrooms`);
  }

  if (post.bathrooms) {
    parts.push(`${post.bathrooms} Bathrooms`);
  }

  if (post.sleeps) {
    parts.push(`Sleeps ${post.sleeps}`);
  }

  return parts.join(" • ");
}

function monthNameFromDate(dateString) {
  const date = new Date(dateString + "T00:00:00");

  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });
}

function buildCalendarSummary(post, scan) {
  const specials = post.specials || [];

  if (!specials.length) {
    return `
Show one clean monthly calendar.
Do not show any green dates unless dates are truly available.
Past dates should be muted gray.
Unavailable, blocked, or booked dates should be red or muted gray.
`;
  }

  const months = new Set();

  specials.forEach((special) => {
    months.add(monthNameFromDate(special.checkIn));
    months.add(monthNameFromDate(special.checkOut));
  });

  const monthList = Array.from(months).slice(0, 2).join(" and ");

  const ranges = specials
    .slice(0, 10)
    .map((special) => `${special.checkInNice} to ${special.checkOutNice}`)
    .join(", ");

  return `
Show one or two small monthly calendars for ${monthList}.

Calendar color rules:
Only available dates should be green.
Booked dates should be red.
Blocked dates should be red or muted gray.
Unavailable dates should be red or muted gray.
Past dates should be muted light gray.
Do not show past dates as open.
Do not show blocked dates as open.
Do not show unavailable dates as open.
Only these open date windows can be green: ${ranges}.
The scan period is ${scan.from} to ${scan.to}.
`;
}

async function downloadAndConvertReferenceImage(url) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 25000,
    headers: {
      Accept: "image/jpeg,image/png,image/webp,*/*"
    }
  });

  const inputBuffer = Buffer.from(response.data);

  const pngBuffer = await sharp(inputBuffer)
    .rotate()
    .resize({
      width: 1200,
      height: 900,
      fit: "inside",
      withoutEnlargement: true
    })
    .png()
    .toBuffer();

  return pngBuffer;
}

function buildPrompt(post, scan) {
  const openDateRangeText = getOpenDateRangeText(post);
  const factsLine = getFactsLine(post);
  const calendarSummary = buildCalendarSummary(post, scan);

  const sellingPoints = Array.isArray(post.sellingPoints)
    ? post.sellingPoints.filter(Boolean).slice(0, 3).join(" • ")
    : "";

  return `
Create a premium professional vertical vacation rental flyer for Ocean Vacations.

Use the provided property photo as the main visual reference.

VERY IMPORTANT PHOTO RULES:
Use ONE large beautiful hero image from the reference property photo.
Do not make a collage.
Do not make the photo tiny.
Do not awkwardly crop the property.
Show the property image large and beautifully blended into the flyer.
If the image does not fill the full flyer width, use a soft blurred background version of the same image behind it.
Make the photo area look elegant, natural, and high end.

STYLE:
Luxury coastal vacation rental flyer.
Premium real estate marketing style.
Elegant, polished, modern, and expensive looking.
Use navy, teal, cream, white, and subtle gold accents.
Clean spacing.
Beautiful typography.
No clutter.
No overlapping text.
No cheap template look.
Facebook ready.
Balanced vertical flyer.

TEXT TO INCLUDE:
LAST MINUTE DEALS

LAST MINUTE DEALS IN "${post.location || ""}"

Open availability between ${openDateRangeText}

Property title:
"${post.propertyTitle || ""}"

Property facts:
"${factsLine}"

Feature line:
"${sellingPoints}"

Badge text:
"Book direct and SAVE UP TO 20%"

Open dates box title:
"OPEN DATES"

Open dates box value:
"${openDateRangeText}"

Small buttons or footer labels:
"DIRECT BOOKING"
"AIRBNB"
"VRBO"

Footer:
"oceanvacationsmb.com"

Small note:
"Availability subject to change"

CALENDAR:
${calendarSummary}

RULES:
Keep the property title exactly as given.
Do not replace the property title with the short ID.
The short ID can appear only as a small badge if needed.
Do not place long URLs inside the flyer.
Do not make a busy collage.
Do not make the image small.
Make the flyer much more professional than a basic SVG template.
`;
}

export async function createAiFlyer(post, scan) {
  console.log("STARTING OPENAI IMAGE FLYER");
  console.log("OPENAI_IMAGE_MODEL:", process.env.OPENAI_IMAGE_MODEL || "gpt-image-1-mini");
  console.log("OPENAI_IMAGE_QUALITY:", process.env.OPENAI_IMAGE_QUALITY || "low");
  console.log("PROPERTY PHOTO URL:", post.photoUrl);

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  if (!post.photoUrl) {
    throw new Error("Property photoUrl is missing");
  }

  const tempOutputPath = path.join(
    os.tmpdir(),
    `ai-flyer-${Date.now()}.png`
  );

  const pngBuffer = await downloadAndConvertReferenceImage(post.photoUrl);

  const imageFile = await toFile(
    pngBuffer,
    "property-reference.png",
    {
      type: "image/png"
    }
  );

  const prompt = buildPrompt(post, scan);

  const result = await openai.images.edit({
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1-mini",
    image: imageFile,
    prompt,
    size: "1024x1536",
    quality: process.env.OPENAI_IMAGE_QUALITY || "low"
  });

  const b64 = result?.data?.[0]?.b64_json;

  if (!b64) {
    throw new Error("OpenAI did not return image data");
  }

  const imageBuffer = Buffer.from(b64, "base64");

  await fs.writeFile(tempOutputPath, imageBuffer);

  console.log("OPENAI IMAGE FLYER CREATED");

  return {
    localFilePath: tempOutputPath
  };
}

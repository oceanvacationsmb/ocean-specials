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
    return "No open dates found.";
  }

  const months = new Set();

  specials.forEach((special) => {
    months.add(monthNameFromDate(special.checkIn));
    months.add(monthNameFromDate(special.checkOut));
  });

  const monthList = Array.from(months).slice(0, 2).join(" and ");

  const ranges = specials
    .slice(0, 8)
    .map((special) => `${special.checkInNice} to ${special.checkOutNice}`)
    .join(", ");

  return `Show up to two small monthly calendars for ${monthList}. Highlight open dates in green and booked dates in red. The open date windows are: ${ranges}. The scan period starts ${scan.from} and ends ${scan.to}.`;
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
      width: 1400,
      height: 1000,
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

  return `
Create a premium professional vertical vacation rental flyer for Ocean Vacations.

Use the provided property photo as the main visual reference.

Important photo instructions:
Use one large beautiful hero image.
Do not make the property image tiny.
Do not make a busy collage.
Do not awkwardly crop the property.
Show the property image large and blended nicely into the flyer.
If the image does not fill the space, use a soft blurred background version of the same image behind it.
Make the flyer look like a high end beach rental advertisement.

Style:
Luxury coastal vacation rental flyer
Premium real estate marketing style
Elegant typography
Navy, teal, cream, white, and gold colors
Clean spacing
No clutter
No overlapping text
Facebook ready
Professional designer look

Required flyer text:
LAST MINUTE DEALS

LAST MINUTE DEALS IN "${post.location || ""}"

Open availability between ${openDateRangeText}

${post.propertyTitle || ""}

${factsLine}

Book direct and SAVE UP TO 20%

OPEN DATES
${openDateRangeText}

DIRECT BOOKING
AIRBNB
VRBO

oceanvacationsmb.com

Availability subject to change

Calendar requirement:
${calendarSummary}

Important:
Keep the property title exactly as given.
Do not replace the property title with the short ID.
Do not use nickname text like NMB - 3104-3 as the title.
The short property ID may be used only as a small badge.
Make the design beautiful, polished, premium, and balanced.
`;
}

export async function createAiFlyer(post, scan) {
  console.log("STARTING OPENAI IMAGE FLYER");

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
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
    image: imageFile,
    prompt,
    size: "1024x1536"
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

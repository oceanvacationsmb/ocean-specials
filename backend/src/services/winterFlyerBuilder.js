import axios from "axios";
import os from "os";
import path from "path";
import sharp from "sharp";

const WIDTH = 1080;
const HEIGHT = 1350;
const PHOTO_HEIGHT = 700;

const COLORS = {
  navy: "#062f53",
  teal: "#0f8f9f",
  tealDark: "#08727f",
  gold: "#d9b35f",
  white: "#ffffff",
  ice: "#eef7f8",
  text: "#16324a",
  muted: "#52616f"
};

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function wrapText(text, maxCharsPerLine = 32, maxLines = 2) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length <= maxCharsPerLine) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
    }

    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines.slice(0, maxLines);
}

function buildFactsLine(flyer) {
  const parts = [];

  if (flyer.bedrooms) parts.push(`${flyer.bedrooms} Bedrooms`);
  if (flyer.bathrooms) parts.push(`${flyer.bathrooms} Bathrooms`);
  if (flyer.sleeps) parts.push(`Sleeps ${flyer.sleeps}`);

  return parts.join("  |  ");
}

function buildHighlightsSvg(highlights) {
  return highlights
    .slice(0, 6)
    .map((highlight, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = 90 + column * 465;
      const y = 1080 + row * 52;

      return `
        <circle cx="${x}" cy="${y - 7}" r="8" fill="${COLORS.gold}" />
        <path d="M${x - 4} ${y - 7} L${x - 1} ${y - 3} L${x + 6} ${y - 12}" stroke="${COLORS.navy}" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        <text x="${x + 22}" y="${y}" font-size="23" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="700">${escapeXml(highlight)}</text>
      `;
    })
    .join("");
}

function buildOverlaySvg(flyer) {
  const titleLines = wrapText(flyer.title, 33, 2);
  const factsLine = buildFactsLine(flyer);
  const highlightsSvg = buildHighlightsSvg(flyer.highlights || []);

  return `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="photo-shade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="${COLORS.navy}" stop-opacity="0.10" />
          <stop offset="100%" stop-color="${COLORS.navy}" stop-opacity="0.82" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="${WIDTH}" height="${PHOTO_HEIGHT}" fill="url(#photo-shade)" />
      <rect x="0" y="${PHOTO_HEIGHT}" width="${WIDTH}" height="${HEIGHT - PHOTO_HEIGHT}" fill="${COLORS.ice}" />

      <rect x="38" y="36" width="290" height="76" rx="8" fill="${COLORS.navy}" fill-opacity="0.96" />
      <text x="183" y="70" font-size="27" font-family="Georgia, serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">OCEAN</text>
      <text x="183" y="96" font-size="16" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.gold}" text-anchor="middle" font-weight="900">VACATIONS</text>

      <rect x="804" y="36" width="238" height="76" rx="8" fill="${COLORS.gold}" fill-opacity="0.97" />
      <text x="923" y="68" font-size="16" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.navy}" text-anchor="middle" font-weight="900">PROPERTY ID</text>
      <text x="923" y="99" font-size="25" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.navy}" text-anchor="middle" font-weight="900">${escapeXml(flyer.propertyId)}</text>

      <text x="60" y="492" font-size="36" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.gold}" font-weight="900">${escapeXml(flyer.location.toUpperCase())}</text>
      <text x="60" y="557" font-size="73" font-family="Georgia, serif" fill="${COLORS.white}" font-weight="900">WINTER SPECIAL</text>
      <text x="62" y="616" font-size="39" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" font-weight="900">BOOK NOW AND SAVE!</text>
      <line x1="62" y1="644" x2="558" y2="644" stroke="${COLORS.gold}" stroke-width="5" />

      <rect x="54" y="742" width="972" height="114" rx="10" fill="${COLORS.navy}" />
      <text x="540" y="790" font-size="25" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.gold}" text-anchor="middle" font-weight="900">MONTHLY RENTAL</text>
      <text x="540" y="837" font-size="48" font-family="Georgia, serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">${escapeXml(flyer.monthlyRate)}/MONTH</text>

      ${titleLines.map((line, index) => `
        <text x="540" y="${915 + index * 36}" font-size="29" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" text-anchor="middle" font-weight="900">${escapeXml(line)}</text>
      `).join("")}

      <text x="540" y="1008" font-size="26" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.tealDark}" text-anchor="middle" font-weight="900">${escapeXml(factsLine)}</text>
      <line x1="60" y1="1037" x2="1020" y2="1037" stroke="${COLORS.gold}" stroke-width="3" />

      ${highlightsSvg}

      <rect x="54" y="1250" width="972" height="62" rx="8" fill="${COLORS.teal}" />
      <text x="540" y="1289" font-size="26" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">ALL UTILITIES INCLUDED  |  LINKS IN POST</text>
      <text x="540" y="1334" font-size="20" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.navy}" text-anchor="middle" font-weight="900">oceanvacationsmb.com</text>
    </svg>
  `;
}

async function downloadImageBuffer(url) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 25000,
    headers: {
      Accept: "image/jpeg,image/png,image/webp,*/*"
    }
  });

  return Buffer.from(response.data);
}

export async function createWinterFlyer(flyer) {
  if (!flyer.photoUrl) {
    throw new Error("No property image found for winter flyer");
  }

  const imageBuffer = await downloadImageBuffer(flyer.photoUrl);
  const propertyImage = await sharp(imageBuffer)
    .rotate()
    .resize(WIDTH, PHOTO_HEIGHT, {
      fit: "cover",
      position: "center"
    })
    .jpeg({ quality: 94 })
    .toBuffer();

  const outputPath = path.join(
    os.tmpdir(),
    `winter-flyer-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
  );

  await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: COLORS.ice
    }
  })
    .composite([
      {
        input: propertyImage,
        top: 0,
        left: 0
      },
      {
        input: Buffer.from(buildOverlaySvg(flyer)),
        top: 0,
        left: 0
      }
    ])
    .png()
    .toFile(outputPath);

  return {
    localFilePath: outputPath
  };
}

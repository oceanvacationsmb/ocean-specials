import axios from "axios";
import sharp from "sharp";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const WIDTH = 1080;
const HEIGHT = 1350;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATE_PATH = path.join(
  __dirname,
  "../assets/flyer-template-style.png"
);

const COLORS = {
  bg: "#f8f4ec",
  navy: "#062f53",
  teal: "#158f9f",
  tealLight: "#39aebd",
  gold: "#d7b35f",
  white: "#ffffff",
  cream: "#fffaf0",
  text: "#16324a",
  muted: "#e8edf0",
  red: "#e75d4f",
  green: "#5ca84a",
  grayText: "#7b8790",
  border: "#d8d4c8"
};

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);

  return formatDateKey(date);
}

function enumerateDates(startDate, endDateExclusive) {
  const dates = [];
  let current = startDate;

  while (current < endDateExclusive) {
    dates.push(current);
    current = addDays(current, 1);
  }

  return dates;
}

function getOpenSet(post) {
  const set = new Set();

  for (const special of post.specials || []) {
    for (const date of enumerateDates(special.checkIn, special.checkOut)) {
      set.add(date);
    }
  }

  return set;
}

function getSortedSpecials(post) {
  return [...(post.specials || [])].sort((a, b) =>
    a.checkIn.localeCompare(b.checkIn)
  );
}

function getOpenDateRangeText(post) {
  const specials = getSortedSpecials(post);

  if (!specials.length) {
    return "Contact us for dates";
  }

  if (specials.length === 1) {
    return `${specials[0].checkInNice} to ${specials[0].checkOutNice}`;
  }

  return `${specials[0].checkInNice} to ${specials[specials.length - 1].checkOutNice}`;
}

function getOpenRanges(post, limit = 4) {
  const specials = getSortedSpecials(post);

  return specials
    .slice(0, limit)
    .map((special) => `${special.checkInNice} to ${special.checkOutNice}`);
}

function wrapText(text, maxCharsPerLine = 32, maxLines = 2) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;

    if (test.length <= maxCharsPerLine) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.slice(0, maxLines);
}

function getMainPhotoUrl(post) {
  if (post.photoUrl) return post.photoUrl;

  if (Array.isArray(post.photoUrls) && post.photoUrls[0]) {
    return post.photoUrls[0];
  }

  if (Array.isArray(post.pictures) && post.pictures[0]) {
    return post.pictures[0];
  }

  throw new Error("No property image found for flyer");
}

function getFeatureTitle(post) {
  const text = `${post.propertyTitle || ""} ${(post.sellingPoints || []).join(" ")}`.toLowerCase();

  if (text.includes("oceanfront")) return "DIRECT OCEANFRONT";
  if (text.includes("private pool")) return "PRIVATE POOL";
  if (text.includes("pool")) return "POOL ACCESS";
  if (text.includes("walk")) return "WALK TO BEACH";

  return "BEACH VACATION";
}

function getFactsLine(post) {
  const parts = [];

  if (post.bedrooms) parts.push(`${post.bedrooms}BR`);
  if (post.bathrooms) parts.push(`${post.bathrooms}BA`);
  if (post.sleeps) parts.push(`Sleeps ${post.sleeps}`);

  return parts.join(" • ");
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

async function makeTopPropertyImage(url) {
  const buffer = await downloadImageBuffer(url);

  return sharp(buffer)
    .rotate()
    .resize(WIDTH, 505, {
      fit: "cover",
      position: "center"
    })
    .jpeg({ quality: 94 })
    .toBuffer();
}

function getCalendarMonth(post, scan) {
  const specials = getSortedSpecials(post);
  const sourceDate = specials[0]?.checkIn || scan.from;

  const date = new Date(`${sourceDate}T00:00:00`);

  return {
    year: date.getFullYear(),
    month: date.getMonth()
  };
}

function buildCalendarSvg(year, month, openSet, scanFrom, scanTo) {
  const width = 360;
  const height = 210;
  const cellW = 39;
  const cellH = 25;
  const startX = 27;
  const startY = 72;

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weekdayOffset = firstDay.getDay();

  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });

  const todayKey = formatDateKey(new Date());

  const dayNames = ["S", "M", "T", "W", "T", "F", "S"];

  const dayNameSvg = dayNames
    .map((day, index) => {
      const x = startX + index * 44 + 19;

      return `
        <text x="${x}" y="58" font-size="13" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" text-anchor="middle" font-weight="900">${day}</text>
      `;
    })
    .join("");

  let cellsSvg = "";

  for (let day = 1; day <= daysInMonth; day++) {
    const index = weekdayOffset + day - 1;
    const row = Math.floor(index / 7);
    const col = index % 7;

    const x = startX + col * 44;
    const y = startY + row * 28;

    const dateKey = formatDateKey(new Date(year, month, day));

    let fill = COLORS.muted;
    let textFill = COLORS.grayText;

    if (dateKey >= scanFrom && dateKey < scanTo && dateKey >= todayKey) {
      if (openSet.has(dateKey)) {
        fill = COLORS.green;
        textFill = COLORS.white;
      } else {
        fill = COLORS.red;
        textFill = COLORS.white;
      }
    }

    cellsSvg += `
      <rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="6" fill="${fill}" />
      <text x="${x + cellW / 2}" y="${y + 18}" font-size="13" font-family="Arial, Helvetica, sans-serif" fill="${textFill}" text-anchor="middle" font-weight="900">${day}</text>
    `;
  }

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" rx="14" fill="${COLORS.white}" stroke="${COLORS.border}" stroke-width="1.5" />
      <rect x="0" y="0" width="${width}" height="42" rx="14" fill="${COLORS.teal}" />
      <rect x="0" y="28" width="${width}" height="14" fill="${COLORS.teal}" />
      <text x="${width / 2}" y="28" font-size="16" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">${escapeXml(monthLabel.toUpperCase())}</text>
      ${dayNameSvg}
      ${cellsSvg}
    </svg>
  `;
}

function buildOpenDatesSvg(ranges) {
  const items = ranges.length ? ranges : ["Contact us for dates"];

  const itemSvg = items
    .slice(0, 4)
    .map((item, index) => {
      const y = 66 + index * 34;

      return `
        <circle cx="24" cy="${y - 7}" r="8" fill="${COLORS.teal}" />
        <path d="M20 ${y - 7} L23 ${y - 3} L29 ${y - 11}" stroke="${COLORS.white}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        <text x="46" y="${y}" font-size="22" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="900">${escapeXml(item)}</text>
      `;
    })
    .join("");

  return `
    <svg width="285" height="210" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="285" height="210" rx="14" fill="${COLORS.white}" stroke="${COLORS.border}" stroke-width="1.5" />
      <rect x="0" y="0" width="285" height="42" rx="14" fill="${COLORS.teal}" />
      <rect x="0" y="28" width="285" height="14" fill="${COLORS.teal}" />
      <text x="142" y="28" font-size="17" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">OPEN DATES</text>
      ${itemSvg}
    </svg>
  `;
}

function buildDynamicOverlaySvg(post) {
  const propertyId = post.propertyId || post.shortId || "";
  const location = post.location || "";
  const featureTitle = getFeatureTitle(post);
  const factsLine = getFactsLine(post);
  const openRangeText = getOpenDateRangeText(post);
  const titleLines = wrapText(post.propertyTitle || "", 31, 2);

  const titleSvg = titleLines
    .map((line, index) => {
      return `
        <text x="610" y="${800 + index * 34}" font-size="30" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">${escapeXml(line)}</text>
      `;
    })
    .join("");

  return `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="none" />

      <path d="M35 5 L200 5 L200 190 L118 155 L35 190 Z" fill="${COLORS.navy}" />
      <path d="M47 13 L188 13 L188 168 L118 140 L47 168 Z" fill="none" stroke="${COLORS.gold}" stroke-width="2" stroke-dasharray="6 5" />
      <text x="117" y="82" font-size="17" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.gold}" text-anchor="middle" font-weight="900">PROPERTY ID</text>
      <line x1="65" y1="122" x2="170" y2="122" stroke="${COLORS.white}" stroke-width="2" opacity="0.8"/>
      <text x="117" y="158" font-size="31" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">${escapeXml(propertyId)}</text>

      <circle cx="540" cy="105" r="82" fill="${COLORS.white}" stroke="${COLORS.navy}" stroke-width="3" opacity="0.98" />
      <text x="540" y="92" font-size="33" font-family="Georgia, serif" fill="${COLORS.navy}" text-anchor="middle" font-weight="900">OCEAN</text>
      <path d="M485 115 C510 93, 538 95, 565 116 C586 100, 610 109, 626 129" fill="none" stroke="${COLORS.teal}" stroke-width="5"/>
      <text x="540" y="143" font-size="15" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" text-anchor="middle" letter-spacing="3" font-weight="900">VACATIONS</text>
      <text x="540" y="165" font-size="9" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.navy}" text-anchor="middle" letter-spacing="1">UNFORGETTABLE GETAWAYS</text>

      <rect x="115" y="555" width="340" height="38" fill="${COLORS.bg}" opacity="0.98" />
      <text x="285" y="584" font-size="28" font-family="Georgia, serif" fill="${COLORS.teal}" text-anchor="middle" font-style="italic">${escapeXml(location)}</text>

      <rect x="610" y="740" width="400" height="56" rx="5" fill="${COLORS.navy}" />
      <rect x="610" y="795" width="400" height="52" rx="5" fill="${COLORS.teal}" />
      ${titleSvg}

      <rect x="610" y="690" width="400" height="46" rx="8" fill="${COLORS.navy}" />
      <text x="810" y="721" font-size="19" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">${escapeXml(featureTitle)}</text>

      <rect x="610" y="845" width="400" height="40" rx="8" fill="${COLORS.tealLight}" />
      <text x="810" y="872" font-size="20" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">${escapeXml(factsLine)}</text>

      <rect x="600" y="880" width="430" height="120" fill="${COLORS.bg}" opacity="0.96" />

      <g transform="translate(620 895)">
        <circle cx="30" cy="30" r="27" fill="${COLORS.white}" stroke="${COLORS.navy}" stroke-width="2"/>
        <text x="30" y="38" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" text-anchor="middle" font-weight="900">${escapeXml(post.bedrooms || "-")}</text>
        <text x="67" y="28" font-size="16" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="900">Bedrooms</text>

        <circle cx="230" cy="30" r="27" fill="${COLORS.white}" stroke="${COLORS.navy}" stroke-width="2"/>
        <text x="230" y="38" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" text-anchor="middle" font-weight="900">${escapeXml(post.sleeps || "-")}</text>
        <text x="267" y="28" font-size="16" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="900">Sleeps</text>

        <circle cx="30" cy="85" r="27" fill="${COLORS.white}" stroke="${COLORS.navy}" stroke-width="2"/>
        <text x="30" y="93" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" text-anchor="middle" font-weight="900">${escapeXml(post.bathrooms || "-")}</text>
        <text x="67" y="83" font-size="16" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="900">Bathrooms</text>

        <circle cx="230" cy="85" r="27" fill="${COLORS.white}" stroke="${COLORS.navy}" stroke-width="2"/>
        <text x="230" y="93" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" text-anchor="middle" font-weight="900">${escapeXml(post.sleeps || "-")}</text>
        <text x="267" y="83" font-size="16" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="900">Sleeps</text>
      </g>

      <rect x="610" y="1000" width="395" height="38" fill="${COLORS.bg}" opacity="0.97" />
      <text x="610" y="1025" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" font-weight="900">Open availability:</text>
      <text x="760" y="1025" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="900">${escapeXml(openRangeText)}</text>
    </svg>
  `;
}

export async function createTemplateFlyer(post, scan) {
  console.log("STARTING REAL TEMPLATE FLYER");
  console.log("TEMPLATE PATH:", TEMPLATE_PATH);
  console.log("PROPERTY PHOTO URL:", post.photoUrl);

  const openSet = getOpenSet(post);
  const openRanges = getOpenRanges(post, 4);
  const calendarMonth = getCalendarMonth(post, scan);

  const mainPhotoUrl = getMainPhotoUrl(post);

  const templateImage = await sharp(TEMPLATE_PATH)
    .resize(WIDTH, HEIGHT, {
      fit: "cover",
      position: "center"
    })
    .png()
    .toBuffer();

  const topPropertyImage = await makeTopPropertyImage(mainPhotoUrl);

  const dynamicOverlaySvg = buildDynamicOverlaySvg(post);
  const calendarSvg = buildCalendarSvg(
    calendarMonth.year,
    calendarMonth.month,
    openSet,
    scan.from,
    scan.to
  );

  const openDatesSvg = buildOpenDatesSvg(openRanges);

  const outputPath = path.join(os.tmpdir(), `real-template-flyer-${Date.now()}.png`);

  await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: COLORS.bg
    }
  })
    .composite([
      {
        input: templateImage,
        top: 0,
        left: 0
      },
      {
        input: topPropertyImage,
        top: 0,
        left: 0
      },
      {
        input: Buffer.from(dynamicOverlaySvg),
        top: 0,
        left: 0
      },
      {
        input: Buffer.from(calendarSvg),
        top: 1000,
        left: 50
      },
      {
        input: Buffer.from(openDatesSvg),
        top: 1000,
        left: 425
      }
    ])
    .png()
    .toFile(outputPath);

  console.log("REAL TEMPLATE FLYER CREATED");

  return {
    localFilePath: outputPath
  };
}

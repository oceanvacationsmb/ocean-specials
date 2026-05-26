import axios from "axios";
import sharp from "sharp";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const WIDTH = 1080;
const HEIGHT = 1350;

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

function getOpenRanges(post, limit = 4) {
  const specials = [...(post.specials || [])].sort((a, b) =>
    a.checkIn.localeCompare(b.checkIn)
  );

  return specials
    .slice(0, limit)
    .map((special) => `${special.checkInNice} to ${special.checkOutNice}`);
}

function wrapText(text, maxCharsPerLine = 31, maxLines = 2) {
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

async function makeMainCollageImage(url) {
  const buffer = await downloadImageBuffer(url);

  return sharp(buffer)
    .rotate()
    .resize(1020, 420, {
      fit: "cover",
      position: "center"
    })
    .jpeg({ quality: 94 })
    .toBuffer();
}

function buildMonthObjects(scan) {
  const start = new Date(`${scan.from}T00:00:00`);
  const month1 = new Date(start.getFullYear(), start.getMonth(), 1);
  const month2 = new Date(start.getFullYear(), start.getMonth() + 1, 1);

  return [
    {
      year: month1.getFullYear(),
      month: month1.getMonth()
    },
    {
      year: month2.getFullYear(),
      month: month2.getMonth()
    }
  ];
}

function buildCalendarSvg(year, month, openSet, scanFrom, scanTo) {
  const width = 295;
  const height = 185;
  const cellW = 32;
  const cellH = 22;
  const startX = 18;
  const startY = 62;

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
      const x = startX + index * 37 + 16;

      return `
        <text x="${x}" y="50" font-size="12" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" text-anchor="middle" font-weight="800">${day}</text>
      `;
    })
    .join("");

  let cellsSvg = "";

  for (let day = 1; day <= daysInMonth; day++) {
    const index = weekdayOffset + day - 1;
    const row = Math.floor(index / 7);
    const col = index % 7;

    const x = startX + col * 37;
    const y = startY + row * 24;

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
      <rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="5" fill="${fill}" />
      <text x="${x + cellW / 2}" y="${y + 16}" font-size="12" font-family="Arial, Helvetica, sans-serif" fill="${textFill}" text-anchor="middle" font-weight="800">${day}</text>
    `;
  }

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" rx="14" fill="${COLORS.white}" stroke="${COLORS.border}" stroke-width="1.5" />
      <rect x="0" y="0" width="${width}" height="36" rx="14" fill="${COLORS.teal}" />
      <rect x="0" y="24" width="${width}" height="14" fill="${COLORS.teal}" />
      <text x="${width / 2}" y="24" font-size="15" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">${escapeXml(monthLabel.toUpperCase())}</text>
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
      const y = 60 + index * 32;

      return `
        <circle cx="22" cy="${y - 6}" r="8" fill="${COLORS.teal}" />
        <path d="M18 ${y - 6} L21 ${y - 2} L27 ${y - 10}" stroke="${COLORS.white}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        <text x="42" y="${y}" font-size="21" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="900">${escapeXml(item)}</text>
      `;
    })
    .join("");

  return `
    <svg width="275" height="185" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="275" height="185" rx="14" fill="${COLORS.white}" stroke="${COLORS.border}" stroke-width="1.5" />
      <rect x="0" y="0" width="275" height="36" rx="14" fill="${COLORS.teal}" />
      <rect x="0" y="24" width="275" height="14" fill="${COLORS.teal}" />
      <text x="138" y="24" font-size="16" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">OPEN DATES</text>
      ${itemSvg}
    </svg>
  `;
}

function buildCtaSvg() {
  return `
    <svg width="275" height="185" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="8" width="263" height="169" rx="28" fill="${COLORS.white}" stroke="${COLORS.gold}" stroke-width="4" />
      <text x="138" y="66" font-size="28" font-family="Georgia, serif" fill="${COLORS.navy}" text-anchor="middle" font-style="italic">Book Direct &amp;</text>
      <text x="138" y="100" font-size="25" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" text-anchor="middle" font-weight="900">SAVE UP TO</text>
      <text x="138" y="153" font-size="70" font-family="Georgia, serif" fill="${COLORS.teal}" text-anchor="middle" font-weight="900">20%</text>
    </svg>
  `;
}

function buildButtonSvg(label) {
  return `
    <svg width="290" height="62" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="290" height="62" rx="12" fill="${COLORS.navy}" />
      <rect x="2.5" y="2.5" width="285" height="57" rx="10" fill="none" stroke="${COLORS.gold}" stroke-width="3" />
      <text x="145" y="40" font-size="23" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">${escapeXml(label)}</text>
    </svg>
  `;
}

function buildMainOverlaySvg(post, openRangeText) {
  const propertyId = post.propertyId || post.shortId || "";
  const location = post.location || "";
  const featureTitle = getFeatureTitle(post);
  const factsLine = getFactsLine(post);
  const titleLines = wrapText(post.propertyTitle || "", 32, 2);

  const titleSvg = titleLines
    .map((line, index) => {
      return `
        <text x="610" y="${675 + index * 34}" font-size="30" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="900">${escapeXml(line)}</text>
      `;
    })
    .join("");

  return `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="${COLORS.bg}" />

      <rect x="30" y="28" width="1020" height="430" rx="24" fill="${COLORS.white}" />
      <rect x="30" y="28" width="1020" height="430" rx="24" fill="none" stroke="#d7d7d7" stroke-width="2" />

      <path d="M0 470 C 220 515, 420 450, 640 485 C 840 515, 980 475, 1080 495" fill="none" stroke="${COLORS.tealLight}" stroke-width="6" opacity="0.9"/>

      <path d="M36 34 L132 34 L132 150 L84 128 L36 150 Z" fill="${COLORS.navy}" />
      <text x="84" y="62" font-size="14" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.gold}" text-anchor="middle" font-weight="900">PROPERTY ID</text>
      <text x="84" y="111" font-size="30" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">${escapeXml(propertyId)}</text>

      <circle cx="540" cy="125" r="70" fill="${COLORS.white}" stroke="#c5ccd3" stroke-width="3" />
      <text x="540" y="106" font-size="21" font-family="Georgia, serif" fill="${COLORS.navy}" text-anchor="middle" font-weight="900">OCEAN</text>
      <path d="M496 128 C516 108, 545 108, 565 128 C580 116, 600 121, 610 139" fill="none" stroke="${COLORS.teal}" stroke-width="4"/>
      <text x="540" y="160" font-size="14" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" text-anchor="middle" letter-spacing="2" font-weight="900">VACATIONS</text>

      <text x="64" y="550" font-size="28" font-family="Georgia, serif" fill="${COLORS.teal}" font-style="italic">${escapeXml(location)}</text>
      <text x="64" y="622" font-size="84" font-family="Georgia, serif" fill="${COLORS.navy}" font-weight="900">OPEN</text>
      <text x="64" y="690" font-size="66" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.navy}" font-weight="900">AVAILABILITY</text>
      <text x="64" y="758" font-size="62" font-family="Georgia, serif" fill="${COLORS.teal}" font-style="italic">SPECIALS</text>
      <line x1="64" y1="780" x2="350" y2="780" stroke="${COLORS.gold}" stroke-width="4" />
      <text x="358" y="790" font-size="45" font-family="Georgia, serif" fill="${COLORS.gold}">✶</text>

      <rect x="610" y="550" width="395" height="46" rx="7" fill="${COLORS.navy}" />
      <text x="808" y="581" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">${escapeXml(featureTitle)}</text>

      <rect x="610" y="607" width="395" height="42" rx="7" fill="${COLORS.tealLight}" />
      <text x="808" y="635" font-size="19" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">${escapeXml(factsLine)}</text>

      ${titleSvg}

      <g transform="translate(610 755)">
        <circle cx="31" cy="31" r="28" fill="${COLORS.white}" stroke="${COLORS.teal}" stroke-width="2"/>
        <text x="31" y="39" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" text-anchor="middle" font-weight="900">${escapeXml(post.bedrooms || "-")}</text>
        <text x="68" y="27" font-size="16" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="900">Bedrooms</text>

        <circle cx="185" cy="31" r="28" fill="${COLORS.white}" stroke="${COLORS.teal}" stroke-width="2"/>
        <text x="185" y="39" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" text-anchor="middle" font-weight="900">${escapeXml(post.bathrooms || "-")}</text>
        <text x="222" y="27" font-size="16" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="900">Bathrooms</text>

        <circle cx="345" cy="31" r="28" fill="${COLORS.white}" stroke="${COLORS.teal}" stroke-width="2"/>
        <text x="345" y="39" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" text-anchor="middle" font-weight="900">${escapeXml(post.sleeps || "-")}</text>
        <text x="382" y="27" font-size="16" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="900">Sleeps</text>
      </g>

      <text x="610" y="850" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" font-weight="900">Open availability:</text>
      <text x="610" y="878" font-size="20" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="900">${escapeXml(openRangeText)}</text>

      <text x="70" y="1310" font-size="22" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.navy}" font-weight="900">oceanvacationsmb.com</text>
      <text x="415" y="1310" font-size="18" font-family="Georgia, serif" fill="${COLORS.text}" font-style="italic">Links in caption.</text>
      <text x="800" y="1310" font-size="16" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.grayText}">Availability subject to change</text>
    </svg>
  `;
}

export async function createTemplateFlyer(post, scan) {
  console.log("STARTING EXACT STYLE TEMPLATE FLYER");
  console.log("PROPERTY PHOTO URL:", post.photoUrl);

  const openRangeText = getOpenDateRangeText(post);
  const openRanges = getOpenRanges(post, 4);
  const openSet = getOpenSet(post);

  const [month1, month2] = buildMonthObjects(scan);
  const mainPhotoUrl = getMainPhotoUrl(post);
  const mainPhoto = await makeMainCollageImage(mainPhotoUrl);

  const overlaySvg = buildMainOverlaySvg(post, openRangeText);
  const month1Svg = buildCalendarSvg(month1.year, month1.month, openSet, scan.from, scan.to);
  const month2Svg = buildCalendarSvg(month2.year, month2.month, openSet, scan.from, scan.to);
  const openDatesSvg = buildOpenDatesSvg(openRanges);
  const ctaSvg = buildCtaSvg();
  const directButtonSvg = buildButtonSvg("DIRECT BOOKING");
  const airbnbButtonSvg = buildButtonSvg("AIRBNB");
  const vrboButtonSvg = buildButtonSvg("VRBO");

  const outputPath = path.join(os.tmpdir(), `template-flyer-${Date.now()}.png`);

  await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: COLORS.bg
    }
  })
    .composite([
      { input: Buffer.from(overlaySvg), top: 0, left: 0 },
      { input: mainPhoto, top: 40, left: 40 },

      { input: Buffer.from(month1Svg), top: 940, left: 40 },
      { input: Buffer.from(month2Svg), top: 940, left: 350 },
      { input: Buffer.from(openDatesSvg), top: 940, left: 660 },
      { input: Buffer.from(ctaSvg), top: 940, left: 825 },

      { input: Buffer.from(directButtonSvg), top: 1230, left: 40 },
      { input: Buffer.from(airbnbButtonSvg), top: 1230, left: 395 },
      { input: Buffer.from(vrboButtonSvg), top: 1230, left: 750 }
    ])
    .png()
    .toFile(outputPath);

  console.log("EXACT STYLE TEMPLATE FLYER CREATED");

  return {
    localFilePath: outputPath
  };
}

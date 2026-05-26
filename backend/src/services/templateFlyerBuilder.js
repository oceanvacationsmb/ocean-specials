import axios from "axios";
import sharp from "sharp";
import os from "os";
import path from "path";
import fs from "fs/promises";

const WIDTH = 1080;
const HEIGHT = 1350;

const COLORS = {
  bg: "#f7f3ec",
  navy: "#083a6b",
  teal: "#2ca9bc",
  tealDark: "#1f8b9d",
  gold: "#d9b45c",
  lightBlue: "#dff4fb",
  line: "#d8d0c2",
  open: "#5bbd66",
  closed: "#eb6a5c",
  muted: "#e7eaee",
  text: "#17324a",
  white: "#ffffff"
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

function getFacts(post) {
  return [
    {
      label: "Bedrooms",
      value: post.bedrooms || "-"
    },
    {
      label: "Bathrooms",
      value: post.bathrooms || "-"
    },
    {
      label: "Sleeps",
      value: post.sleeps || "-"
    }
  ];
}

function wrapText(text, maxCharsPerLine = 34) {
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

  if (current) lines.push(current);

  return lines.slice(0, 3);
}

function pickFeatureTitle(post) {
  const points = Array.isArray(post.sellingPoints)
    ? post.sellingPoints.filter(Boolean)
    : [];

  if (points[0]) {
    return String(points[0]).toUpperCase();
  }

  if ((post.propertyTitle || "").toLowerCase().includes("oceanfront")) {
    return "DIRECT OCEANFRONT";
  }

  if ((post.propertyTitle || "").toLowerCase().includes("pool")) {
    return "PRIVATE POOL";
  }

  return "VACATION RENTAL";
}

function getFeatureLine(post) {
  const parts = [];

  if (post.bedrooms) parts.push(`${post.bedrooms}BR`);
  if (post.bathrooms) parts.push(`${post.bathrooms}BA`);
  if (post.sleeps) parts.push(`Sleeps ${post.sleeps}`);

  return parts.join(" • ");
}

function getPhotoUrls(post) {
  const urls = [];

  if (Array.isArray(post.photoUrls)) {
    urls.push(...post.photoUrls);
  }

  if (Array.isArray(post.pictures)) {
    urls.push(...post.pictures);
  }

  if (post.photoUrl) {
    urls.push(post.photoUrl);
  }

  const clean = urls
    .flat()
    .filter(Boolean)
    .map((item) => String(item).trim());

  const unique = [...new Set(clean)];

  if (!unique.length) {
    throw new Error("No property image found for flyer");
  }

  while (unique.length < 4) {
    unique.push(unique[unique.length % Math.max(1, unique.length)]);
  }

  return unique.slice(0, 4);
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

async function makePhotoTile(url, width, height) {
  const buffer = await downloadImageBuffer(url);

  return sharp(buffer)
    .rotate()
    .resize(width, height, {
      fit: "cover",
      position: "center"
    })
    .jpeg({ quality: 90 })
    .toBuffer();
}

function buildMonthObjects(scan) {
  const start = new Date(`${scan.from}T00:00:00`);
  const month1 = new Date(start.getFullYear(), start.getMonth(), 1);
  const month2 = new Date(start.getFullYear(), start.getMonth() + 1, 1);

  return [
    { year: month1.getFullYear(), month: month1.getMonth() },
    { year: month2.getFullYear(), month: month2.getMonth() }
  ];
}

function buildCalendarSvg(year, month, openSet, scanFrom, scanTo) {
  const width = 260;
  const height = 160;
  const headerHeight = 28;
  const cellW = 31;
  const cellH = 20;
  const startX = 14;
  const startY = 54;

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
      const x = startX + index * 34 + 11;
      return `<text x="${x}" y="46" font-size="11" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" text-anchor="middle" font-weight="700">${day}</text>`;
    })
    .join("");

  let cellsSvg = "";

  for (let day = 1; day <= daysInMonth; day++) {
    const index = weekdayOffset + (day - 1);
    const row = Math.floor(index / 7);
    const col = index % 7;
    const x = startX + col * 34;
    const y = startY + row * 23;

    const dateKey = formatDateKey(new Date(year, month, day));

    let fill = COLORS.muted;
    let textFill = COLORS.text;

    if (dateKey < scanFrom || dateKey > scanTo || dateKey < todayKey) {
      fill = COLORS.muted;
      textFill = "#7f8b96";
    } else if (openSet.has(dateKey)) {
      fill = COLORS.open;
      textFill = COLORS.white;
    } else {
      fill = COLORS.closed;
      textFill = COLORS.white;
    }

    cellsSvg += `
      <rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="6" fill="${fill}" />
      <text x="${x + cellW / 2}" y="${y + 14}" font-size="11" font-family="Arial, Helvetica, sans-serif" fill="${textFill}" text-anchor="middle" font-weight="700">${day}</text>
    `;
  }

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" rx="14" fill="${COLORS.white}" stroke="${COLORS.line}" stroke-width="1.5" />
      <rect x="0" y="0" width="${width}" height="${headerHeight}" rx="14" fill="${COLORS.tealDark}" />
      <rect x="0" y="${headerHeight - 10}" width="${width}" height="12" fill="${COLORS.tealDark}" />
      <text x="${width / 2}" y="19" font-size="14" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="700">${escapeXml(monthLabel.toUpperCase())}</text>
      ${dayNameSvg}
      ${cellsSvg}
    </svg>
  `;
}

function buildOpenDatesListSvg(ranges) {
  const items = ranges.length ? ranges : ["Contact us for dates"];

  const itemSvg = items
    .slice(0, 4)
    .map((item, index) => {
      const y = 58 + index * 29;

      return `
        <circle cx="18" cy="${y - 5}" r="7" fill="${COLORS.teal}" />
        <path d="M14 ${y - 5} L17 ${y - 2} L23 ${y - 10}" stroke="${COLORS.white}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        <text x="34" y="${y}" font-size="20" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="700">${escapeXml(item)}</text>
      `;
    })
    .join("");

  return `
    <svg width="250" height="165" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="250" height="165" rx="16" fill="${COLORS.white}" stroke="${COLORS.line}" stroke-width="1.5" />
      <rect x="0" y="0" width="250" height="34" rx="16" fill="${COLORS.tealDark}" />
      <rect x="0" y="24" width="250" height="10" fill="${COLORS.tealDark}" />
      <text x="125" y="22" font-size="15" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="700">OPEN DATES</text>
      ${itemSvg}
    </svg>
  `;
}

function buildCtaSvg() {
  return `
    <svg width="250" height="165" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="234" height="149" rx="28" fill="${COLORS.white}" stroke="${COLORS.gold}" stroke-width="4" />
      <text x="125" y="60" font-size="24" font-family="Georgia, serif" fill="${COLORS.navy}" text-anchor="middle" font-style="italic">Book Direct &amp;</text>
      <text x="125" y="92" font-size="23" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.tealDark}" text-anchor="middle" font-weight="800">SAVE UP TO</text>
      <text x="125" y="138" font-size="62" font-family="Georgia, serif" fill="${COLORS.teal}" text-anchor="middle" font-weight="800">20%</text>
    </svg>
  `;
}

function buildButtonSvg(label) {
  return `
    <svg width="250" height="58" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="250" height="58" rx="14" fill="${COLORS.navy}" />
      <rect x="2.5" y="2.5" width="245" height="53" rx="12" fill="none" stroke="${COLORS.gold}" stroke-width="3" />
      <text x="125" y="37" font-size="22" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="700">${escapeXml(label)}</text>
    </svg>
  `;
}

function buildOverlaySvg(post, openRangeText) {
  const propertyId = post.propertyId || post.shortId || "";
  const location = post.location || "";
  const featureTitle = pickFeatureTitle(post);
  const featureLine = getFeatureLine(post);
  const facts = getFacts(post);
  const titleLines = wrapText(post.propertyTitle || "", 30);

  const titleTspans = titleLines
    .map((line, index) => {
      const dy = index === 0 ? 0 : 28;
      return `<tspan x="610" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join("");

  const factSvg = facts
    .map((fact, index) => {
      const x = 610 + index * 128;

      return `
        <circle cx="${x + 26}" cy="780" r="26" fill="${COLORS.lightBlue}" stroke="${COLORS.tealDark}" stroke-width="2" />
        <text x="${x + 26}" y="788" font-size="16" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.tealDark}" text-anchor="middle" font-weight="800">${escapeXml(String(fact.value))}</text>
        <text x="${x + 60}" y="774" font-size="16" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="800">${escapeXml(fact.label)}</text>
      `;
    })
    .join("");

  return `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="${COLORS.bg}" />

      <rect x="30" y="30" width="1020" height="470" rx="24" fill="${COLORS.white}" />
      <rect x="30" y="30" width="1020" height="470" rx="24" fill="none" stroke="#d8d8d8" stroke-width="2" />

      <path d="M0 505 C220 545, 430 470, 650 510 C860 548, 975 498, 1080 520" fill="none" stroke="${COLORS.teal}" stroke-width="6" opacity="0.9"/>

      <path d="M34 34 L132 34 L132 155 L84 130 L34 155 Z" fill="${COLORS.navy}" />
      <text x="83" y="62" font-size="15" font-family="Arial, Helvetica, sans-serif" fill="#f3cd6c" text-anchor="middle" font-weight="700">PROPERTY ID</text>
      <text x="83" y="112" font-size="27" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="800">${escapeXml(propertyId)}</text>

      <circle cx="545" cy="140" r="82" fill="${COLORS.white}" stroke="#bcc8d6" stroke-width="3" />
      <circle cx="545" cy="140" r="72" fill="${COLORS.white}" stroke="${COLORS.gold}" stroke-width="2" opacity="0.55" />
      <text x="545" y="122" font-size="18" font-family="Georgia, serif" fill="${COLORS.navy}" text-anchor="middle" font-style="italic">OCEAN</text>
      <text x="545" y="150" font-size="50" font-family="Georgia, serif" fill="${COLORS.navy}" text-anchor="middle" font-weight="700">O</text>
      <text x="545" y="174" font-size="16" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.tealDark}" text-anchor="middle" letter-spacing="2">VACATIONS</text>

      <text x="75" y="560" font-size="26" font-family="Georgia, serif" fill="${COLORS.teal}" font-style="italic">${escapeXml(location)}</text>
      <text x="75" y="630" font-size="78" font-family="Georgia, serif" fill="${COLORS.navy}" font-weight="700">OPEN</text>
      <text x="75" y="690" font-size="66" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.navy}" font-weight="800">AVAILABILITY</text>
      <text x="75" y="748" font-size="58" font-family="Georgia, serif" fill="${COLORS.teal}" font-style="italic">SPECIALS</text>
      <path d="M74 764 L345 764" stroke="${COLORS.gold}" stroke-width="4" />
      <text x="352" y="770" font-size="42" font-family="Georgia, serif" fill="${COLORS.gold}">✶</text>

      <rect x="610" y="560" width="380" height="44" rx="8" fill="${COLORS.navy}" />
      <text x="800" y="590" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="800">${escapeXml(featureTitle)}</text>

      <rect x="610" y="610" width="380" height="40" rx="8" fill="${COLORS.teal}" />
      <text x="800" y="637" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="800">${escapeXml(featureLine)}</text>

      <text x="610" y="686" font-size="28" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="800">${titleTspans}</text>

      ${factSvg}

      <text x="74" y="1298" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.navy}" font-weight="700">oceanvacationsmb.com</text>
      <text x="400" y="1298" font-size="16" font-family="Georgia, serif" fill="${COLORS.text}" font-style="italic">Links in caption.</text>
      <text x="810" y="1298" font-size="15" font-family="Arial, Helvetica, sans-serif" fill="#7b8793">Availability subject to change</text>

      <text x="610" y="830" font-size="17" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.tealDark}" font-weight="700">Open availability:</text>
      <text x="610" y="854" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="800">${escapeXml(openRangeText)}</text>
    </svg>
  `;
}

export async function createTemplateFlyer(post, scan) {
  console.log("STARTING TEMPLATE FLYER");
  console.log("PROPERTY PHOTO URL:", post.photoUrl);

  const openRangeText = getOpenDateRangeText(post);
  const openRanges = getOpenRanges(post, 4);
  const openSet = getOpenSet(post);

  const [month1, month2] = buildMonthObjects(scan);
  const photoUrls = getPhotoUrls(post);

  const [
    mainPhoto,
    topRightPhoto,
    middleRightPhoto,
    bottomWidePhoto
  ] = await Promise.all([
    makePhotoTile(photoUrls[0], 575, 278),
    makePhotoTile(photoUrls[1], 375, 135),
    makePhotoTile(photoUrls[2], 375, 135),
    makePhotoTile(photoUrls[3], 950, 145)
  ]);

  const overlaySvg = buildOverlaySvg(post, openRangeText);
  const month1Svg = buildCalendarSvg(month1.year, month1.month, openSet, scan.from, scan.to);
  const month2Svg = buildCalendarSvg(month2.year, month2.month, openSet, scan.from, scan.to);
  const openDatesSvg = buildOpenDatesListSvg(openRanges);
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
      { input: topRightPhoto, top: 40, left: 635 },
      { input: middleRightPhoto, top: 185, left: 635 },
      { input: bottomWidePhoto, top: 335, left: 40 },

      { input: Buffer.from(month1Svg), top: 930, left: 40 },
      { input: Buffer.from(month2Svg), top: 930, left: 315 },
      { input: Buffer.from(openDatesSvg), top: 930, left: 590 },
      { input: Buffer.from(ctaSvg), top: 930, left: 820 },

      { input: Buffer.from(directButtonSvg), top: 1220, left: 40 },
      { input: Buffer.from(airbnbButtonSvg), top: 1220, left: 415 },
      { input: Buffer.from(vrboButtonSvg), top: 1220, left: 790 }
    ])
    .png()
    .toFile(outputPath);

  console.log("TEMPLATE FLYER CREATED");

  return {
    localFilePath: outputPath
  };
}

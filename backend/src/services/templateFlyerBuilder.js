import axios from "axios";
import sharp from "sharp";
import os from "os";
import path from "path";

const WIDTH = 1080;
const HEIGHT = 1350;

const COLORS = {
  bg: "#f8f4ec",
  navy: "#063457",
  navy2: "#082f4e",
  teal: "#087f8c",
  teal2: "#35a9b8",
  gold: "#d5ad55",
  cream: "#fffaf0",
  white: "#ffffff",
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

function wrapText(text, maxCharsPerLine = 30, maxLines = 2) {
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
    .jpeg({ quality: 92 })
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
  const width = 250;
  const height = 165;
  const cellW = 29;
  const cellH = 20;
  const startX = 15;
  const startY = 56;

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
      const x = startX + index * 33 + 14;

      return `
        <text x="${x}" y="46" font-size="11" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" text-anchor="middle" font-weight="800">${day}</text>
      `;
    })
    .join("");

  let cellsSvg = "";

  for (let day = 1; day <= daysInMonth; day++) {
    const index = weekdayOffset + day - 1;
    const row = Math.floor(index / 7);
    const col = index % 7;

    const x = startX + col * 33;
    const y = startY + row * 22;

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
      <text x="${x + cellW / 2}" y="${y + 14}" font-size="11" font-family="Arial, Helvetica, sans-serif" fill="${textFill}" text-anchor="middle" font-weight="800">${day}</text>
    `;
  }

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" rx="14" fill="${COLORS.white}" stroke="${COLORS.border}" stroke-width="1.5" />
      <rect x="0" y="0" width="${width}" height="32" rx="14" fill="${COLORS.teal}" />
      <rect x="0" y="22" width="${width}" height="12" fill="${COLORS.teal}" />
      <text x="${width / 2}" y="21" font-size="14" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">${escapeXml(monthLabel.toUpperCase())}</text>
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
      const y = 57 + index * 31;

      return `
        <circle cx="20" cy="${y - 6}" r="8" fill="${COLORS.teal}" />
        <path d="M16 ${y - 6} L19 ${y - 2} L25 ${y - 10}" stroke="${COLORS.white}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        <text x="38" y="${y}" font-size="20" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="900">${escapeXml(item)}</text>
      `;
    })
    .join("");

  return `
    <svg width="255" height="165" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="255" height="165" rx="14" fill="${COLORS.white}" stroke="${COLORS.border}" stroke-width="1.5" />
      <rect x="0" y="0" width="255" height="34" rx="14" fill="${COLORS.teal}" />
      <rect x="0" y="24" width="255" height="12" fill="${COLORS.teal}" />
      <text x="128" y="22" font-size="15" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">OPEN DATES</text>
      ${itemSvg}
    </svg>
  `;
}

function buildCtaSvg() {
  return `
    <svg width="250" height="165" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="8" width="238" height="149" rx="25" fill="${COLORS.white}" stroke="${COLORS.gold}" stroke-width="4" />
      <text x="125" y="58" font-size="24" font-family="Georgia, serif" fill="${COLORS.navy}" text-anchor="middle" font-style="italic">Book Direct &amp;</text>
      <text x="125" y="90" font-size="23" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" text-anchor="middle" font-weight="900">SAVE UP TO</text>
      <text x="125" y="138" font-size="64" font-family="Georgia, serif" fill="${COLORS.teal}" text-anchor="middle" font-weight="900">20%</text>
    </svg>
  `;
}

function buildButtonSvg(label) {
  return `
    <svg width="275" height="58" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="275" height="58" rx="12" fill="${COLORS.navy}" />
      <rect x="2.5" y="2.5" width="270" height="53" rx="10" fill="none" stroke="${COLORS.gold}" stroke-width="3" />
      <text x="138" y="37" font-size="22" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">${escapeXml(label)}</text>
    </svg>
  `;
}

function buildOverlaySvg(post, openRangeText) {
  const propertyId = post.propertyId || post.shortId || "";
  const location = post.location || "";
  const featureTitle = getFeatureTitle(post);
  const factsLine = getFactsLine(post);
  const titleLines = wrapText(post.propertyTitle || "", 32, 2);

  const titleSvg = titleLines
    .map((line, index) => {
      return `
        <text x="600" y="${675 + index * 34}" font-size="30" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="900">${escapeXml(line)}</text>
      `;
    })
    .join("");

  return `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="${COLORS.bg}" />

      <rect x="30" y="28" width="1020" height="430" rx="24" fill="${COLORS.white}" />
      <rect x="30" y="28" width="1020" height="430" rx="24" fill="none" stroke="#d7d7d7" stroke-width="2" />

      <path d="M0 470 C 220 515, 420 450, 640 485 C 840 515, 980 475, 1080 495" fill="none" stroke="${COLORS.teal2}" stroke-width="6" opacity="0.9"/>

      <path d="M36 34 L132 34 L132 150 L84 128 L36 150 Z" fill="${COLORS.navy}" />
      <text x="84" y="62" font-size="14" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.gold}" text-anchor="middle" font-weight="900">PROPERTY ID</text>
      <text x="84" y="111" font-size="30" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">${escapeXml(propertyId)}</text>

      <circle cx="535" cy="125" r="70" fill="${COLORS.white}" stroke="#c5ccd3" stroke-width="3" />
      <text x="535" y="110" font-size="17" font-family="Georgia, serif" fill="${COLORS.navy}" text-anchor="middle" font-style="italic">OCEAN</text>
      <text x="535" y="144" font-size="45" font-family="Georgia, serif" fill="${COLORS.navy}" text-anchor="middle" font-weight="900">O</text>
      <text x="535" y="168" font-size="14" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" text-anchor="middle" letter-spacing="2">VACATIONS</text>

      <text x="66" y="560" font-size="27" font-family="Georgia, serif" fill="${COLORS.teal}" font-style="italic">${escapeXml(location)}</text>
      <text x="66" y="630" font-size="80" font-family="Georgia, serif" fill="${COLORS.navy}" font-weight="900">OPEN</text>
      <text x="66" y="695" font-size="64" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.navy}" font-weight="900">AVAILABILITY</text>
      <text x="66" y="760" font-size="58" font-family="Georgia, serif" fill="${COLORS.teal}" font-style="italic">SPECIALS</text>
      <line x1="66" y1="780" x2="350" y2="780" stroke="${COLORS.gold}" stroke-width="4" />
      <text x="358" y="790" font-size="45" font-family="Georgia, serif" fill="${COLORS.gold}">✶</text>

      <rect x="600" y="550" width="390" height="46" rx="7" fill="${COLORS.navy}" />
      <text x="795" y="581" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">${escapeXml(featureTitle)}</text>

      <rect x="600" y="607" width="390" height="42" rx="7" fill="${COLORS.teal2}" />
      <text x="795" y="635" font-size="19" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">${escapeXml(factsLine)}</text>

      ${titleSvg}

      <g transform="translate(600 755)">
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

      <text x="600" y="850" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" font-weight="900">Open availability:</text>
      <text x="600" y="878" font-size="20" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="900">${escapeXml(openRangeText)}</text>

      <text x="70" y="1295" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.navy}" font-weight="900">oceanvacationsmb.com</text>
      <text x="415" y="1295" font-size="16" font-family="Georgia, serif" fill="${COLORS.text}" font-style="italic">Links in caption.</text>
      <text x="800" y="1295" font-size="15" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.grayText}">Availability subject to change</text>
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
    bottomRightPhoto,
    widePhoto
  ] = await Promise.all([
    makePhotoTile(photoUrls[0], 590, 390),
    makePhotoTile(photoUrls[1], 420, 190),
    makePhotoTile(photoUrls[2], 420, 190),
    makePhotoTile(photoUrls[3], 1010, 105)
  ]);

  const overlaySvg = buildOverlaySvg(post, openRangeText);
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
      { input: topRightPhoto, top: 40, left: 630 },
      { input: bottomRightPhoto, top: 240, left: 630 },
      { input: widePhoto, top: 342, left: 40 },

      { input: Buffer.from(month1Svg), top: 935, left: 40 },
      { input: Buffer.from(month2Svg), top: 935, left: 315 },
      { input: Buffer.from(openDatesSvg), top: 935, left: 590 },
      { input: Buffer.from(ctaSvg), top: 935, left: 835 },

      { input: Buffer.from(directButtonSvg), top: 1215, left: 40 },
      { input: Buffer.from(airbnbButtonSvg), top: 1215, left: 405 },
      { input: Buffer.from(vrboButtonSvg), top: 1215, left: 770 }
    ])
    .png()
    .toFile(outputPath);

  console.log("TEMPLATE FLYER CREATED");

  return {
    localFilePath: outputPath
  };
}

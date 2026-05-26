import axios from "axios";
import sharp from "sharp";
import os from "os";
import path from "path";

const WIDTH = 1080;
const HEIGHT = 1350;
const TOP_HEIGHT = 540;

const COLORS = {
  bg: "#f7f3ea",
  navy: "#0a355e",
  teal: "#2aa6b3",
  tealDark: "#178d99",
  gold: "#d8b25b",
  white: "#ffffff",
  text: "#16324a",
  muted: "#e6ebef",
  red: "#eb6a5a",
  green: "#62b34f",
  grayText: "#7c8993",
  border: "#d7d2c6"
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

function getSortedSpecials(post) {
  return [...(post.specials || [])].sort((a, b) =>
    a.checkIn.localeCompare(b.checkIn)
  );
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

function getOpenRanges(post, limit = 4) {
  const specials = getSortedSpecials(post);

  return specials
    .slice(0, limit)
    .map((special) => `${special.checkInNice} to ${special.checkOutNice}`);
}

function getOpenDateRangeText(post) {
  const specials = getSortedSpecials(post);

  if (!specials.length) return "Contact us for dates";
  if (specials.length === 1) {
    return `${specials[0].checkInNice} to ${specials[0].checkOutNice}`;
  }

  return `${specials[0].checkInNice} to ${specials[specials.length - 1].checkOutNice}`;
}

function wrapText(text, maxCharsPerLine = 24, maxLines = 3) {
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

  return lines.slice(0, maxLines);
}

function getMainPhotoUrl(post) {
  if (post.photoUrl) return post.photoUrl;
  if (Array.isArray(post.photoUrls) && post.photoUrls[0]) return post.photoUrls[0];
  if (Array.isArray(post.pictures) && post.pictures[0]) return post.pictures[0];
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
    .resize(WIDTH, TOP_HEIGHT, {
      fit: "cover",
      position: "center"
    })
    .jpeg({ quality: 95 })
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
  const height = 205;
  const cellW = 39;
  const cellH = 24;
  const startX = 26;
  const startY = 69;

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
        <text x="${x}" y="56" font-size="13" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" text-anchor="middle" font-weight="900">${day}</text>
      `;
    })
    .join("");

  let cellsSvg = "";

  for (let day = 1; day <= daysInMonth; day++) {
    const index = weekdayOffset + day - 1;
    const row = Math.floor(index / 7);
    const col = index % 7;

    const x = startX + col * 44;
    const y = startY + row * 27;

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
      <text x="${x + cellW / 2}" y="${y + 17}" font-size="13" font-family="Arial, Helvetica, sans-serif" fill="${textFill}" text-anchor="middle" font-weight="900">${day}</text>
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
      const y = 65 + index * 35;

      return `
        <circle cx="24" cy="${y - 7}" r="8" fill="${COLORS.teal}" />
        <path d="M20 ${y - 7} L23 ${y - 3} L29 ${y - 11}" stroke="${COLORS.white}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        <text x="46" y="${y}" font-size="22" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="900">${escapeXml(item)}</text>
      `;
    })
    .join("");

  return `
    <svg width="310" height="205" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="310" height="205" rx="14" fill="${COLORS.white}" stroke="${COLORS.border}" stroke-width="1.5" />
      <rect x="0" y="0" width="310" height="42" rx="14" fill="${COLORS.teal}" />
      <rect x="0" y="28" width="310" height="14" fill="${COLORS.teal}" />
      <text x="155" y="28" font-size="17" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">OPEN DATES</text>
      ${itemSvg}
    </svg>
  `;
}

function buildBottomButton(label, iconText) {
  return `
    <svg width="300" height="66" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="300" height="66" rx="14" fill="${COLORS.navy}" />
      <rect x="2.5" y="2.5" width="295" height="61" rx="12" fill="none" stroke="${COLORS.gold}" stroke-width="3" />
      <circle cx="54" cy="33" r="22" fill="${COLORS.white}" />
      <text x="54" y="41" font-size="22" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.navy}" text-anchor="middle" font-weight="900">${escapeXml(iconText)}</text>
      <text x="176" y="40" font-size="21" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">${escapeXml(label)}</text>
    </svg>
  `;
}

function buildOverlaySvg(post) {
  const propertyId = post.propertyId || post.shortId || "";
  const location = post.location || "";
  const featureTitle = getFeatureTitle(post);
  const factsLine = getFactsLine(post);
  const openRangeText = getOpenDateRangeText(post);
  const titleLines = wrapText(post.propertyTitle || "", 22, 3);

  const titleSvg = titleLines
    .map((line, index) => {
      return `
        <text x="810" y="${700 + index * 34}" font-size="28" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" text-anchor="middle" font-weight="900">${escapeXml(line)}</text>
      `;
    })
    .join("");

  return `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${TOP_HEIGHT}" width="${WIDTH}" height="${HEIGHT - TOP_HEIGHT}" fill="${COLORS.bg}" />

      <path d="M0 ${TOP_HEIGHT} C 220 ${TOP_HEIGHT + 35}, 440 ${TOP_HEIGHT - 20}, 690 ${TOP_HEIGHT + 18} C 870 ${TOP_HEIGHT + 45}, 980 ${TOP_HEIGHT + 10}, 1080 ${TOP_HEIGHT + 22}" fill="none" stroke="${COLORS.teal}" stroke-width="6" opacity="0.75"/>

      <path d="M35 15 L195 15 L195 190 L115 157 L35 190 Z" fill="${COLORS.navy}" />
      <path d="M47 27 L183 27 L183 168 L115 140 L47 168 Z" fill="none" stroke="${COLORS.gold}" stroke-width="2" stroke-dasharray="6 5" />
      <text x="115" y="83" font-size="17" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.gold}" text-anchor="middle" font-weight="900">PROPERTY ID</text>
      <line x1="65" y1="122" x2="165" y2="122" stroke="${COLORS.white}" stroke-width="2"/>
      <text x="115" y="160" font-size="33" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">${escapeXml(propertyId)}</text>

      <circle cx="825" cy="110" r="92" fill="${COLORS.white}" fill-opacity="0.95" stroke="${COLORS.navy}" stroke-width="3"/>
      <text x="825" y="96" font-size="34" font-family="Georgia, serif" fill="${COLORS.navy}" text-anchor="middle" font-weight="900">OCEAN</text>
      <path d="M760 118 C785 96, 818 100, 848 120 C875 101, 903 109, 930 130" fill="none" stroke="${COLORS.teal}" stroke-width="5"/>
      <text x="825" y="148" font-size="15" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.tealDark}" text-anchor="middle" letter-spacing="3" font-weight="900">VACATIONS</text>

      <rect x="92" y="560" width="340" height="38" fill="${COLORS.bg}" opacity="0.98"/>
      <text x="262" y="588" font-size="29" font-family="Georgia, serif" fill="${COLORS.teal}" text-anchor="middle" font-style="italic">${escapeXml(location)}</text>

      <text x="70" y="672" font-size="94" font-family="Georgia, serif" fill="${COLORS.navy}" font-weight="900">OPEN</text>
      <text x="70" y="742" font-size="66" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.navy}" font-weight="900">AVAILABILITY</text>
      <text x="70" y="815" font-size="68" font-family="Georgia, serif" fill="${COLORS.teal}" font-style="italic">SPECIALS</text>
      <line x1="70" y1="842" x2="365" y2="842" stroke="${COLORS.gold}" stroke-width="4" />
      <text x="379" y="852" font-size="48" font-family="Georgia, serif" fill="${COLORS.gold}">✶</text>

      <rect x="612" y="592" width="395" height="48" rx="8" fill="${COLORS.navy}" />
      <text x="810" y="623" font-size="20" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">${escapeXml(featureTitle)}</text>

      <rect x="612" y="650" width="395" height="45" rx="8" fill="${COLORS.teal}" />
      <text x="810" y="680" font-size="21" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">${escapeXml(factsLine)}</text>

      ${titleSvg}

      <circle cx="665" cy="832" r="31" fill="${COLORS.white}" stroke="${COLORS.teal}" stroke-width="2"/>
      <text x="665" y="840" font-size="20" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" text-anchor="middle" font-weight="900">${escapeXml(post.bedrooms || "-")}</text>
      <text x="665" y="885" font-size="17" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" text-anchor="middle" font-weight="900">Bedrooms</text>

      <circle cx="810" cy="832" r="31" fill="${COLORS.white}" stroke="${COLORS.teal}" stroke-width="2"/>
      <text x="810" y="840" font-size="20" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" text-anchor="middle" font-weight="900">${escapeXml(post.bathrooms || "-")}</text>
      <text x="810" y="885" font-size="17" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" text-anchor="middle" font-weight="900">Bathrooms</text>

      <circle cx="955" cy="832" r="31" fill="${COLORS.white}" stroke="${COLORS.teal}" stroke-width="2"/>
      <text x="955" y="840" font-size="20" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" text-anchor="middle" font-weight="900">${escapeXml(post.sleeps || "-")}</text>
      <text x="955" y="885" font-size="17" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" text-anchor="middle" font-weight="900">Sleeps</text>

      <text x="612" y="930" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" font-weight="900">Open availability:</text>
      <text x="612" y="962" font-size="22" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="900">${escapeXml(openRangeText)}</text>

      <rect x="730" y="1032" width="285" height="190" rx="26" fill="${COLORS.white}" stroke="${COLORS.gold}" stroke-width="4"/>
      <text x="873" y="1090" font-size="28" font-family="Georgia, serif" fill="${COLORS.navy}" text-anchor="middle" font-style="italic">Book Direct &amp;</text>
      <text x="873" y="1124" font-size="25" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" text-anchor="middle" font-weight="900">SAVE UP TO</text>
      <text x="873" y="1195" font-size="78" font-family="Georgia, serif" fill="${COLORS.teal}" text-anchor="middle" font-weight="900">20%</text>

      <path d="M0 1235 C 215 1280, 395 1215, 610 1245 C 840 1280, 965 1225, 1080 1254" fill="none" stroke="${COLORS.tealLight}" stroke-width="16" opacity="0.55"/>
      <path d="M0 1253 C 215 1298, 395 1232, 610 1265 C 840 1298, 965 1246, 1080 1274" fill="none" stroke="${COLORS.teal}" stroke-width="8" opacity="0.42"/>

      <text x="68" y="1312" font-size="22" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.navy}" font-weight="900">oceanvacationsmb.com</text>
      <text x="430" y="1312" font-size="18" font-family="Georgia, serif" fill="${COLORS.text}" font-style="italic">Links in caption.</text>
      <text x="790" y="1312" font-size="15" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.grayText}">Availability subject to change</text>
    </svg>
  `;
}

export async function createTemplateFlyer(post, scan) {
  const openSet = getOpenSet(post);
  const openRanges = getOpenRanges(post, 4);
  const calendarMonth = getCalendarMonth(post, scan);

  const mainPhotoUrl = getMainPhotoUrl(post);
  const topPropertyImage = await makeTopPropertyImage(mainPhotoUrl);

  const overlaySvg = buildOverlaySvg(post);

  const calendarSvg = buildCalendarSvg(
    calendarMonth.year,
    calendarMonth.month,
    openSet,
    scan.from,
    scan.to
  );

  const openDatesSvg = buildOpenDatesSvg(openRanges);

  const directButtonSvg = buildBottomButton("DIRECT BOOKING", "▣");
  const airbnbButtonSvg = buildBottomButton("AIRBNB", "A");
  const vrboButtonSvg = buildBottomButton("VRBO", "⌂");

  const outputPath = path.join(os.tmpdir(), `clean-flyer-${Date.now()}.png`);

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
        input: topPropertyImage,
        top: 0,
        left: 0
      },
      {
        input: Buffer.from(overlaySvg),
        top: 0,
        left: 0
      },
      {
        input: Buffer.from(calendarSvg),
        top: 990,
        left: 58
      },
      {
        input: Buffer.from(openDatesSvg),
        top: 990,
        left: 432
      },
      {
        input: Buffer.from(directButtonSvg),
        top: 1235,
        left: 42
      },
      {
        input: Buffer.from(airbnbButtonSvg),
        top: 1235,
        left: 390
      },
      {
        input: Buffer.from(vrboButtonSvg),
        top: 1235,
        left: 738
      }
    ])
    .png()
    .toFile(outputPath);

  return {
    localFilePath: outputPath
  };
}

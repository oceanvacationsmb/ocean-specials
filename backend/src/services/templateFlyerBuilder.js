import axios from "axios";
import sharp from "sharp";
import os from "os";
import path from "path";

const WIDTH = 1080;
const HEIGHT = 1350;

const COLORS = {
  bg: "#f8f4ec",
  navy: "#062f53",
  navyDark: "#03243f",
  teal: "#158f9f",
  tealLight: "#39aebd",
  gold: "#d7b35f",
  white: "#ffffff",
  cream: "#f8f4ec",
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

function wrapText(text, maxCharsPerLine = 28, maxLines = 2) {
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
  const width = 350;
  const height = 205;
  const cellW = 38;
  const cellH = 24;
  const startX = 25;
  const startY = 70;

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
      const x = startX + index * 43 + 19;

      return `
        <text x="${x}" y="57" font-size="13" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" text-anchor="middle" font-weight="900">${day}</text>
      `;
    })
    .join("");

  let cellsSvg = "";

  for (let day = 1; day <= daysInMonth; day++) {
    const index = weekdayOffset + day - 1;
    const row = Math.floor(index / 7);
    const col = index % 7;

    const x = startX + col * 43;
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
        <circle cx="25" cy="${y - 7}" r="8" fill="${COLORS.teal}" />
        <path d="M21 ${y - 7} L24 ${y - 3} L30 ${y - 11}" stroke="${COLORS.white}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        <text x="48" y="${y}" font-size="22" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="900">${escapeXml(item)}</text>
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

function buildBottomButton(label, icon) {
  return `
    <svg width="295" height="65" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="295" height="65" rx="13" fill="${COLORS.navy}" />
      <rect x="2.5" y="2.5" width="290" height="60" rx="11" fill="none" stroke="${COLORS.gold}" stroke-width="3" />
      <circle cx="58" cy="33" r="22" fill="${COLORS.white}" opacity="0.95"/>
      <text x="58" y="41" font-size="23" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.navy}" text-anchor="middle" font-weight="900">${escapeXml(icon)}</text>
      <text x="175" y="40" font-size="22" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">${escapeXml(label)}</text>
    </svg>
  `;
}

function buildCleanLowerOverlaySvg(post) {
  const propertyId = post.propertyId || post.shortId || "";
  const location = post.location || "";
  const featureTitle = getFeatureTitle(post);
  const factsLine = getFactsLine(post);
  const openRangeText = getOpenDateRangeText(post);
  const titleLines = wrapText(post.propertyTitle || "", 29, 2);

  const titleSvg = titleLines
    .map((line, index) => {
      return `
        <text x="818" y="${685 + index * 35}" font-size="30" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" text-anchor="middle" font-weight="900">${escapeXml(line)}</text>
      `;
    })
    .join("");

  return `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="500" width="${WIDTH}" height="850" fill="${COLORS.bg}" />

      <path d="M0 500 C 220 540, 430 475, 650 510 C 860 545, 975 498, 1080 525" fill="none" stroke="${COLORS.tealLight}" stroke-width="7" opacity="0.85"/>

      <path d="M40 0 L200 0 L200 188 L120 155 L40 188 Z" fill="${COLORS.navy}" />
      <path d="M52 12 L188 12 L188 166 L120 138 L52 166 Z" fill="none" stroke="${COLORS.gold}" stroke-width="2" stroke-dasharray="6 5" />
      <text x="120" y="80" font-size="17" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.gold}" text-anchor="middle" font-weight="900">PROPERTY ID</text>
      <line x1="70" y1="120" x2="170" y2="120" stroke="${COLORS.white}" stroke-width="2" opacity="0.85"/>
      <text x="120" y="158" font-size="33" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">${escapeXml(propertyId)}</text>

      <text x="270" y="585" font-size="30" font-family="Georgia, serif" fill="${COLORS.teal}" text-anchor="middle" font-style="italic">${escapeXml(location)}</text>
      <text x="65" y="665" font-size="93" font-family="Georgia, serif" fill="${COLORS.navy}" font-weight="900">OPEN</text>
      <text x="65" y="735" font-size="65" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.navy}" font-weight="900">AVAILABILITY</text>
      <text x="65" y="805" font-size="66" font-family="Georgia, serif" fill="${COLORS.teal}" font-style="italic">SPECIALS</text>
      <line x1="65" y1="828" x2="365" y2="828" stroke="${COLORS.gold}" stroke-width="4" />
      <text x="375" y="838" font-size="48" font-family="Georgia, serif" fill="${COLORS.gold}">✶</text>

      <rect x="620" y="565" width="395" height="50" rx="8" fill="${COLORS.navy}" />
      <text x="818" y="598" font-size="20" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">${escapeXml(featureTitle)}</text>

      <rect x="620" y="625" width="395" height="45" rx="8" fill="${COLORS.teal}" />
      <text x="818" y="655" font-size="21" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" text-anchor="middle" font-weight="900">${escapeXml(factsLine)}</text>

      ${titleSvg}

      <g transform="translate(625 755)">
        <circle cx="32" cy="32" r="29" fill="${COLORS.white}" stroke="${COLORS.teal}" stroke-width="2"/>
        <text x="32" y="40" font-size="19" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" text-anchor="middle" font-weight="900">${escapeXml(post.bedrooms || "-")}</text>
        <text x="72" y="30" font-size="17" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="900">Bedrooms</text>

        <circle cx="235" cy="32" r="29" fill="${COLORS.white}" stroke="${COLORS.teal}" stroke-width="2"/>
        <text x="235" y="40" font-size="19" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" text-anchor="middle" font-weight="900">${escapeXml(post.sleeps || "-")}</text>
        <text x="275" y="30" font-size="17" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="900">Sleeps</text>

        <circle cx="32" cy="88" r="29" fill="${COLORS.white}" stroke="${COLORS.teal}" stroke-width="2"/>
        <text x="32" y="96" font-size="19" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" text-anchor="middle" font-weight="900">${escapeXml(post.bathrooms || "-")}</text>
        <text x="72" y="86" font-size="17" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="900">Bathrooms</text>

        <circle cx="235" cy="88" r="29" fill="${COLORS.white}" stroke="${COLORS.teal}" stroke-width="2"/>
        <text x="235" y="96" font-size="19" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" text-anchor="middle" font-weight="900">${escapeXml(post.sleeps || "-")}</text>
        <text x="275" y="86" font-size="17" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="900">Sleeps</text>
      </g>

      <text x="625" y="890" font-size="19" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" font-weight="900">Open availability:</text>
      <text x="625" y="920" font-size="21" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="900">${escapeXml(openRangeText)}</text>

      <rect x="695" y="1015" width="340" height="190" rx="25" fill="${COLORS.white}" stroke="${COLORS.gold}" stroke-width="4" />
      <text x="865" y="1075" font-size="30" font-family="Georgia, serif" fill="${COLORS.navy}" text-anchor="middle" font-style="italic">Book Direct &amp;</text>
      <text x="865" y="1110" font-size="27" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.teal}" text-anchor="middle" font-weight="900">SAVE UP TO</text>
      <text x="865" y="1180" font-size="78" font-family="Georgia, serif" fill="${COLORS.teal}" text-anchor="middle" font-weight="900">20%</text>

      <path d="M0 1220 C 210 1265, 390 1195, 620 1235 C 850 1275, 980 1215, 1080 1245" fill="none" stroke="${COLORS.tealLight}" stroke-width="15" opacity="0.65"/>
      <path d="M0 1242 C 230 1285, 415 1210, 660 1250 C 880 1290, 980 1240, 1080 1260" fill="none" stroke="${COLORS.teal}" stroke-width="8" opacity="0.55"/>

      <text x="80" y="1314" font-size="22" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.navy}" font-weight="900">oceanvacationsmb.com</text>
      <text x="430" y="1314" font-size="18" font-family="Georgia, serif" fill="${COLORS.text}" font-style="italic">Links in caption.</text>
      <text x="795" y="1314" font-size="16" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.grayText}">Availability subject to change</text>
    </svg>
  `;
}

export async function createTemplateFlyer(post, scan) {
  console.log("STARTING CLEAN FINAL FLYER");
  console.log("PROPERTY PHOTO URL:", post.photoUrl);

  const openSet = getOpenSet(post);
  const openRanges = getOpenRanges(post, 4);
  const calendarMonth = getCalendarMonth(post, scan);

  const mainPhotoUrl = getMainPhotoUrl(post);
  const topPropertyImage = await makeTopPropertyImage(mainPhotoUrl);

  const lowerOverlaySvg = buildCleanLowerOverlaySvg(post);

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

  const outputPath = path.join(os.tmpdir(), `clean-final-flyer-${Date.now()}.png`);

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
        input: Buffer.from(lowerOverlaySvg),
        top: 0,
        left: 0
      },
      {
        input: Buffer.from(calendarSvg),
        top: 985,
        left: 55
      },
      {
        input: Buffer.from(openDatesSvg),
        top: 985,
        left: 420
      },
      {
        input: Buffer.from(directButtonSvg),
        top: 1238,
        left: 65
      },
      {
        input: Buffer.from(airbnbButtonSvg),
        top: 1238,
        left: 392
      },
      {
        input: Buffer.from(vrboButtonSvg),
        top: 1238,
        left: 720
      }
    ])
    .png()
    .toFile(outputPath);

  console.log("CLEAN FINAL FLYER CREATED");

  return {
    localFilePath: outputPath
  };
}

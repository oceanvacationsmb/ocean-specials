import axios from "axios";
import sharp from "sharp";
import os from "os";
import path from "path";
import fs from "fs/promises";

import { uploadFlyerToCloudinary } from "./cloudinaryService.js";

function safe(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function toYmd(date) {
  return date.toISOString().slice(0, 10);
}

function niceDate(ymd) {
  const date = new Date(ymd + "T00:00:00");

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric"
  });
}

function monthTitle(year, monthIndex) {
  const date = new Date(year, monthIndex, 1);

  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  }).toUpperCase();
}

function isDateOpen(dateYmd, specials) {
  return specials.some((special) => {
    return dateYmd >= special.checkIn && dateYmd < special.checkOut;
  });
}

function isInsideScan(dateYmd, scanFrom, scanTo) {
  return dateYmd >= scanFrom && dateYmd < scanTo;
}

async function imageToDataUri(url) {
  if (!url) return "";

  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000
    });

    const contentType = response.headers["content-type"] || "image/jpeg";
    const base64 = Buffer.from(response.data).toString("base64");

    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    return "";
  }
}

function getMonths(scanFrom, scanTo) {
  const start = new Date(scanFrom + "T00:00:00");
  const end = new Date(scanTo + "T00:00:00");

  const months = [];
  const current = new Date(start.getFullYear(), start.getMonth(), 1);

  while (current < end && months.length < 2) {
    months.push({
      year: current.getFullYear(),
      monthIndex: current.getMonth()
    });

    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

function buildCalendar({ year, monthIndex, scanFrom, scanTo, specials }) {
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);

  const startDay = first.getDay();
  const totalDays = last.getDate();

  const cell = 34;
  const gap = 4;
  const startX = 24;
  const startY = 74;

  const days = ["S", "M", "T", "W", "T", "F", "S"];

  const headers = days
    .map((day, index) => {
      const x = startX + index * (cell + gap) + cell / 2;
      return `<text x="${x}" y="56" text-anchor="middle" font-family="Arial" font-size="15" font-weight="800" fill="#0b2f4d">${day}</text>`;
    })
    .join("");

  let cells = "";

  for (let day = 1; day <= totalDays; day++) {
    const index = startDay + day - 1;
    const row = Math.floor(index / 7);
    const col = index % 7;

    const x = startX + col * (cell + gap);
    const y = startY + row * (cell + gap);

    const dateYmd = toYmd(new Date(year, monthIndex, day));

    let fill = "#ffffff";
    let stroke = "#d7e2e8";
    let color = "#0b2f4d";

    if (isInsideScan(dateYmd, scanFrom, scanTo)) {
      if (isDateOpen(dateYmd, specials)) {
        fill = "#5ca84a";
        stroke = "#5ca84a";
        color = "#ffffff";
      } else {
        fill = "#e75d4f";
        stroke = "#e75d4f";
        color = "#ffffff";
      }
    }

    cells += `
      <rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="7" fill="${fill}" stroke="${stroke}" />
      <text x="${x + cell / 2}" y="${y + 23}" text-anchor="middle" font-family="Arial" font-size="15" font-weight="900" fill="${color}">${day}</text>
    `;
  }

  return `
    <g>
      <rect x="0" y="0" width="300" height="330" rx="18" fill="#ffffff" stroke="#c7d7df" stroke-width="2" />
      <rect x="0" y="0" width="300" height="42" rx="18" fill="#063457" />
      <text x="150" y="28" text-anchor="middle" font-family="Arial" font-size="18" font-weight="900" fill="#ffffff">${monthTitle(year, monthIndex)}</text>
      ${headers}
      ${cells}
    </g>
  `;
}

function buildOpenDates(post) {
  const items = (post.specials || [])
    .slice(0, 6)
    .map((special, index) => {
      const y = 58 + index * 36;

      return `
        <circle cx="28" cy="${y - 7}" r="11" fill="#087f8c" />
        <text x="28" y="${y - 2}" text-anchor="middle" font-family="Arial" font-size="13" font-weight="900" fill="#ffffff">✓</text>
        <text x="52" y="${y}" font-family="Arial" font-size="19" font-weight="800" fill="#0b2f4d">${safe(special.checkInNice)} to ${safe(special.checkOutNice)}</text>
      `;
    })
    .join("");

  return `
    <g>
      <rect x="0" y="0" width="370" height="290" rx="18" fill="#ffffff" stroke="#c7d7df" stroke-width="2" />
      <rect x="0" y="0" width="370" height="42" rx="18" fill="#087f8c" />
      <text x="185" y="28" text-anchor="middle" font-family="Arial" font-size="18" font-weight="900" fill="#ffffff">OPEN DATES</text>
      ${items}
      <text x="185" y="268" text-anchor="middle" font-family="Arial" font-size="14" font-style="italic" fill="#607080">Availability subject to change</text>
    </g>
  `;
}

function buildCaption(post, flyerUrl) {
  const openings = (post.specials || [])
    .map((special) => `${special.checkInNice} to ${special.checkOutNice}`)
    .join("\n");

  const direct = post.directBookingUrl
    ? `Book direct and save up to 20%:\n${post.directBookingUrl}\n`
    : "";

  const airbnb = post.airbnbUrl ? `\nAirbnb:\n${post.airbnbUrl}\n` : "";
  const vrbo = post.vrboUrl ? `\nVRBO:\n${post.vrboUrl}\n` : "";

  return `LAST MINUTE DEALS

${post.propertyId} | ${post.propertyTitle}
${post.location}
${post.bedrooms}BR • Sleeps ${post.sleeps}

Open dates:
${openings}

Flyer:
${flyerUrl}

${direct}${airbnb}${vrbo}
oceanvacationsmb.com`;
}

async function buildFlyerSvg(post, scan) {
  const heroImage = await imageToDataUri(post.photoUrl);

  const months = getMonths(scan.from, scan.to);

  const calendar1 = months[0]
    ? buildCalendar({
        ...months[0],
        scanFrom: scan.from,
        scanTo: scan.to,
        specials: post.specials || []
      })
    : "";

  const calendar2 = months[1]
    ? buildCalendar({
        ...months[1],
        scanFrom: scan.from,
        scanTo: scan.to,
        specials: post.specials || []
      })
    : "";

  const features =
    post.sellingPoints && post.sellingPoints.length
      ? post.sellingPoints.join(" • ")
      : `${post.bedrooms}BR • Sleeps ${post.sleeps}`;

  return `
    <svg width="1122" height="1402" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#dff8ff" />
          <stop offset="55%" stop-color="#ffffff" />
          <stop offset="100%" stop-color="#f6ead6" />
        </linearGradient>

        <linearGradient id="navy" x1="0" x2="1">
          <stop offset="0%" stop-color="#052b49" />
          <stop offset="100%" stop-color="#073f67" />
        </linearGradient>

        <clipPath id="heroClip">
          <rect x="0" y="0" width="1122" height="430" />
        </clipPath>
      </defs>

      <rect width="1122" height="1402" fill="url(#bg)" />

      ${
        heroImage
          ? `<image href="${heroImage}" x="0" y="0" width="1122" height="460" preserveAspectRatio="xMidYMid slice" clip-path="url(#heroClip)" />`
          : `<rect x="0" y="0" width="1122" height="460" fill="#9ed8e8" />`
      }

      <rect x="0" y="340" width="1122" height="1062" fill="rgba(255,255,255,0.94)" />
      <path d="M0 340 C 280 425, 590 315, 1122 388 L1122 515 L0 515 Z" fill="#ffffff" opacity="0.94"/>

      <g>
        <path d="M0 0 L185 0 L185 190 L92 150 L0 190 Z" fill="#052b49"/>
        <text x="92" y="62" text-anchor="middle" font-family="Arial" font-size="18" font-weight="900" fill="#e8c35a">PROPERTY ID</text>
        <text x="92" y="124" text-anchor="middle" font-family="Arial" font-size="52" font-weight="900" fill="#ffffff">${safe(post.propertyId)}</text>
      </g>

      <g>
        <circle cx="880" cy="110" r="82" fill="#ffffff" stroke="#0a3c62" stroke-width="4" />
        <text x="880" y="100" text-anchor="middle" font-family="Georgia" font-size="40" font-weight="700" fill="#0a3c62">OCEAN</text>
        <text x="880" y="132" text-anchor="middle" font-family="Arial" font-size="16" letter-spacing="4" fill="#087f8c">VACATIONS</text>
        <path d="M825 65 C845 47, 870 50, 890 68 C910 53, 930 60, 946 78" fill="none" stroke="#087f8c" stroke-width="5" />
      </g>

      <text x="58" y="540" font-family="Georgia" font-size="86" font-weight="900" fill="#052b49">LAST MINUTE</text>
      <text x="75" y="640" font-family="Brush Script MT, cursive" font-size="112" fill="#087f8c">DEALS</text>

      <rect x="80" y="665" width="525" height="48" fill="#087f8c" />
      <text x="342" y="697" text-anchor="middle" font-family="Arial" font-size="24" font-weight="900" fill="#ffffff">${safe(post.propertyId)} | ${safe(post.location)}</text>

      <text x="80" y="770" font-family="Georgia" font-size="40" font-weight="800" fill="#052b49">${safe(post.propertyTitle)}</text>
      <text x="80" y="824" font-family="Arial" font-size="25" font-weight="900" fill="#087f8c">${safe(features)}</text>

      <g transform="translate(80 870)">
        <circle cx="30" cy="30" r="28" fill="#ffffff" stroke="#052b49" stroke-width="3" />
        <text x="30" y="39" text-anchor="middle" font-family="Arial" font-size="20" font-weight="900" fill="#052b49">${safe(post.bedrooms)}</text>
        <text x="75" y="38" font-family="Arial" font-size="23" font-weight="800" fill="#052b49">Bedrooms</text>

        <circle cx="315" cy="30" r="28" fill="#ffffff" stroke="#052b49" stroke-width="3" />
        <text x="315" y="39" text-anchor="middle" font-family="Arial" font-size="20" font-weight="900" fill="#052b49">${safe(post.sleeps)}</text>
        <text x="360" y="38" font-family="Arial" font-size="23" font-weight="800" fill="#052b49">Sleeps</text>
      </g>

      <g transform="translate(700 690)">
        <text x="0" y="0" font-family="Brush Script MT, cursive" font-size="66" fill="#052b49">Book direct and</text>
        <text x="10" y="67" font-family="Arial" font-size="34" font-weight="900" fill="#052b49">SAVE UP TO</text>
        <text x="190" y="165" font-family="Arial" font-size="108" font-weight="900" fill="#087f8c">20%</text>
      </g>

      <g transform="translate(58 960)">
        <rect x="0" y="0" width="665" height="42" fill="#087f8c" />
        <text x="332" y="29" text-anchor="middle" font-family="Arial" font-size="21" font-weight="900" fill="#ffffff">NEXT 30 DAYS AVAILABILITY</text>

        <g transform="translate(0 62)">
          ${calendar1}
        </g>

        <g transform="translate(330 62)">
          ${calendar2}
        </g>

        <g transform="translate(160 410)">
          <rect x="0" y="0" width="22" height="22" rx="5" fill="#5ca84a" />
          <text x="35" y="18" font-family="Arial" font-size="18" font-weight="800" fill="#0b2f4d">OPEN</text>

          <rect x="155" y="0" width="22" height="22" rx="5" fill="#e75d4f" />
          <text x="190" y="18" font-family="Arial" font-size="18" font-weight="800" fill="#0b2f4d">BOOKED</text>
        </g>
      </g>

      <g transform="translate(730 962)">
        ${buildOpenDates(post)}
      </g>

      <path d="M0 1285 C 240 1235, 420 1320, 650 1278 C 850 1242, 990 1260, 1122 1215 L1122 1402 L0 1402 Z" fill="url(#navy)" />

      <text x="561" y="1328" text-anchor="middle" font-family="Arial" font-size="32" font-weight="900" fill="#ffffff">oceanvacationsmb.com</text>
      <text x="561" y="1365" text-anchor="middle" font-family="Arial" font-size="18" font-style="italic" fill="#d7edf2">Availability subject to change • Links in caption</text>

      <g transform="translate(95 1230)">
        <rect x="0" y="0" width="255" height="54" rx="14" fill="#052b49" />
        <text x="127" y="35" text-anchor="middle" font-family="Arial" font-size="21" font-weight="900" fill="#ffffff">DIRECT BOOKING</text>

        <rect x="395" y="0" width="210" height="54" rx="14" fill="#052b49" />
        <text x="500" y="35" text-anchor="middle" font-family="Arial" font-size="21" font-weight="900" fill="#ffffff">AIRBNB</text>

        <rect x="650" y="0" width="190" height="54" rx="14" fill="#052b49" />
        <text x="745" y="35" text-anchor="middle" font-family="Arial" font-size="21" font-weight="900" fill="#ffffff">VRBO</text>
      </g>
    </svg>
  `;
}

export async function generateAndUploadFlyer(post, scan) {
  const svg = await buildFlyerSvg(post, scan);

  const cleanId = String(post.propertyId || post.listingId || "property")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .toLowerCase();

  const publicId = `${cleanId}-${scan.from}-${scan.to}-${Date.now()}`;

  const filePath = path.join(os.tmpdir(), `${publicId}.jpg`);

  await sharp(Buffer.from(svg))
    .jpeg({
      quality: 92
    })
    .toFile(filePath);

  const uploaded = await uploadFlyerToCloudinary(filePath, publicId);

  await fs.unlink(filePath).catch(() => {});

  const caption = buildCaption(post, uploaded.url);

  return {
    ok: true,
    flyerUrl: uploaded.url,
    cloudinaryPublicId: uploaded.publicId,
    caption
  };
}

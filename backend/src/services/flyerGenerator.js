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

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function niceDate(ymd) {
  const date = new Date(ymd + "T00:00:00");

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

function monthName(year, monthIndex) {
  const date = new Date(year, monthIndex, 1);

  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  }).toUpperCase();
}

function isDateInRange(dateYmd, startYmd, endYmd) {
  return dateYmd >= startYmd && dateYmd < endYmd;
}

function normalizeSellingPoints(value, bedrooms, sleeps) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split("•")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [`${bedrooms}BR`, `Sleeps ${sleeps}`];
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

function getOpenDateRanges(post) {
  return (post.specials || []).map((special) => ({
    checkIn: special.checkIn,
    checkOut: special.checkOut,
    label: `${special.checkInNice} to ${special.checkOutNice}`
  }));
}

function getMonthsBetween(scanFrom, scanTo) {
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

function buildCalendarSvg({ year, monthIndex, scanFrom, scanTo, openRanges }) {
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const startWeekday = firstDay.getDay();
  const totalDays = lastDay.getDate();

  const cellSize = 38;
  const gap = 5;
  const x0 = 38;
  const y0 = 82;

  const days = ["S", "M", "T", "W", "T", "F", "S"];

  const dayHeaders = days
    .map((day, index) => {
      const x = x0 + index * (cellSize + gap) + cellSize / 2;

      return `
        <text x="${x}" y="62" text-anchor="middle" font-family="Arial" font-size="18" font-weight="800" fill="#12304a">${day}</text>
      `;
    })
    .join("");

  let cells = "";

  for (let day = 1; day <= totalDays; day++) {
    const index = startWeekday + day - 1;
    const row = Math.floor(index / 7);
    const col = index % 7;

    const x = x0 + col * (cellSize + gap);
    const y = y0 + row * (cellSize + gap);

    const ymd = toYmd(new Date(year, monthIndex, day));
    const inScan = ymd >= scanFrom && ymd < scanTo;

    const isOpen = openRanges.some((range) =>
      isDateInRange(ymd, range.checkIn, range.checkOut)
    );

    let fill = "#ffffff";
    let textFill = "#12304a";
    let stroke = "#d8e3ea";

    if (inScan && isOpen) {
      fill = "#5eaa45";
      textFill = "#ffffff";
      stroke = "#5eaa45";
    }

    if (inScan && !isOpen) {
      fill = "#e75d4f";
      textFill = "#ffffff";
      stroke = "#e75d4f";
    }

    cells += `
      <rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="7" fill="${fill}" stroke="${stroke}" stroke-width="1" />
      <text x="${x + cellSize / 2}" y="${y + 25}" text-anchor="middle" font-family="Arial" font-size="17" font-weight="800" fill="${textFill}">${day}</text>
    `;
  }

  return `
    <g>
      <rect x="0" y="0" width="350" height="365" rx="18" fill="#ffffff" stroke="#c7d7df" stroke-width="2" />
      <rect x="0" y="0" width="350" height="42" rx="18" fill="#063457" />
      <text x="175" y="28" text-anchor="middle" font-family="Arial" font-size="20" font-weight="900" fill="#ffffff">${monthName(year, monthIndex)}</text>
      ${dayHeaders}
      ${cells}
    </g>
  `;
}

function buildOpenDatesList(openRanges) {
  const items = openRanges
    .slice(0, 6)
    .map((range, index) => {
      const y = 52 + index * 38;

      return `
        <g>
          <circle cx="24" cy="${y - 6}" r="11" fill="#087f8c" />
          <text x="24" y="${y - 1}" text-anchor="middle" font-family="Arial" font-size="14" font-weight="900" fill="#ffffff">✓</text>
          <text x="48" y="${y}" font-family="Arial" font-size="22" font-weight="800" fill="#12304a">${safe(range.label)}</text>
        </g>
      `;
    })
    .join("");

  return `
    <g>
      <rect x="0" y="0" width="500" height="300" rx="18" fill="#ffffff" stroke="#c7d7df" stroke-width="2" />
      <rect x="0" y="0" width="500" height="42" rx="18" fill="#087f8c" />
      <text x="250" y="28" text-anchor="middle" font-family="Arial" font-size="20" font-weight="900" fill="#ffffff">OPEN DATES</text>
      ${items}
      <text x="250" y="278" text-anchor="middle" font-family="Arial" font-size="15" font-style="italic" fill="#5b6f7a">Availability subject to change</text>
    </g>
  `;
}

function buildCaption(post, flyerUrl) {
  const openingLines = (post.specials || [])
    .map((special) => `${special.checkInNice} to ${special.checkOutNice}`)
    .join("\n");

  const directUrl = post.directBookingUrl || "";
  const airbnbUrl = post.airbnbUrl || "";
  const vrboUrl = post.vrboUrl || "";

  const airbnbLine = airbnbUrl ? `\nAirbnb:\n${airbnbUrl}` : "";
  const vrboLine = vrboUrl ? `\nVRBO:\n${vrboUrl}` : "";

  return `LAST MINUTE DEALS

${post.propertyId} | ${post.propertyTitle}
${post.location}
${post.bedrooms}BR • Sleeps ${post.sleeps}

Open dates:
${openingLines}

Flyer:
${flyerUrl}

Book direct and save up to 20%:
${directUrl}${airbnbLine}${vrboLine}

oceanvacationsmb.com`;
}

async function buildFlyerSvg(post, scanFrom, scanTo) {
  const heroImage = await imageToDataUri(post.photoUrl);
  const openRanges = getOpenDateRanges(post);
  const months = getMonthsBetween(scanFrom, scanTo);
  const sellingPoints = normalizeSellingPoints(
    post.sellingPoints,
    post.bedrooms,
    post.sleeps
  );

  const calendarOne = months[0]
    ? buildCalendarSvg({
        ...months[0],
        scanFrom,
        scanTo,
        openRanges
      })
    : "";

  const calendarTwo = months[1]
    ? buildCalendarSvg({
        ...months[1],
        scanFrom,
        scanTo,
        openRanges
      })
    : "";

  const propertyType = sellingPoints.join(" • ");
  const location = post.location || "";
  const title = post.propertyTitle || "";

  return `
    <svg width="1122" height="1402" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ocean" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#dff7ff"/>
          <stop offset="55%" stop-color="#ffffff"/>
          <stop offset="100%" stop-color="#f8ead4"/>
        </linearGradient>

        <linearGradient id="navy" x1="0" x2="1">
          <stop offset="0%" stop-color="#062b49"/>
          <stop offset="100%" stop-color="#0b4b73"/>
        </linearGradient>

        <clipPath id="heroClip">
          <rect x="0" y="0" width="1122" height="430" rx="0"/>
        </clipPath>
      </defs>

      <rect width="1122" height="1402" fill="url(#ocean)" />

      ${
        heroImage
          ? `<image href="${heroImage}" x="0" y="0" width="1122" height="470" preserveAspectRatio="xMidYMid slice" clip-path="url(#heroClip)" />`
          : `<rect x="0" y="0" width="1122" height="470" fill="#8ccfe0" />`
      }

      <rect x="0" y="350" width="1122" height="1052" fill="rgba(255,255,255,0.93)" />
      <path d="M0 350 C 250 430, 520 315, 1122 390 L1122 520 L0 520 Z" fill="#ffffff" opacity="0.92"/>

      <g>
        <path d="M0 0 L185 0 L185 190 L92 150 L0 190 Z" fill="#052b49"/>
        <text x="92" y="64" text-anchor="middle" font-family="Arial" font-size="19" font-weight="900" fill="#e8c35a">PROPERTY ID</text>
        <text x="92" y="124" text-anchor="middle" font-family="Arial" font-size="52" font-weight="900" fill="#ffffff">${safe(post.propertyId)}</text>
      </g>

      <g>
        <circle cx="875" cy="110" r="86" fill="#ffffff" stroke="#0a3c62" stroke-width="4"/>
        <text x="875" y="100" text-anchor="middle" font-family="Georgia" font-size="42" font-weight="700" fill="#0a3c62">OCEAN</text>
        <text x="875" y="132" text-anchor="middle" font-family="Arial" font-size="17" letter-spacing="4" fill="#087f8c">VACATIONS</text>
        <path d="M815 65 C835 45, 865 45, 885 66 C905 50, 930 58, 943 80" fill="none" stroke="#087f8c" stroke-width="5"/>
      </g>

      <text x="58" y="545" font-family="Georgia" font-size="88" font-weight="900" fill="#062b49">LAST MINUTE</text>
      <text x="75" y="645" font-family="Brush Script MT, cursive" font-size="116" fill="#087f8c">DEALS</text>

      <rect x="80" y="672" width="510" height="48" rx="0" fill="#087f8c"/>
      <text x="335" y="704" text-anchor="middle" font-family="Arial" font-size="25" font-weight="900" fill="#ffffff">${safe(post.propertyId)} | ${safe(location)}</text>

      <text x="80" y="770" font-family="Georgia" font-size="42" font-weight="800" fill="#062b49">${safe(title)}</text>
      <text x="80" y="825" font-family="Arial" font-size="26" font-weight="900" fill="#087f8c">${safe(propertyType)}</text>

      <g transform="translate(80 870)">
        <circle cx="30" cy="30" r="28" fill="#ffffff" stroke="#062b49" stroke-width="3"/>
        <text x="30" y="40" text-anchor="middle" font-family="Arial" font-size="22" font-weight="900" fill="#062b49">${safe(post.bedrooms)}</text>
        <text x="75" y="38" font-family="Arial" font-size="24" font-weight="800" fill="#062b49">Bedrooms</text>

        <circle cx="315" cy="30" r="28" fill="#ffffff" stroke="#062b49" stroke-width="3"/>
        <text x="315" y="40" text-anchor="middle" font-family="Arial" font-size="22" font-weight="900" fill="#062b49">${safe(post.sleeps)}</text>
        <text x="360" y="38" font-family="Arial" font-size="24" font-weight="800" fill="#062b49">Sleeps</text>
      </g>

      <g transform="translate(58 960)">
        <rect x="0" y="0" width="735" height="42" rx="0" fill="#087f8c"/>
        <text x="367" y="29" text-anchor="middle" font-family="Arial" font-size="21" font-weight="900" fill="#ffffff">NEXT 30 DAYS AVAILABILITY</text>

        <g transform="translate(0 62)">
          ${calendarOne}
        </g>

        <g transform="translate(375 62)">
          ${calendarTwo}
        </g>

        <g transform="translate(0 438)">
          <rect x="190" y="0" width="24" height="24" rx="5" fill="#5eaa45"/>
          <text x="225" y="20" font-family="Arial" font-size="19" font-weight="800" fill="#12304a">OPEN</text>

          <rect x="335" y="0" width="24" height="24" rx="5" fill="#e75d4f"/>
          <text x="370" y="20" font-family="Arial" font-size="19" font-weight="800" fill="#12304a">BOOKED</text>
        </g>
      </g>

      <g transform="translate(735 960)">
        ${buildOpenDatesList(openRanges)}
      </g>

      <g transform="translate(710 660)">
        <text x="0" y="0" font-family="Brush Script MT, cursive" font-size="70" fill="#062b49">Book direct and</text>
        <text x="10" y="70" font-family="Arial" font-size="35" font-weight="900" fill="#062b49">SAVE UP TO</text>
        <text x="190" y="170" font-family="Arial" font-size="112" font-weight="900" fill="#087f8c">20%</text>
      </g>

      <path d="M0 1285 C 210 1240, 385 1315, 610 1275 C 835 1235, 980 1260, 1122 1215 L1122 1402 L0 1402 Z" fill="url(#navy)"/>

      <text x="561" y="1328" text-anchor="middle" font-family="Arial" font-size="32" font-weight="900" fill="#ffffff">oceanvacationsmb.com</text>
      <text x="561" y="1365" text-anchor="middle" font-family="Arial" font-size="18" font-style="italic" fill="#d7edf2">Availability subject to change • Links in caption</text>

      <g transform="translate(95 1230)">
        <rect x="0" y="0" width="255" height="54" rx="14" fill="#062b49"/>
        <text x="127" y="35" text-anchor="middle" font-family="Arial" font-size="21" font-weight="900" fill="#ffffff">DIRECT BOOKING</text>

        <rect x="395" y="0" width="210" height="54" rx="14" fill="#062b49"/>
        <text x="500" y="35" text-anchor="middle" font-family="Arial" font-size="21" font-weight="900" fill="#ffffff">AIRBNB</text>

        <rect x="650" y="0" width="190" height="54" rx="14" fill="#062b49"/>
        <text x="745" y="35" text-anchor="middle" font-family="Arial" font-size="21" font-weight="900" fill="#ffffff">VRBO</text>
      </g>
    </svg>
  `;
}

export async function generateAndUploadFlyer(post, scan) {
  const svg = await buildFlyerSvg(post, scan.from, scan.to);

  const cleanId = String(post.propertyId || post.listingId || "property")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .toLowerCase();

  const publicId = `${cleanId}-${scan.from}-${scan.to}-${Date.now()}`;

  const filePath = path.join(os.tmpdir(), `${publicId}.jpg`);

  await sharp(Buffer.from(svg))
    .jpeg({
      quality: 94
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

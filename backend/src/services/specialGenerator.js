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
    month: "short",
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

function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isInsideScan(dateYmd, scanFrom, scanTo) {
  return dateYmd >= scanFrom && dateYmd < scanTo;
}

function isDateOpen(dateYmd, specials) {
  return (specials || []).some((special) => {
    return dateYmd >= special.checkIn && dateYmd < special.checkOut;
  });
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

function getOpenDateText(post) {
  const specials = post.specials || [];

  if (specials.length === 0) {
    return "Contact us for dates";
  }

  if (specials.length === 1) {
    return `${specials[0].checkInNice} to ${specials[0].checkOutNice}`;
  }

  return specials
    .slice(0, 4)
    .map((special) => `${special.checkInNice} to ${special.checkOutNice}`)
    .join(" • ");
}

function getAreaName(post) {
  const text = `${post.propertyTitle || ""} ${post.location || ""}`.toLowerCase();

  if (text.includes("cherry grove")) return "Cherry Grove Beach";
  if (text.includes("murrells")) return "Murrells Inlet";
  if (text.includes("surfside")) return "Surfside Beach";
  if (text.includes("north myrtle")) return "North Myrtle Beach";
  if (text.includes("myrtle")) return "Myrtle Beach";

  return post.location || "Beach Vacation";
}

function getMainFeature(post) {
  const text = `${post.propertyTitle || ""} ${(post.sellingPoints || []).join(" ")}`.toLowerCase();

  if (text.includes("oceanfront")) return "Oceanfront";
  if (text.includes("pool")) return "Private Pool";
  if (text.includes("walk")) return "Walk to Beach";
  if (text.includes("beach")) return "Beach Stay";

  return getAreaName(post);
}

function buildDirectBookingUrl(post) {
  return (
    post.directBookingUrl ||
    `https://oceanvacationsmb.guestybookings.com/en/properties/${post.listingId}`
  );
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

function buildCalendar({ year, monthIndex, scanFrom, scanTo, specials }) {
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);

  const startDay = first.getDay();
  const totalDays = last.getDate();

  const cell = 31;
  const gap = 4;
  const startX = 22;
  const startY = 75;

  const days = ["S", "M", "T", "W", "T", "F", "S"];

  const headers = days
    .map((day, index) => {
      const x = startX + index * (cell + gap) + cell / 2;
      return `
        <text x="${x}" y="58" text-anchor="middle" font-family="Arial" font-size="13" font-weight="900" fill="#0b2f4d">${day}</text>
      `;
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
    let stroke = "#d4e0e6";
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
      <rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1" />
      <text x="${x + cell / 2}" y="${y + 21}" text-anchor="middle" font-family="Arial" font-size="13" font-weight="900" fill="${color}">${day}</text>
    `;
  }

  return `
    <g>
      <rect x="0" y="0" width="290" height="292" rx="12" fill="#ffffff" stroke="#d1dde4" stroke-width="2" />
      <rect x="0" y="0" width="290" height="38" rx="12" fill="#063457" />
      <text x="145" y="25" text-anchor="middle" font-family="Arial" font-size="16" font-weight="900" fill="#ffffff">${monthTitle(year, monthIndex)}</text>
      ${headers}
      ${cells}
    </g>
  `;
}

function buildOpenDatesSmall(post) {
  const items = (post.specials || [])
    .slice(0, 4)
    .map((special, index) => {
      const y = 52 + index * 30;

      return `
        <g>
          <circle cx="26" cy="${y - 6}" r="10" fill="#087f8c" />
          <text x="26" y="${y - 1}" text-anchor="middle" font-family="Arial" font-size="12" font-weight="900" fill="#ffffff">✓</text>
          <text x="48" y="${y}" font-family="Arial" font-size="18" font-weight="800" fill="#0b2f4d">${safe(special.checkInNice)} to ${safe(special.checkOutNice)}</text>
        </g>
      `;
    })
    .join("");

  return `
    <g>
      <rect x="0" y="0" width="380" height="190" rx="20" fill="#ffffff" stroke="#cbd9df" stroke-width="2"/>
      <rect x="0" y="0" width="380" height="42" rx="20" fill="#087f8c"/>
      <text x="190" y="28" text-anchor="middle" font-family="Arial" font-size="19" font-weight="900" fill="#ffffff">OPEN DATES</text>
      ${items}
      <path d="M20 160 C 95 145, 160 178, 240 160 C 295 148, 330 155, 360 145" fill="none" stroke="#bfe0e8" stroke-width="3"/>
    </g>
  `;
}

function buildCaption(post, flyerUrl) {
  const openings = (post.specials || [])
    .map((special) => `${special.checkInNice} to ${special.checkOutNice}`)
    .join("\n");

  const directUrl = buildDirectBookingUrl(post);
  const airbnbUrl = post.airbnbUrl || "";
  const vrboUrl = post.vrboUrl || "";

  const airbnbLine = airbnbUrl ? `\nAirbnb:\n${airbnbUrl}\n` : "";
  const vrboLine = vrboUrl ? `\nVRBO:\n${vrboUrl}\n` : "";

  return `LAST MINUTE DEALS

${post.propertyId} | ${post.propertyTitle}
${post.location}
${post.bedrooms}BR • Sleeps ${post.sleeps}

Open dates:
${openings}

Flyer:
${flyerUrl}

Book direct and save up to 20%:
${directUrl}${airbnbLine}${vrboLine}

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

  const areaName = getAreaName(post);
  const featureName = getMainFeature(post);
  const openDateText = getOpenDateText(post);

  return `
    <svg width="1122" height="1402" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#dff8ff"/>
          <stop offset="52%" stop-color="#fff9ef"/>
          <stop offset="100%" stop-color="#f4ead8"/>
        </linearGradient>

        <linearGradient id="navy" x1="0" x2="1">
          <stop offset="0%" stop-color="#052b49"/>
          <stop offset="100%" stop-color="#063f67"/>
        </linearGradient>

        <linearGradient id="oceanDark" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#023451"/>
          <stop offset="60%" stop-color="#03556c"/>
          <stop offset="100%" stop-color="#06314f"/>
        </linearGradient>

        <clipPath id="heroClip">
          <rect x="0" y="0" width="1122" height="425"/>
        </clipPath>

        <clipPath id="smallPhotoClip">
          <rect x="70" y="825" width="330" height="180" rx="22"/>
        </clipPath>

        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#062b49" flood-opacity="0.22"/>
        </filter>
      </defs>

      <rect width="1122" height="1402" fill="url(#bg)"/>

      ${
        heroImage
          ? `<image href="${heroImage}" x="0" y="0" width="1122" height="455" preserveAspectRatio="xMidYMid slice" clip-path="url(#heroClip)"/>`
          : `<rect x="0" y="0" width="1122" height="455" fill="#89d2e3"/>`
      }

      <rect x="0" y="0" width="1122" height="425" fill="rgba(0,35,55,0.10)"/>

      <path d="M0 385 C 220 445, 420 405, 620 380 C 840 350, 980 385, 1122 355 L1122 560 L0 560 Z" fill="#fffaf0" opacity="0.97"/>
      <path d="M0 405 C 270 470, 530 410, 780 375 C 950 350, 1040 370, 1122 345" fill="none" stroke="#0b8793" stroke-width="8" opacity="0.78"/>

      <g transform="translate(76 36)">
        <text x="0" y="0" font-family="Arial" font-size="30" letter-spacing="10" fill="#062b49">CHERRY GROVE</text>
        <text x="40" y="70" font-family="Brush Script MT, cursive" font-size="82" fill="#087f8c">${safe(titleCase(areaName.replace("Beach", "").trim() || "Beach"))}</text>
        <line x1="0" y1="95" x2="80" y2="95" stroke="#caa24a" stroke-width="2"/>
        <text x="106" y="103" font-family="Arial" font-size="20" letter-spacing="4" fill="#062b49">${safe((post.location || "North Myrtle Beach").toUpperCase())}</text>
        <line x1="410" y1="95" x2="500" y2="95" stroke="#caa24a" stroke-width="2"/>
      </g>

      <g transform="translate(825 50)">
        <circle cx="100" cy="100" r="92" fill="#052b49" stroke="#caa24a" stroke-width="4"/>
        <path d="M48 69 C76 40, 112 45, 143 67 C160 52, 178 55, 194 74" fill="none" stroke="#12a6b4" stroke-width="6"/>
        <text x="100" y="106" text-anchor="middle" font-family="Georgia" font-size="48" font-weight="900" fill="#ffffff">OCEAN</text>
        <text x="100" y="148" text-anchor="middle" font-family="Arial" font-size="24" letter-spacing="4" font-weight="800" fill="#12d1d1">VACATIONS</text>
      </g>

      <g transform="translate(150 420)">
        <text x="0" y="0" font-family="Georgia" font-size="78" fill="#052b49">LAST MINUTE</text>
        <text x="10" y="115" font-family="Georgia" font-size="145" font-weight="900" fill="#087f8c">DEALS</text>
        <line x1="185" y1="138" x2="435" y2="138" stroke="#caa24a" stroke-width="3"/>
        <text x="300" y="145" text-anchor="middle" font-family="Georgia" font-size="28" fill="#caa24a">✦</text>

        <rect x="55" y="160" width="520" height="64" rx="28" fill="#052b49" stroke="#caa24a" stroke-width="3"/>
        <text x="315" y="202" text-anchor="middle" font-family="Arial" font-size="34" letter-spacing="6" font-weight="900" fill="#ffffff">${safe(post.propertyId)}</text>

        <text x="235" y="262" text-anchor="middle" font-family="Arial" font-size="28" font-weight="800" fill="#062b49">📍 ${safe(post.location)}</text>
      </g>

      <g transform="translate(760 405)" filter="url(#softShadow)">
        <circle cx="150" cy="150" r="145" fill="#fffaf0" stroke="#caa24a" stroke-width="4"/>
        <text x="150" y="96" text-anchor="middle" font-family="Brush Script MT, cursive" font-size="58" fill="#062b49">Book</text>
        <text x="150" y="145" text-anchor="middle" font-family="Brush Script MT, cursive" font-size="50" fill="#062b49">direct and</text>
        <text x="150" y="198" text-anchor="middle" font-family="Arial" font-size="30" font-weight="900" fill="#087f8c">SAVE UP TO</text>
        <text x="150" y="270" text-anchor="middle" font-family="Georgia" font-size="86" font-weight="900" fill="#087f8c">20%</text>
      </g>

      <g transform="translate(95 685)">
        <g>
          <circle cx="44" cy="44" r="42" fill="#087f8c"/>
          <text x="44" y="55" text-anchor="middle" font-family="Arial" font-size="34" font-weight="900" fill="#ffffff">🛏</text>
          <text x="105" y="36" font-family="Georgia" font-size="36" fill="#062b49">${safe(post.bedrooms)}</text>
          <text x="105" y="68" font-family="Arial" font-size="21" font-weight="800" fill="#062b49">BEDROOMS</text>
        </g>

        <line x1="320" y1="10" x2="320" y2="82" stroke="#b7c5cc" stroke-width="2"/>

        <g transform="translate(365 0)">
          <circle cx="44" cy="44" r="42" fill="#087f8c"/>
          <text x="44" y="55" text-anchor="middle" font-family="Arial" font-size="34" font-weight="900" fill="#ffffff">👥</text>
          <text x="105" y="36" font-family="Georgia" font-size="36" fill="#062b49">${safe(post.sleeps)}</text>
          <text x="105" y="68" font-family="Arial" font-size="21" font-weight="800" fill="#062b49">SLEEPS</text>
        </g>

        <line x1="665" y1="10" x2="665" y2="82" stroke="#b7c5cc" stroke-width="2"/>

        <g transform="translate(710 0)">
          <circle cx="44" cy="44" r="42" fill="#087f8c"/>
          <text x="44" y="55" text-anchor="middle" font-family="Arial" font-size="30" font-weight="900" fill="#ffffff">🌊</text>
          <text x="105" y="36" font-family="Arial" font-size="24" font-weight="900" fill="#062b49">${safe(featureName.toUpperCase())}</text>
          <text x="105" y="68" font-family="Arial" font-size="20" font-weight="800" fill="#062b49">${safe(areaName.toUpperCase())}</text>
        </g>
      </g>

      <rect x="0" y="795" width="1122" height="607" fill="url(#oceanDark)"/>
      <path d="M0 795 C 230 735, 430 830, 650 790 C 850 755, 1000 765, 1122 725 L1122 835 L0 835 Z" fill="#fffaf0"/>

      <g transform="translate(80 835)" filter="url(#softShadow)">
        <rect x="0" y="0" width="330" height="190" rx="22" fill="#ffffff" stroke="#d9e5ea" stroke-width="2"/>
        <circle cx="165" cy="0" r="30" fill="#caa24a"/>
        <text x="165" y="10" text-anchor="middle" font-family="Arial" font-size="26" fill="#ffffff">📅</text>
        <text x="165" y="75" text-anchor="middle" font-family="Arial" font-size="25" font-weight="900" fill="#087f8c">OPEN DATES</text>
        <text x="165" y="118" text-anchor="middle" font-family="Georgia" font-size="33" font-weight="900" fill="#062b49">${safe(openDateText)}</text>
        <path d="M0 145 C 85 115, 170 170, 330 135 L330 190 L0 190 Z" fill="#dff4f8"/>
      </g>

      <g transform="translate(435 825)">
        ${calendar1}
      </g>

      <g transform="translate(755 825)">
        ${calendar2}
      </g>

      <g transform="translate(560 1190)">
        <circle cx="0" cy="0" r="11" fill="#5ca84a"/>
        <text x="22" y="7" font-family="Arial" font-size="20" font-weight="900" fill="#ffffff">OPEN</text>

        <circle cx="135" cy="0" r="11" fill="#e75d4f"/>
        <text x="157" y="7" font-family="Arial" font-size="20" font-weight="900" fill="#ffffff">BOOKED</text>
      </g>

      <g transform="translate(82 1215)">
        <rect x="0" y="0" width="300" height="64" rx="32" fill="#052b49" stroke="#caa24a" stroke-width="3"/>
        <circle cx="48" cy="32" r="25" fill="#caa24a"/>
        <text x="48" y="41" text-anchor="middle" font-family="Arial" font-size="26" fill="#ffffff">🌐</text>
        <text x="178" y="40" text-anchor="middle" font-family="Arial" font-size="24" font-weight="900" fill="#ffffff">DIRECT BOOKING</text>

        <rect x="410" y="0" width="270" height="64" rx="32" fill="#052b49" stroke="#caa24a" stroke-width="3"/>
        <circle cx="458" cy="32" r="25" fill="#e75d4f"/>
        <text x="458" y="43" text-anchor="middle" font-family="Arial" font-size="27" fill="#ffffff">A</text>
        <text x="550" y="40" text-anchor="middle" font-family="Arial" font-size="24" font-weight="900" fill="#ffffff">AIRBNB</text>

        <rect x="760" y="0" width="245" height="64" rx="32" fill="#052b49" stroke="#caa24a" stroke-width="3"/>
        <circle cx="808" cy="32" r="25" fill="#2a77e8"/>
        <text x="808" y="42" text-anchor="middle" font-family="Arial" font-size="26" fill="#ffffff">⌂</text>
        <text x="895" y="40" text-anchor="middle" font-family="Arial" font-size="24" font-weight="900" fill="#ffffff">VRBO</text>
      </g>

      <text x="561" y="1340" text-anchor="middle" font-family="Georgia" font-size="36" font-weight="900" letter-spacing="4" fill="#ffffff">oceanvacationsmb.com</text>
      <text x="561" y="1377" text-anchor="middle" font-family="Arial" font-size="19" fill="#7fe4e8">Availability subject to change</text>
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

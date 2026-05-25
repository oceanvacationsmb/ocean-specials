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

function isInsideScan(dateYmd, scanFrom, scanTo) {
  return dateYmd >= scanFrom && dateYmd < scanTo;
}

function isDateOpen(dateYmd, specials) {
  return (specials || []).some((special) => {
    return dateYmd >= special.checkIn && dateYmd < special.checkOut;
  });
}

function monthTitle(year, monthIndex) {
  const date = new Date(year, monthIndex, 1);

  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  }).toUpperCase();
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

function getAreaName(post) {
  const text = `${post.propertyTitle || ""} ${post.location || ""}`.toLowerCase();

  if (text.includes("cherry grove")) return "Cherry Grove Beach";
  if (text.includes("murrells")) return "Murrells Inlet";
  if (text.includes("surfside")) return "Surfside Beach";
  if (text.includes("north myrtle")) return "North Myrtle Beach";
  if (text.includes("myrtle")) return "Myrtle Beach";

  return post.location || "Beach Vacation";
}

function getFeatureName(post) {
  const text = `${post.propertyTitle || ""} ${(post.sellingPoints || []).join(" ")}`.toLowerCase();

  if (text.includes("oceanfront")) return "Oceanfront";
  if (text.includes("private pool")) return "Private Pool";
  if (text.includes("pool")) return "Pool";
  if (text.includes("walk")) return "Walk to Beach";
  if (text.includes("beach")) return "Beach Stay";

  return getAreaName(post);
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
    .slice(0, 3)
    .map((special) => `${special.checkInNice} to ${special.checkOutNice}`)
    .join(" • ");
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
  const startX = 24;
  const startY = 72;

  const days = ["S", "M", "T", "W", "T", "F", "S"];

  const headers = days
    .map((day, index) => {
      const x = startX + index * (cell + gap) + cell / 2;

      return `
        <text x="${x}" y="55" text-anchor="middle" font-family="Arial" font-size="13" font-weight="900" fill="#0b2f4d">${day}</text>
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
      <rect x="0" y="0" width="292" height="288" rx="16" fill="#ffffff" stroke="#d1dde4" stroke-width="2" />
      <rect x="0" y="0" width="292" height="40" rx="16" fill="#063457" />
      <text x="146" y="26" text-anchor="middle" font-family="Arial" font-size="16" font-weight="900" fill="#ffffff">${monthTitle(year, monthIndex)}</text>
      ${headers}
      ${cells}
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
  const featureName = getFeatureName(post);
  const openDateText = getOpenDateText(post);

  return `
    <svg width="1122" height="1402" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sand" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#fffdf6"/>
          <stop offset="52%" stop-color="#fff7ea"/>
          <stop offset="100%" stop-color="#efe0c5"/>
        </linearGradient>

        <linearGradient id="ocean" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#022f4f"/>
          <stop offset="60%" stop-color="#03566b"/>
          <stop offset="100%" stop-color="#052b49"/>
        </linearGradient>

        <linearGradient id="heroFade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#fff9ed" stop-opacity="0"/>
          <stop offset="55%" stop-color="#fff9ed" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="#fff9ed" stop-opacity="1"/>
        </linearGradient>

        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#062b49" flood-opacity="0.22"/>
        </filter>

        <filter id="heroBlur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="20"/>
        </filter>

        <clipPath id="heroMainClip">
          <rect x="56" y="32" width="1010" height="435" rx="32"/>
        </clipPath>
      </defs>

      <rect width="1122" height="1402" fill="url(#sand)" />

      ${
        heroImage
          ? `
            <image href="${heroImage}" x="-120" y="-90" width="1362" height="650" preserveAspectRatio="xMidYMid slice" filter="url(#heroBlur)" opacity="0.80"/>
            <rect x="0" y="0" width="1122" height="520" fill="#062b49" opacity="0.20"/>

            <rect x="36" y="18" width="1050" height="465" rx="36" fill="#ffffff" opacity="0.94" filter="url(#shadow)"/>
            <image href="${heroImage}" x="56" y="32" width="1010" height="435" preserveAspectRatio="xMidYMid meet" clip-path="url(#heroMainClip)"/>
          `
          : `<rect x="0" y="0" width="1122" height="520" fill="#89d2e3" />`
      }

      <rect x="0" y="355" width="1122" height="185" fill="url(#heroFade)" />

      <path d="M0 495 C 225 545, 420 515, 625 495 C 835 475, 995 500, 1122 465 L1122 650 L0 650 Z" fill="#fff9ed" opacity="0.98"/>
      <path d="M0 515 C 260 565, 520 528, 760 500 C 925 480, 1038 490, 1122 460" fill="none" stroke="#087f8c" stroke-width="8" opacity="0.72"/>

      <g transform="translate(810 45)">
        <circle cx="100" cy="100" r="88" fill="#052b49" stroke="#c9a24b" stroke-width="4"/>
        <path d="M48 70 C76 43, 112 46, 142 68 C160 55, 178 58, 194 76" fill="none" stroke="#12b9c2" stroke-width="6"/>
        <text x="100" y="108" text-anchor="middle" font-family="Georgia" font-size="45" font-weight="900" fill="#ffffff">OCEAN</text>
        <text x="100" y="148" text-anchor="middle" font-family="Arial" font-size="22" letter-spacing="4" font-weight="800" fill="#12d1d1">VACATIONS</text>
      </g>

      <g transform="translate(105 545)">
        <text x="0" y="0" font-family="Georgia" font-size="78" fill="#052b49">LAST MINUTE</text>
        <text x="5" y="112" font-family="Georgia" font-size="145" font-weight="900" fill="#087f8c">DEALS</text>
        <line x1="180" y1="136" x2="430" y2="136" stroke="#c9a24b" stroke-width="3"/>
        <text x="305" y="144" text-anchor="middle" font-family="Georgia" font-size="28" fill="#c9a24b">✦</text>

        <rect x="60" y="155" width="520" height="64" rx="30" fill="#052b49" stroke="#c9a24b" stroke-width="3"/>
        <text x="320" y="198" text-anchor="middle" font-family="Arial" font-size="34" letter-spacing="6" font-weight="900" fill="#ffffff">${safe(post.propertyId)}</text>

        <text x="320" y="258" text-anchor="middle" font-family="Arial" font-size="27" font-weight="900" fill="#062b49">${safe(post.location)}</text>
      </g>

      <g transform="translate(745 565)" filter="url(#shadow)">
        <circle cx="150" cy="150" r="142" fill="#fff9ed" stroke="#c9a24b" stroke-width="4"/>
        <text x="150" y="96" text-anchor="middle" font-family="Georgia" font-size="46" font-style="italic" fill="#062b49">Book</text>
        <text x="150" y="145" text-anchor="middle" font-family="Georgia" font-size="38" font-style="italic" fill="#062b49">direct and</text>
        <text x="150" y="198" text-anchor="middle" font-family="Arial" font-size="30" font-weight="900" fill="#087f8c">SAVE UP TO</text>
        <text x="150" y="270" text-anchor="middle" font-family="Georgia" font-size="84" font-weight="900" fill="#087f8c">20%</text>
      </g>

      <g transform="translate(95 825)">
        <g>
          <circle cx="44" cy="44" r="42" fill="#087f8c"/>
          <text x="44" y="57" text-anchor="middle" font-family="Arial" font-size="27" font-weight="900" fill="#ffffff">BED</text>
          <text x="105" y="36" font-family="Georgia" font-size="36" fill="#062b49">${safe(post.bedrooms)}</text>
          <text x="105" y="68" font-family="Arial" font-size="21" font-weight="900" fill="#062b49">BEDROOMS</text>
        </g>

        <line x1="318" y1="8" x2="318" y2="84" stroke="#b7c5cc" stroke-width="2"/>

        <g transform="translate(365 0)">
          <circle cx="44" cy="44" r="42" fill="#087f8c"/>
          <text x="44" y="57" text-anchor="middle" font-family="Arial" font-size="24" font-weight="900" fill="#ffffff">GUEST</text>
          <text x="105" y="36" font-family="Georgia" font-size="36" fill="#062b49">${safe(post.sleeps)}</text>
          <text x="105" y="68" font-family="Arial" font-size="21" font-weight="900" fill="#062b49">SLEEPS</text>
        </g>

        <line x1="666" y1="8" x2="666" y2="84" stroke="#b7c5cc" stroke-width="2"/>

        <g transform="translate(710 0)">
          <circle cx="44" cy="44" r="42" fill="#087f8c"/>
          <text x="44" y="57" text-anchor="middle" font-family="Arial" font-size="27" font-weight="900" fill="#ffffff">SEA</text>
          <text x="105" y="36" font-family="Arial" font-size="23" font-weight="900" fill="#062b49">${safe(featureName.toUpperCase())}</text>
          <text x="105" y="68" font-family="Arial" font-size="20" font-weight="900" fill="#062b49">${safe(areaName.toUpperCase())}</text>
        </g>
      </g>

      <rect x="0" y="935" width="1122" height="467" fill="url(#ocean)"/>
      <path d="M0 935 C 225 885, 425 965, 650 925 C 850 895, 990 905, 1122 860 L1122 970 L0 970 Z" fill="#fff9ed"/>

      <g transform="translate(80 980)" filter="url(#shadow)">
        <rect x="0" y="0" width="330" height="188" rx="22" fill="#ffffff" stroke="#d9e5ea" stroke-width="2"/>
        <circle cx="165" cy="0" r="30" fill="#c9a24b"/>
        <text x="165" y="10" text-anchor="middle" font-family="Arial" font-size="23" font-weight="900" fill="#ffffff">DATE</text>
        <text x="165" y="72" text-anchor="middle" font-family="Arial" font-size="25" font-weight="900" fill="#087f8c">OPEN DATES</text>
        <text x="165" y="116" text-anchor="middle" font-family="Georgia" font-size="29" font-weight="900" fill="#062b49">${safe(openDateText)}</text>
        <path d="M0 145 C 85 115, 170 170, 330 135 L330 188 L0 188 Z" fill="#dff4f8"/>
      </g>

      <g transform="translate(438 975)">
        ${calendar1}
      </g>

      <g transform="translate(760 975)">
        ${calendar2}
      </g>

      <g transform="translate(560 1274)">
        <circle cx="0" cy="0" r="11" fill="#5ca84a"/>
        <text x="22" y="7" font-family="Arial" font-size="20" font-weight="900" fill="#ffffff">OPEN</text>

        <circle cx="135" cy="0" r="11" fill="#e75d4f"/>
        <text x="157" y="7" font-family="Arial" font-size="20" font-weight="900" fill="#ffffff">BOOKED</text>
      </g>

      <g transform="translate(82 1300)">
        <rect x="0" y="0" width="300" height="56" rx="28" fill="#052b49" stroke="#c9a24b" stroke-width="3"/>
        <circle cx="48" cy="28" r="22" fill="#c9a24b"/>
        <text x="178" y="36" text-anchor="middle" font-family="Arial" font-size="22" font-weight="900" fill="#ffffff">DIRECT BOOKING</text>

        <rect x="410" y="0" width="270" height="56" rx="28" fill="#052b49" stroke="#c9a24b" stroke-width="3"/>
        <circle cx="458" cy="28" r="22" fill="#e75d4f"/>
        <text x="550" y="36" text-anchor="middle" font-family="Arial" font-size="22" font-weight="900" fill="#ffffff">AIRBNB</text>

        <rect x="760" y="0" width="245" height="56" rx="28" fill="#052b49" stroke="#c9a24b" stroke-width="3"/>
        <circle cx="808" cy="28" r="22" fill="#2a77e8"/>
        <text x="895" y="36" text-anchor="middle" font-family="Arial" font-size="22" font-weight="900" fill="#ffffff">VRBO</text>
      </g>

      <text x="561" y="1382" text-anchor="middle" font-family="Georgia" font-size="30" font-weight="900" letter-spacing="4" fill="#ffffff">oceanvacationsmb.com</text>
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
      quality: 95
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

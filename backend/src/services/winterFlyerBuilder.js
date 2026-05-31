import axios from "axios";
import os from "os";
import path from "path";
import sharp from "sharp";

const WIDTH = 1080;
const HEIGHT = 1350;
const HERO_HEIGHT = 585;

const COLORS = {
  navy: "#06375f",
  deepNavy: "#022a49",
  teal: "#0796a6",
  tealDark: "#047987",
  aqua: "#dff5f3",
  white: "#ffffff",
  gold: "#efc45c",
  coral: "#f46f61",
  text: "#12344d",
  muted: "#577284"
};

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function icon(type, x, y, stroke = COLORS.navy) {
  const common = `stroke="${stroke}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"`;

  if (type === "BED") {
    return `
      <path d="M${x - 19} ${y + 8} V${y - 8} M${x + 19} ${y + 8} V${y - 1} Q${x + 19} ${y - 10} ${x + 10} ${y - 10} H${x - 16} V${y + 8} M${x - 19} ${y + 2} H${x + 19}" ${common}/>
      <circle cx="${x - 9}" cy="${y - 15}" r="5" ${common}/>
    `;
  }

  if (type === "BATH") {
    return `
      <path d="M${x - 21} ${y - 2} H${x + 21} V${y + 4} Q${x + 18} ${y + 18} ${x + 3} ${y + 18} H${x - 3} Q${x - 18} ${y + 18} ${x - 21} ${y + 4} Z M${x - 12} ${y + 18} V${y + 24} M${x + 12} ${y + 18} V${y + 24}" ${common}/>
      <path d="M${x - 13} ${y - 2} V${y - 17} Q${x - 13} ${y - 25} ${x - 5} ${y - 25} Q${x + 3} ${y - 25} ${x + 3} ${y - 17}" ${common}/>
    `;
  }

  if (type === "GUEST") {
    return `
      <circle cx="${x}" cy="${y - 13}" r="8" ${common}/>
      <path d="M${x - 15} ${y + 18} Q${x - 15} ${y + 1} ${x} ${y + 1} Q${x + 15} ${y + 1} ${x + 15} ${y + 18}" ${common}/>
      <circle cx="${x - 20}" cy="${y - 8}" r="6" ${common}/>
      <circle cx="${x + 20}" cy="${y - 8}" r="6" ${common}/>
    `;
  }

  if (type === "WIFI") {
    return `
      <path d="M${x - 22} ${y - 6} Q${x} ${y - 25} ${x + 22} ${y - 6} M${x - 14} ${y + 3} Q${x} ${y - 9} ${x + 14} ${y + 3} M${x - 6} ${y + 11} Q${x} ${y + 5} ${x + 6} ${y + 11}" ${common}/>
      <circle cx="${x}" cy="${y + 18}" r="3.5" fill="${stroke}"/>
    `;
  }

  if (type === "BEACH") {
    return `
      <path d="M${x - 24} ${y + 19} H${x + 24} M${x} ${y - 18} V${y + 19} M${x - 22} ${y - 2} Q${x} ${y - 28} ${x + 22} ${y - 2} Q${x + 11} ${y - 8} ${x} ${y - 2} Q${x - 11} ${y - 8} ${x - 22} ${y - 2} Z" ${common}/>
    `;
  }

  if (type === "POOL") {
    return `
      <path d="M${x - 24} ${y - 5} Q${x - 14} ${y - 13} ${x - 4} ${y - 5} Q${x + 6} ${y + 3} ${x + 16} ${y - 5} Q${x + 22} ${y - 10} ${x + 27} ${y - 6} M${x - 24} ${y + 9} Q${x - 14} ${y + 1} ${x - 4} ${y + 9} Q${x + 6} ${y + 17} ${x + 16} ${y + 9} Q${x + 22} ${y + 4} ${x + 27} ${y + 8}" ${common}/>
    `;
  }

  if (type === "GRILL") {
    return `
      <path d="M${x - 22} ${y + 14} H${x + 22} M${x - 16} ${y + 14} V${y + 24} M${x + 16} ${y + 14} V${y + 24} M${x - 18} ${y - 6} H${x + 18} V${y + 10} H${x - 18} Z M${x - 11} ${y - 6} V${y - 17} M${x} ${y - 6} V${y - 20} M${x + 11} ${y - 6} V${y - 17}" ${common}/>
    `;
  }

  if (type === "PARK") {
    return `
      <circle cx="${x}" cy="${y}" r="21" fill="none" stroke="${stroke}" stroke-width="3"/>
      <text x="${x}" y="${y + 9}" text-anchor="middle" font-size="27" font-family="Arial, Helvetica, sans-serif" fill="${stroke}" font-weight="900">P</text>
    `;
  }

  return `
    <circle cx="${x}" cy="${y}" r="20" fill="none" stroke="${stroke}" stroke-width="3"/>
    <path d="M${x - 8} ${y} L${x - 2} ${y + 7} L${x + 10} ${y - 9}" ${common}/>
  `;
}

function getAmenityIcon(label) {
  const text = String(label || "").toLowerCase();

  if (text.includes("wifi")) return "WIFI";
  if (text.includes("beach") || text.includes("ocean")) return "BEACH";
  if (text.includes("pool") || text.includes("hot tub")) return "POOL";
  if (text.includes("grill")) return "GRILL";
  if (text.includes("parking")) return "PARK";

  return "CHECK";
}

function factCard(type, label, x) {
  return `
    <rect x="${x}" y="915" width="290" height="82" rx="16" fill="${COLORS.white}"/>
    ${icon(type, x + 42, 954, COLORS.tealDark)}
    <text x="${x + 79}" y="964" font-size="22" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="800">${escapeXml(label)}</text>
  `;
}

function amenityPill(label, x, y) {
  const displayLabel =
    String(label || "").toLowerCase().includes("private pool") &&
    String(label || "").toLowerCase().includes("not heated")
      ? "Private Pool*"
      : label;
  const fontSize = String(displayLabel || "").length > 21 ? 17 : 19;

  return `
    <rect x="${x}" y="${y}" width="300" height="68" rx="34" fill="${COLORS.white}"/>
    ${icon(getAmenityIcon(label), x + 42, y + 34, COLORS.tealDark)}
    <text x="${x + 82}" y="${y + 42}" font-size="${fontSize}" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="800">${escapeXml(displayLabel)}</text>
  `;
}

function formatSeasonDate(value) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  }).toUpperCase();
}

function buildOverlaySvg(flyer) {
  const amenities = (flyer.highlights || []).slice(0, 5);
  const isLastMinute = flyer.type === "last-minute";
  const headline = isLastMinute ? "LAST MINUTE DEALS" : "WINTER SPECIAL";
  const locationLine = isLastMinute
    ? `COASTAL GETAWAY IN ${String(flyer.location || "").toUpperCase()}`
    : `COASTAL WINTER RENTAL IN ${String(flyer.location || "").toUpperCase()}`;
  const detailLine = isLastMinute
    ? "LIMITED DATES AVAILABLE  |  LINKS IN POST"
    : `${formatSeasonDate(flyer.startDate)} - ${formatSeasonDate(flyer.endDate)}`;
  const benefits = isLastMinute
    ? ["FREE STARTUP ESSENTIAL ITEMS", "LINENS & TOWELS INCLUDED"]
    : ["ALL UTILITIES INCLUDED", "FREE STARTUP ESSENTIAL ITEMS", "LINENS & TOWELS INCLUDED"];
  const poolNote = amenities.some((label) =>
    String(label).toLowerCase().includes("not heated")
  )
    ? "* Private pool is not heated."
    : "";

  return `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${HERO_HEIGHT}" width="${WIDTH}" height="${HEIGHT - HERO_HEIGHT}" fill="${COLORS.aqua}"/>
      <rect x="0" y="${HERO_HEIGHT}" width="${WIDTH}" height="146" fill="${COLORS.tealDark}"/>
      <text x="56" y="652" font-size="${isLastMinute ? 51 : 56}" font-family="Georgia, serif" fill="${COLORS.white}" font-weight="900">${escapeXml(headline)}</text>
      <text x="58" y="701" font-size="28" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.gold}" font-weight="900">BOOK NOW &amp; SAVE!</text>

      <path d="M787 ${HERO_HEIGHT} H1080 V814 H840 L787 761 Z" fill="${COLORS.coral}"/>
      ${isLastMinute
        ? `
          <text x="937" y="649" text-anchor="middle" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" font-weight="900">LIMITED OPENINGS</text>
          <text x="937" y="711" text-anchor="middle" font-size="38" font-family="Georgia, serif" fill="${COLORS.white}" font-weight="900">BOOK TODAY</text>
          <text x="937" y="761" text-anchor="middle" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" font-weight="900">DATES FILL FAST</text>
        `
        : `
          <text x="937" y="635" text-anchor="middle" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" font-weight="900">WINTER SPECIAL</text>
          <text x="937" y="695" text-anchor="middle" font-size="52" font-family="Georgia, serif" fill="${COLORS.white}" font-weight="900">${escapeXml(flyer.monthlyRate)}</text>
          <text x="937" y="729" text-anchor="middle" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" font-weight="900">PER MONTH</text>
          <text x="937" y="771" text-anchor="middle" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.white}" font-weight="900">ONE MONTH MIN</text>
        `}

      <rect x="56" y="784" width="688" height="94" rx="18" fill="${COLORS.white}"/>
      <text x="88" y="824" font-size="22" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.tealDark}" font-weight="900">${escapeXml(locationLine)}</text>
      <text x="88" y="856" font-size="20" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.text}" font-weight="700">${escapeXml(detailLine)}</text>

      ${factCard("BED", `${flyer.bedrooms || "-"} Bedrooms`, 56)}
      ${factCard("BATH", `${flyer.bathrooms || "-"} Bathrooms`, 395)}
      ${factCard("GUEST", `Sleeps ${flyer.sleeps || "-"}`, 734)}

      <text x="56" y="1044" font-size="23" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.navy}" font-weight="900">FOR YOUR STAY</text>
      ${amenities.map((label, index) => {
        const column = index % 3;
        const row = Math.floor(index / 3);

        return amenityPill(label, 56 + column * 334, 1081 + row * 87);
      }).join("")}

      ${benefits.map((label, index) => {
        const width = isLastMinute ? 467 : 300;
        const gap = isLastMinute ? 22 : 18;
        const x = 56 + index * (width + gap);

        return `
          <rect x="${x}" y="1240" width="${width}" height="42" rx="21" fill="${COLORS.navy}"/>
          <text x="${x + width / 2}" y="1267" text-anchor="middle" font-size="${isLastMinute ? 17 : 15}" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.gold}" font-weight="900">${escapeXml(label)}</text>
        `;
      }).join("")}
      <text x="56" y="1305" font-size="15" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.muted}">${escapeXml(poolNote)}</text>
      <text x="540" y="1332" text-anchor="middle" font-size="20" font-family="Arial, Helvetica, sans-serif" fill="${COLORS.navy}" font-weight="900">OCEANVACATIONSMB.COM</text>
    </svg>
  `;
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

async function makeFullPropertyImage(url) {
  const imageBuffer = await downloadImageBuffer(url);
  const background = await sharp(imageBuffer)
    .rotate()
    .resize(WIDTH, HERO_HEIGHT, {
      fit: "cover",
      position: "center"
    })
    .blur(18)
    .jpeg({ quality: 90 })
    .toBuffer();
  const image = await sharp(imageBuffer)
    .rotate()
    .resize(WIDTH, HERO_HEIGHT, {
      fit: "contain",
      background: {
        r: 0,
        g: 0,
        b: 0,
        alpha: 0
      }
    })
    .png()
    .toBuffer();

  return {
    background,
    image
  };
}

export async function createWinterFlyer(flyer) {
  if (!flyer.photoUrl) {
    throw new Error("No property image found for winter flyer");
  }

  const propertyImage = await makeFullPropertyImage(flyer.photoUrl);
  const outputPath = path.join(
    os.tmpdir(),
    `winter-flyer-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
  );

  await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: COLORS.aqua
    }
  })
    .composite([
      {
        input: propertyImage.background,
        top: 0,
        left: 0
      },
      {
        input: propertyImage.image,
        top: 0,
        left: 0
      },
      {
        input: Buffer.from(buildOverlaySvg(flyer)),
        top: 0,
        left: 0
      }
    ])
    .png()
    .toFile(outputPath);

  return {
    localFilePath: outputPath
  };
}

export async function createLastMinuteFlyer(flyer) {
  return createWinterFlyer({
    ...flyer,
    type: "last-minute"
  });
}

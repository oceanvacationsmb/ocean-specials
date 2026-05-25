import express from "express";
import cors from "cors";

import {
  testGuestyConnection,
  getListingCalendar,
  createReservationQuote,
  getAllListings
} from "./services/guestyApi.js";

import { findAvailableGaps } from "./services/gapFinder.js";
import { getTotalFromQuote, applyDiscount } from "./services/priceHelper.js";
import { generateSpecials } from "./services/specialGenerator.js";

import {
  getManagedProperties,
  saveManagedProperty
} from "./services/propertyManager.js";

const app = express();

app.use(cors());
app.use(express.json());

const facebookGroups = [
  {
    name: "SC Airbnb STR",
    url: "https://www.facebook.com/groups/sc.airbnb.str"
  },
  {
    name: "Group 2",
    url: "https://www.facebook.com/groups/1113712659905398"
  },
  {
    name: "Group 3",
    url: "https://www.facebook.com/groups/2736252166756091"
  },
  {
    name: "Group 4",
    url: "https://www.facebook.com/groups/264018952933987"
  }
];

function safe(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

app.get("/", (req, res) => {
  res.send(`
    <h1>Ocean Specials</h1>
    <p>Server is running.</p>
    <p><a href="/properties">Open Properties Dashboard</a></p>
    <p><a href="/specials">Open Specials Page</a></p>
  `);
});

app.get("/api/test", (req, res) => {
  res.json({
    ok: true,
    message: "Ocean Specials API is working"
  });
});

app.get("/api/guesty/test", async (req, res) => {
  try {
    const result = await testGuestyConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

app.get("/api/guesty/listings-test", async (req, res) => {
  try {
    const listings = await getAllListings();

    res.json({
      ok: true,
      listings
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

app.get("/api/properties", async (req, res) => {
  try {
    const properties = await getManagedProperties();

    res.json({
      ok: true,
      count: properties.length,
      properties
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

app.post("/api/properties/save", async (req, res) => {
  try {
    const { listingId, ...data } = req.body;

    if (!listingId) {
      return res.status(400).json({
        ok: false,
        error: "Missing listingId"
      });
    }

    const saved = await saveManagedProperty(listingId, data);

    res.json({
      ok: true,
      listingId,
      saved
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

app.get("/properties", async (req, res) => {
  try {
    const properties = await getManagedProperties();

    const cards = properties
      .map((property) => {
        return `
          <div class="card" data-listing-id="${safe(property.listingId)}">
            <div class="card-head" onclick="toggleCard(this)">
              <div class="main-info">
                <div class="property-title">
                  ${safe(property.shortId)} | ${safe(property.title)}
                </div>
                <div class="small">
                  ${safe(property.city)} • ${safe(property.bedrooms)}BR • Sleeps ${safe(property.sleeps)}
                </div>
                <div class="small">
                  Listing ID: ${safe(property.listingId)}
                </div>
              </div>

              <div class="${property.active ? "status active" : "status inactive"}">
                ${property.active ? "Active" : "Inactive"}
              </div>
            </div>

            <div class="card-body">
              ${
                property.picture
                  ? `<img class="property-image" src="${safe(property.picture)}" />`
                  : ""
              }

              <div class="grid">
                <label>
                  Short ID
                  <input class="shortId" value="${safe(property.shortId)}" />
                </label>

                <label>
                  Active
                  <select class="activeField">
                    <option value="false" ${property.active ? "" : "selected"}>No</option>
                    <option value="true" ${property.active ? "selected" : ""}>Yes</option>
                  </select>
                </label>

                <label>
                  Min Nights
                  <input class="minNights" type="number" value="${safe(property.minNights)}" />
                </label>

                <label>
                  Max Nights
                  <input class="maxNights" type="number" value="${safe(property.maxNights)}" />
                </label>

                <label>
                  Scan Days
                  <input class="scanDays" type="number" value="${safe(property.scanDays)}" />
                </label>
              </div>

              <label>
                Selling Points
                <input class="sellingPoints" value="${safe(property.sellingPoints)}" placeholder="Private Pool • Walk to Beach • Sleeps 18" />
              </label>

              <label>
                Direct Booking URL
                <input class="directBookingUrl" value="${safe(property.directBookingUrl)}" placeholder="https://oceanvacationsmb.guestybookings.com/..." />
              </label>

              <label>
                VRBO URL
                <input class="vrboUrl" value="${safe(property.vrboUrl)}" placeholder="https://www.vrbo.com/..." />
              </label>

              <label>
                Airbnb URL
                <input class="airbnbUrl" value="${safe(property.airbnbUrl)}" placeholder="https://www.airbnb.com/rooms/..." />
              </label>

              <button onclick="saveProperty(this)">Save Property</button>
              <span class="save-status"></span>
            </div>
          </div>
        `;
      })
      .join("");

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Properties Dashboard</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />

          <style>
            body {
              font-family: Arial, sans-serif;
              background: #f5f7f8;
              margin: 0;
              padding: 16px;
              color: #102a43;
            }

            .header {
              max-width: 1050px;
              margin: 0 auto 14px auto;
            }

            h1 {
              font-size: 24px;
              margin: 0 0 6px 0;
              color: #082b45;
            }

            .sub {
              color: #607080;
              font-size: 14px;
              margin-bottom: 10px;
            }

            .nav {
              display: flex;
              gap: 8px;
              flex-wrap: wrap;
              margin-top: 10px;
            }

            .nav a {
              background: #082b45;
              color: white;
              text-decoration: none;
              padding: 8px 12px;
              border-radius: 8px;
              font-size: 14px;
              font-weight: 700;
            }

            .card {
              background: white;
              border-radius: 12px;
              max-width: 1050px;
              margin: 0 auto 10px auto;
              box-shadow: 0 3px 12px rgba(0,0,0,0.06);
              border: 1px solid #e1e8ed;
              overflow: hidden;
            }

            .card-head {
              padding: 13px 14px;
              display: flex;
              justify-content: space-between;
              gap: 10px;
              cursor: pointer;
              align-items: flex-start;
            }

            .property-title {
              font-size: 16px;
              font-weight: 800;
              color: #082b45;
              line-height: 1.35;
            }

            .small {
              font-size: 13px;
              color: #546a7b;
              margin-top: 4px;
              line-height: 1.35;
            }

            .status {
              padding: 5px 9px;
              border-radius: 999px;
              color: white;
              font-size: 12px;
              font-weight: 800;
              white-space: nowrap;
            }

            .active {
              background: #0b8a42;
            }

            .inactive {
              background: #9aa6af;
            }

            .card-body {
              display: none;
              border-top: 1px solid #e1e8ed;
              padding: 14px;
            }

            .card.open .card-body {
              display: block;
            }

            .property-image {
              width: 100%;
              max-height: 230px;
              object-fit: cover;
              border-radius: 10px;
              margin-bottom: 12px;
            }

            .grid {
              display: grid;
              grid-template-columns: repeat(5, 1fr);
              gap: 10px;
            }

            label {
              display: block;
              font-size: 13px;
              font-weight: 800;
              color: #082b45;
              margin-bottom: 10px;
            }

            input,
            select {
              width: 100%;
              box-sizing: border-box;
              padding: 9px 10px;
              border-radius: 8px;
              border: 1px solid #cfd8df;
              margin-top: 5px;
              font-size: 14px;
              background: white;
            }

            button {
              background: #007f8f;
              color: white;
              border: none;
              padding: 10px 14px;
              border-radius: 8px;
              font-size: 14px;
              cursor: pointer;
              font-weight: 800;
            }

            button:hover {
              opacity: 0.92;
            }

            .save-status {
              margin-left: 8px;
              font-size: 13px;
              font-weight: 800;
              color: #0b8a42;
            }

            @media (max-width: 800px) {
              body {
                padding: 10px;
              }

              .card-head {
                flex-direction: column;
              }

              .grid {
                grid-template-columns: 1fr;
              }

              button {
                width: 100%;
              }

              .save-status {
                display: block;
                margin: 8px 0 0 0;
              }
            }
          </style>
        </head>

        <body>
          <div class="header">
            <h1>Properties Dashboard</h1>
            <div class="sub">
              Loaded ${properties.length} properties from Guesty. Click a property to edit the missing marketing info.
            </div>

            <div class="nav">
              <a href="/specials">Open Specials</a>
              <a href="/api/properties">View API Data</a>
            </div>
          </div>

          ${cards}

          <script>
            function toggleCard(head) {
              const card = head.closest(".card");
              card.classList.toggle("open");
            }

            async function saveProperty(button) {
              const card = button.closest(".card");
              const status = card.querySelector(".save-status");

              const data = {
                listingId: card.dataset.listingId,
                shortId: card.querySelector(".shortId").value.trim(),
                active: card.querySelector(".activeField").value === "true",
                sellingPoints: card.querySelector(".sellingPoints").value.trim(),
                directBookingUrl: card.querySelector(".directBookingUrl").value.trim(),
                airbnbUrl: card.querySelector(".airbnbUrl").value.trim(),
                vrboUrl: card.querySelector(".vrboUrl").value.trim(),
                minNights: Number(card.querySelector(".minNights").value || 2),
                maxNights: Number(card.querySelector(".maxNights").value || 7),
                scanDays: Number(card.querySelector(".scanDays").value || 30)
              };

              button.disabled = true;
              button.innerText = "Saving...";
              status.innerText = "";

              try {
                const response = await fetch("/api/properties/save", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify(data)
                });

                const result = await response.json();

                if (!result.ok) {
                  throw new Error(result.error || "Save failed");
                }

                status.innerText = "Saved";
                button.innerText = "Saved";

                setTimeout(() => {
                  button.innerText = "Save Property";
                  button.disabled = false;
                }, 1200);
              } catch (error) {
                status.innerText = error.message;
                status.style.color = "#b00020";
                button.innerText = "Save Property";
                button.disabled = false;
              }
            }
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(`
      <h1>Error loading properties</h1>
      <p>${safe(error.message)}</p>
      <pre>${safe(JSON.stringify(error.response?.data || {}, null, 2))}</pre>
    `);
  }
});

app.get("/api/guesty/listings-simple", async (req, res) => {
  try {
    const properties = await getManagedProperties();

    res.json({
      ok: true,
      count: properties.length,
      listings: properties
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

app.get("/api/guesty/calendar-test", async (req, res) => {
  try {
    const listingId = "68db1a3f34efe70012fd1284";

    const result = await getListingCalendar(
      listingId,
      "2026-05-25",
      "2026-06-25"
    );

    res.json({
      ok: true,
      listingId,
      result
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

app.get("/api/specials/gaps-test", async (req, res) => {
  try {
    const listingId = "68db1a3f34efe70012fd1284";

    const calendar = await getListingCalendar(
      listingId,
      "2026-05-25",
      "2026-06-25"
    );

    const gaps = findAvailableGaps(calendar, 2, 7);

    res.json({
      ok: true,
      listingId,
      count: gaps.length,
      gaps
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

app.get("/api/guesty/quote-test", async (req, res) => {
  try {
    const listingId = "68db1a3f34efe70012fd1284";

    const quote = await createReservationQuote({
      listingId,
      checkInDateLocalized: "2026-05-26",
      checkOutDateLocalized: "2026-05-28",
      guestsCount: 18
    });

    res.json({
      ok: true,
      listingId,
      checkIn: "2026-05-26",
      checkOut: "2026-05-28",
      guestsCount: 18,
      quote
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

app.get("/api/specials/price-test", async (req, res) => {
  try {
    const listingId = "68db1a3f34efe70012fd1284";
    const discountPercent = 15;

    const quote = await createReservationQuote({
      listingId,
      checkInDateLocalized: "2026-05-26",
      checkOutDateLocalized: "2026-05-28",
      guestsCount: 18
    });

    const price = getTotalFromQuote(quote);

    if (!price) {
      return res.status(500).json({
        ok: false,
        error: "Could not find total price in Guesty quote",
        quote
      });
    }

    const discount = applyDiscount(price.regularTotal, discountPercent);

    res.json({
      ok: true,
      listingId,
      checkIn: "2026-05-26",
      checkOut: "2026-05-28",
      guestsCount: 18,
      discountPercent,
      price,
      discount,
      summary: {
        regularTotal: price.regularTotal,
        discountAmount: discount.discountAmount,
        specialTotal: discount.specialTotal
      }
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

app.get("/api/specials/generate", async (req, res) => {
  try {
    const result = await generateSpecials();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

app.get("/specials", async (req, res) => {
  try {
    const result = await generateSpecials();

    const groupButtons = facebookGroups
      .map((group) => {
        return `
          <button class="group-button" onclick="copyAndOpen(this, '${group.url}')">
            Copy + Open ${group.name}
          </button>
        `;
      })
      .join("");

    const cards = result.propertyPosts
      .map((post) => {
        return `
          <div class="card">
            <div class="top-row">
              <div>
                <div class="property-title">
                  ${safe(post.propertyId)} | ${safe(post.openingsCount)} openings found
                </div>
                <div class="small">
                  ${safe(post.propertyTitle)}
                </div>
              </div>
              <div class="badge">${safe(post.location)}</div>
            </div>

            <button class="expand-button" onclick="toggleMessage(this)">
              Expand Message
            </button>

            <textarea readonly>${safe(post.facebookText)}</textarea>

            <div class="button-row">
              <button onclick="copyText(this)">Copy Full Post</button>
              ${groupButtons}
            </div>
          </div>
        `;
      })
      .join("");

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Ocean Specials</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />

          <style>
            body {
              font-family: Arial, sans-serif;
              background: #f5f7f8;
              margin: 0;
              padding: 16px;
              color: #102a43;
            }

            .header {
              max-width: 960px;
              margin: 0 auto 14px auto;
            }

            h1 {
              font-size: 22px;
              margin: 0 0 4px 0;
              color: #082b45;
            }

            .sub {
              color: #607080;
              font-size: 14px;
            }

            .nav {
              display: flex;
              gap: 8px;
              flex-wrap: wrap;
              margin-top: 10px;
            }

            .nav a {
              background: #082b45;
              color: white;
              text-decoration: none;
              padding: 8px 12px;
              border-radius: 8px;
              font-size: 14px;
              font-weight: 700;
            }

            .card {
              background: white;
              border-radius: 12px;
              padding: 14px;
              max-width: 960px;
              margin: 0 auto 12px auto;
              box-shadow: 0 3px 12px rgba(0,0,0,0.06);
              border: 1px solid #e1e8ed;
            }

            .top-row {
              display: flex;
              justify-content: space-between;
              gap: 10px;
              align-items: flex-start;
            }

            .property-title {
              font-size: 16px;
              font-weight: 700;
              color: #082b45;
              line-height: 1.35;
            }

            .small {
              font-size: 13px;
              color: #546a7b;
              margin-top: 5px;
              line-height: 1.35;
            }

            .badge {
              background: #007f8f;
              color: white;
              padding: 5px 9px;
              border-radius: 999px;
              font-size: 12px;
              font-weight: 700;
              white-space: nowrap;
            }

            .expand-button {
              margin-top: 10px;
              background: #607080;
            }

            textarea {
              display: none;
              width: 100%;
              height: 260px;
              border: 1px solid #cfd8df;
              border-radius: 10px;
              padding: 10px;
              font-size: 14px;
              box-sizing: border-box;
              margin-top: 10px;
              line-height: 1.4;
              resize: vertical;
              background: #fbfdfe;
            }

            .card.open textarea {
              display: block;
            }

            .button-row {
              display: flex;
              flex-wrap: wrap;
              gap: 8px;
              margin-top: 8px;
            }

            button {
              background: #082b45;
              color: white;
              border: none;
              padding: 9px 13px;
              border-radius: 8px;
              font-size: 14px;
              cursor: pointer;
              font-weight: 700;
            }

            button:hover {
              opacity: 0.92;
            }

            .group-button {
              background: #1877f2;
            }

            .empty {
              max-width: 960px;
              margin: 0 auto;
              background: white;
              padding: 16px;
              border-radius: 12px;
              border: 1px solid #e1e8ed;
            }

            @media (max-width: 650px) {
              body {
                padding: 10px;
              }

              .top-row {
                flex-direction: column;
              }

              .badge {
                width: fit-content;
              }

              textarea {
                height: 300px;
              }

              button {
                width: 100%;
              }
            }
          </style>
        </head>

        <body>
          <div class="header">
            <h1>Ocean Vacations Specials</h1>
            <div class="sub">
              One card per property. Copy once, paste once.
            </div>

            <div class="nav">
              <a href="/properties">Properties Dashboard</a>
              <a href="/api/specials/generate">View Raw Specials</a>
            </div>
          </div>

          ${cards || `<div class="empty">No property specials found right now.</div>`}

          <script>
            function toggleMessage(button) {
              const card = button.closest(".card");
              card.classList.toggle("open");
              button.innerText = card.classList.contains("open")
                ? "Hide Message"
                : "Expand Message";
            }

            function getTextareaFromButton(button) {
              return button.closest(".card").querySelector("textarea");
            }

            function copyTextarea(textarea) {
              textarea.style.display = "block";
              textarea.select();
              textarea.setSelectionRange(0, 999999);
              document.execCommand("copy");
            }

            function copyText(button) {
              const textarea = getTextareaFromButton(button);
              copyTextarea(textarea);

              button.innerText = "Copied";
              setTimeout(() => {
                button.innerText = "Copy Full Post";
              }, 1500);
            }

            function copyAndOpen(button, url) {
              const textarea = getTextareaFromButton(button);
              copyTextarea(textarea);

              button.innerText = "Copied + Opening";
              window.open(url, "_blank");

              setTimeout(() => {
                button.innerText = "Copy + Open Group";
              }, 1500);
            }
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(`
      <h1>Error</h1>
      <p>${safe(error.message)}</p>
      <pre>${safe(JSON.stringify(error.response?.data || {}, null, 2))}</pre>
    `);
  }
});

const port = process.env.PORT || 10000;

app.listen(port, () => {
  console.log(`Ocean Specials running on port ${port}`);
});

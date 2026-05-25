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

app.get("/", (req, res) => {
  res.send(`
    <h1>Ocean Specials</h1>
    <p>Server is running.</p>
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

app.get("/api/guesty/listings-simple", async (req, res) => {
  try {
    const data = await getAllListings();

    const rawListings =
      data.results ||
      data.listings ||
      data.data ||
      data.items ||
      data;

    const listings = Array.isArray(rawListings) ? rawListings : [];

    const simpleListings = listings.map((listing) => {
      return {
        listingId: listing._id || listing.id || "",
        nickname:
          listing.nickname ||
          listing.title ||
          listing.name ||
          listing.publicName ||
          "",
        title:
          listing.title ||
          listing.nickname ||
          listing.name ||
          listing.publicName ||
          "",
        bedrooms:
          listing.bedrooms ||
          listing.bedroomsCount ||
          listing.accommodates?.bedrooms ||
          "",
        sleeps:
          listing.accommodates ||
          listing.guests ||
          listing.personCapacity ||
          listing.occupancy ||
          listing.terms?.maxOccupancy ||
          "",
        city:
          listing.address?.city ||
          listing.location?.city ||
          listing.city ||
          "",
        address:
          listing.address?.full ||
          listing.address?.street ||
          listing.address ||
          "",
        picture:
          listing.picture?.regular ||
          listing.picture?.large ||
          listing.picture ||
          listing.pictures?.[0]?.regular ||
          listing.pictures?.[0]?.large ||
          listing.pictures?.[0]?.url ||
          "",
        active:
          listing.active !== false &&
          listing.isListed !== false &&
          listing.status !== "inactive"
      };
    });

    res.json({
      ok: true,
      count: simpleListings.length,
      listings: simpleListings
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
                  ${post.propertyId} | ${post.openingsCount} openings found
                </div>
                <div class="small">
                  ${post.propertyTitle}
                </div>
              </div>
              <div class="badge">${post.location}</div>
            </div>

            <textarea readonly>${post.facebookText}</textarea>

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

            textarea {
              width: 100%;
              height: 520px;
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
                height: 520px;
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
          </div>

          ${cards || `<div class="empty">No property specials found right now.</div>`}

          <script>
            function getTextareaFromButton(button) {
              return button.closest(".card").querySelector("textarea");
            }

            function copyTextarea(textarea) {
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
                button.innerText = button.innerText.replace("Copied + Opening", "Copy + Open Group");
              }, 1500);
            }
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(`
      <h1>Error</h1>
      <p>${error.message}</p>
      <pre>${JSON.stringify(error.response?.data || {}, null, 2)}</pre>
    `);
  }
});

const port = process.env.PORT || 10000;

app.listen(port, () => {
  console.log(`Ocean Specials running on port ${port}`);
});

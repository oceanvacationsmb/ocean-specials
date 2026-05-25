import express from "express";
import cors from "cors";
import { testGuestyConnection, getListingCalendar, createReservationQuote } from "./services/guestyApi.js";
import { findAvailableGaps } from "./services/gapFinder.js";
import { getTotalFromQuote, applyDiscount } from "./services/priceHelper.js";
import { generateSpecials } from "./services/specialGenerator.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send(`
    <h1>Ocean Specials</h1>
    <p>Server is running.</p>
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

app.get("/api/guesty/quote-test", async (req, res) => {
  // old quote test code here
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

    const cards = result.specials
      .map((special) => {
        if (!special.ok) {
          return `
            <div class="card error">
              <h2>${special.propertyId}</h2>
              <p>Could not create special for ${special.checkIn} to ${special.checkOut}</p>
              <p>${special.error || ""}</p>
            </div>
          `;
        }

        return `
          <div class="card">
            <div class="badge">${special.promoType}</div>
            <h2>${special.propertyTitle}</h2>
            <p class="location">${special.location}</p>

            <div class="dates">
              ${special.checkInNice} to ${special.checkOutNice}
            </div>

            <p>${special.nights} nights • ${special.bedrooms}BR • Sleeps ${special.sleeps}</p>
            <p>${special.sellingPoints.join(" • ")}</p>

            <div class="price-box">
              <p>Regular Total: <strong>${special.regularTotalFormatted}</strong></p>
              <p>Discount: <strong>${special.discountPercent}% off</strong></p>
              <p class="special-price">Special Direct Price: <strong>${special.specialTotalFormatted}</strong></p>
            </div>

            <textarea readonly>${special.facebookText}</textarea>

            <button onclick="copyText(this)">Copy Facebook Text</button>
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
              background: #f4f7f8;
              margin: 0;
              padding: 30px;
              color: #123;
            }

            h1 {
              margin-bottom: 5px;
            }

            .sub {
              color: #567;
              margin-bottom: 25px;
            }

            .card {
              background: white;
              border-radius: 16px;
              padding: 24px;
              max-width: 760px;
              margin-bottom: 24px;
              box-shadow: 0 8px 24px rgba(0,0,0,0.08);
              border: 1px solid #e6eef2;
            }

            .badge {
              display: inline-block;
              background: #007f8f;
              color: white;
              padding: 8px 14px;
              border-radius: 999px;
              font-weight: bold;
              margin-bottom: 12px;
            }

            .location {
              color: #567;
              margin-top: -8px;
            }

            .dates {
              font-size: 28px;
              font-weight: bold;
              color: #082b45;
              margin: 18px 0;
            }

            .price-box {
              background: #eef8f9;
              padding: 16px;
              border-radius: 12px;
              margin: 18px 0;
            }

            .special-price {
              font-size: 22px;
              color: #007f8f;
            }

            textarea {
              width: 100%;
              height: 260px;
              border: 1px solid #ccd;
              border-radius: 12px;
              padding: 14px;
              font-size: 15px;
              box-sizing: border-box;
              margin-top: 10px;
            }

            button {
              margin-top: 12px;
              background: #082b45;
              color: white;
              border: none;
              padding: 14px 18px;
              border-radius: 10px;
              font-size: 16px;
              cursor: pointer;
            }

            .error {
              border-color: #f0b4b4;
            }
          </style>
        </head>
        <body>
          <h1>Ocean Vacations Specials</h1>
          <div class="sub">
            Generated from Guesty availability and pricing.
          </div>

          ${cards || "<p>No specials found right now.</p>"}

          <script>
            function copyText(button) {
              const textarea = button.previousElementSibling;
              textarea.select();
              document.execCommand("copy");
              button.innerText = "Copied";
              setTimeout(() => button.innerText = "Copy Facebook Text", 1500);
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

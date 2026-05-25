import express from "express";
import cors from "cors";
import { testGuestyConnection, getListingCalendar, createReservationQuote } from "./services/guestyApi.js";
import { findAvailableGaps } from "./services/gapFinder.js";
import { getTotalFromQuote, applyDiscount } from "./services/priceHelper.js";

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

const port = process.env.PORT || 10000;

app.listen(port, () => {
  console.log(`Ocean Specials running on port ${port}`);
});

import express from "express";
import cors from "cors";
import { testGuestyConnection, getListingCalendar } from "./services/guestyApi.js";

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

const port = process.env.PORT || 10000;

app.listen(port, () => {
  console.log(`Ocean Specials running on port ${port}`);
});

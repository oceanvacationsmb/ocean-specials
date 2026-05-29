import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const GUESTY_BASE_URL =
  process.env.GUESTY_BASE_URL ||
  "https://open-api.guesty.com/v1";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanToken(value) {
  return String(value || "")
    .trim()
    .replace(/^Bearer\s+/i, "")
    .trim();
}

function getManualGuestyToken() {
  const token =
    process.env.GUESTY_ACCESS_TOKEN ||
    process.env.GUESTY_TOKEN ||
    process.env.GUESTY_API_KEY ||
    process.env.GUESTY_API_TOKEN ||
    "";

  const clean = cleanToken(token);

  if (!clean) {
    throw new Error(
      "Missing Guesty token. Add GUESTY_ACCESS_TOKEN in Render environment variables."
    );
  }

  return clean;
}

function getRetryAfterMs(error, fallbackMs = 10000) {
  const retryAfter = error.response?.headers?.["retry-after"];

  if (!retryAfter) {
    return fallbackMs;
  }

  const seconds = Number(retryAfter);

  if (!Number.isNaN(seconds) && seconds > 0) {
    return seconds * 1000;
  }

  const dateMs = new Date(retryAfter).getTime();

  if (!Number.isNaN(dateMs)) {
    const waitMs = dateMs - Date.now();

    if (waitMs > 0) {
      return waitMs;
    }
  }

  return fallbackMs;
}

async function guestyRequest(config, options = {}) {
  const {
    retry429 = true,
    max429Retries = 5
  } = options;

  let attempt = 0;

  while (true) {
    attempt++;

    const token = getManualGuestyToken();

    try {
      const response = await axios({
        baseURL: GUESTY_BASE_URL,
        timeout: 60000,
        ...config,
        headers: {
          ...(config.headers || {}),
          Authorization: `Bearer ${token}`
        }
      });

      return response.data;
    } catch (error) {
      const status = error.response?.status;

      if (status === 401) {
        throw new Error(
          "Guesty token is expired or invalid. Update GUESTY_ACCESS_TOKEN in Render with a fresh token."
        );
      }

      if (status === 429 && retry429 && attempt <= max429Retries) {
        const waitMs = getRetryAfterMs(error, attempt * 15000);

        console.log(
          `Guesty returned 429. Waiting ${waitMs}ms before retry ${attempt}/${max429Retries}.`
        );

        await sleep(waitMs);
        continue;
      }

      throw error;
    }
  }
}

export async function testGuestyConnection() {
  return guestyRequest({
    method: "GET",
    url: "/listings",
    params: {
      limit: 1
    }
  });
}

export async function getAllListings() {
  return guestyRequest({
    method: "GET",
    url: "/listings",
    params: {
      limit: 100
    }
  });
}

export async function getListingCalendar(listingId, startDate, endDate) {
  if (!listingId) {
    throw new Error("Missing listingId for Guesty calendar request");
  }

  return guestyRequest(
    {
      method: "GET",
      url: `/availability-pricing/api/calendar/listings/${listingId}`,
      params: {
        startDate,
        endDate
      }
    },
    {
      retry429: true,
      max429Retries: 5
    }
  );
}

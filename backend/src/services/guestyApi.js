import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const GUESTY_BASE_URL =
  process.env.GUESTY_BASE_URL ||
  "https://booking.guesty.com/api";

const GUESTY_TOKEN_URL =
  process.env.GUESTY_TOKEN_URL ||
  "https://booking.guesty.com/oauth2/token";

let accessToken = null;
let tokenExpiresAt = 0;
let tokenPromise = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCredentials() {
  const clientId = String(process.env.GUESTY_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GUESTY_CLIENT_SECRET || "").trim();

  if (!clientId || !clientSecret) {
    throw new Error("Missing GUESTY_CLIENT_ID or GUESTY_CLIENT_SECRET");
  }

  return {
    clientId,
    clientSecret
  };
}

async function getNewToken() {
  const { clientId, clientSecret } = getCredentials();

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("scope", "booking_engine:api");
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);

  const response = await axios.post(
    GUESTY_TOKEN_URL,
    body.toString(),
    {
      headers: {
        accept: "application/json",
        "cache-control": "no-cache",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      timeout: 30000
    }
  );

  const token = response.data?.access_token;
  const expiresIn = Number(response.data?.expires_in || 86400);

  if (!token) {
    throw new Error("Guesty did not return access_token");
  }

  accessToken = token;
  tokenExpiresAt = Date.now() + expiresIn * 1000 - 10 * 60 * 1000;

  return accessToken;
}

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt) {
    return accessToken;
  }

  if (!tokenPromise) {
    tokenPromise = getNewToken().finally(() => {
      tokenPromise = null;
    });
  }

  return tokenPromise;
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

  return fallbackMs;
}

async function guestyRequest(config, options = {}) {
  const maxRetries = options.maxRetries || 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const token = await getAccessToken();

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
        accessToken = null;
        tokenExpiresAt = 0;

        if (attempt < maxRetries) {
          await sleep(3000);
          continue;
        }
      }

      if (status === 429) {
        throw error;
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
    throw new Error("Missing listingId");
  }

  return guestyRequest({
    method: "GET",
    url: `/listings/${listingId}/calendar`,
    params: {
      startDate,
      endDate
    }
  });
}

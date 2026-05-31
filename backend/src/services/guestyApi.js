import axios from "axios";
import dotenv from "dotenv";

import {
  getAppSetting,
  setAppSetting
} from "./db.js";

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
let persistedTokenLoaded = false;
let requestQueue = Promise.resolve();
let nextRequestAt = 0;
let listingsCache = null;
let listingsCacheExpiresAt = 0;
let listingsPromise = null;

const TOKEN_SETTING_KEY = "guesty_booking_access_token";
const TOKEN_EXPIRY_SETTING_KEY = "guesty_booking_access_token_expires_at";
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const REQUEST_SPACING_MS = 300;
const MAX_REQUEST_RETRIES = 4;
const LISTINGS_CACHE_MS = 60 * 1000;

export async function resetGuestyToken() {
  accessToken = null;
  tokenExpiresAt = 0;
  tokenPromise = null;
  persistedTokenLoaded = true;
  listingsCache = null;
  listingsCacheExpiresAt = 0;
  listingsPromise = null;

  try {
    await Promise.all([
      setAppSetting(TOKEN_SETTING_KEY, ""),
      setAppSetting(TOKEN_EXPIRY_SETTING_KEY, "")
    ]);
  } catch (error) {
    console.warn("Unable to clear persisted Guesty token:", error.message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasReusableToken() {
  return (
    accessToken &&
    Date.now() + TOKEN_REFRESH_BUFFER_MS < tokenExpiresAt
  );
}

function getRetryAfterMs(error, attempt) {
  const header = error.response?.headers?.["retry-after"];
  const seconds = Number(header);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(500, seconds * 1000);
  }

  const retryAt = Date.parse(header || "");

  if (Number.isFinite(retryAt)) {
    return Math.max(500, retryAt - Date.now());
  }

  const exponentialDelay = Math.min(30000, 1000 * 2 ** attempt);
  const jitter = Math.floor(Math.random() * 500);

  return exponentialDelay + jitter;
}

function queueGuestyRequest(task) {
  const queued = requestQueue.then(async () => {
    const delay = Math.max(0, nextRequestAt - Date.now());

    if (delay) {
      await sleep(delay);
    }

    nextRequestAt = Date.now() + REQUEST_SPACING_MS;

    return task();
  });

  requestQueue = queued.catch(() => {});

  return queued;
}

async function loadPersistedToken() {
  if (persistedTokenLoaded) {
    return;
  }

  persistedTokenLoaded = true;

  try {
    const [savedToken, savedExpiry] = await Promise.all([
      getAppSetting(TOKEN_SETTING_KEY, ""),
      getAppSetting(TOKEN_EXPIRY_SETTING_KEY, "")
    ]);

    const expiry = Number(savedExpiry || 0);

    if (savedToken && Number.isFinite(expiry)) {
      accessToken = savedToken;
      tokenExpiresAt = expiry;
    }
  } catch (error) {
    console.warn("Unable to load persisted Guesty token:", error.message);
  }
}

async function persistToken(token, expiresAt) {
  try {
    await Promise.all([
      setAppSetting(TOKEN_SETTING_KEY, token),
      setAppSetting(TOKEN_EXPIRY_SETTING_KEY, String(expiresAt))
    ]);
  } catch (error) {
    console.warn("Unable to persist Guesty token:", error.message);
  }
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

async function getNewToken(attempt = 0) {
  const { clientId, clientSecret } = getCredentials();

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("scope", "booking_engine:api");
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);

  let response;

  try {
    response = await axios.post(
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
  } catch (error) {
    if (error.response?.status === 429 && attempt < 1) {
      await sleep(getRetryAfterMs(error, attempt));
      return getNewToken(attempt + 1);
    }

    throw error;
  }

  const token = response.data?.access_token;
  const expiresIn = Number(response.data?.expires_in || 86400);

  if (!token) {
    throw new Error("Guesty did not return access_token");
  }

  accessToken = token;
  tokenExpiresAt = Date.now() + expiresIn * 1000;

  await persistToken(accessToken, tokenExpiresAt);

  return accessToken;
}

async function getAccessToken() {
  if (hasReusableToken()) {
    return accessToken;
  }

  if (!tokenPromise) {
    tokenPromise = (async () => {
      await loadPersistedToken();

      if (hasReusableToken()) {
        return accessToken;
      }

      return getNewToken();
    })().finally(() => {
        tokenPromise = null;
      });
  }

  return tokenPromise;
}

async function guestyRequest(config) {
  let refreshedToken = false;

  for (let attempt = 0; attempt <= MAX_REQUEST_RETRIES; attempt++) {
    try {
      const token = await getAccessToken();

      const response = await queueGuestyRequest(() =>
        axios({
          baseURL: GUESTY_BASE_URL,
          timeout: 60000,
          ...config,
          headers: {
            accept: "application/json",
            ...(config.headers || {}),
            Authorization: `Bearer ${token}`
          }
        })
      );

      return response.data;
    } catch (error) {
      if (error.response?.status === 401 && !refreshedToken) {
        refreshedToken = true;
        await resetGuestyToken();
        await sleep(1000);
        continue;
      }

      if (
        error.response?.status === 429 &&
        attempt < MAX_REQUEST_RETRIES
      ) {
        await sleep(getRetryAfterMs(error, attempt));
        continue;
      }

      const details = error.response?.data
        ? JSON.stringify(error.response.data)
        : "";

      throw new Error(
        `Guesty request failed ${error.response?.status || ""} ${details}`
      );
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
  if (listingsCache && Date.now() < listingsCacheExpiresAt) {
    return listingsCache;
  }

  if (!listingsPromise) {
    listingsPromise = guestyRequest({
      method: "GET",
      url: "/listings",
      params: {
        limit: 100
      }
    })
      .then((result) => {
        listingsCache = result;
        listingsCacheExpiresAt = Date.now() + LISTINGS_CACHE_MS;

        return result;
      })
      .finally(() => {
        listingsPromise = null;
      });
  }

  return listingsPromise;
}

export async function getListingCalendar(listingId, from, to) {
  if (!listingId) {
    throw new Error("Missing listingId");
  }

  if (!from || !to) {
    throw new Error("Missing calendar from/to dates");
  }

  return guestyRequest({
    method: "GET",
    url: `/listings/${listingId}/calendar`,
    params: {
      from,
      to
    }
  });
}

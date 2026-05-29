import axios from "axios";
import dotenv from "dotenv";

import {
  getAppSetting,
  setAppSetting
} from "./db.js";

dotenv.config();

const GUESTY_BASE_URL =
  process.env.GUESTY_BASE_URL ||
  "https://open-api.guesty.com/v1";

const GUESTY_TOKEN_URL =
  process.env.GUESTY_TOKEN_URL ||
  "https://open-api.guesty.com/oauth2/token";

let memoryAccessToken = null;
let memoryTokenExpiresAt = 0;
let tokenRequestInProgress = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getGuestyCredentials() {
  const clientId = String(process.env.GUESTY_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GUESTY_CLIENT_SECRET || "").trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing GUESTY_CLIENT_ID or GUESTY_CLIENT_SECRET in Render environment variables"
    );
  }

  return {
    clientId,
    clientSecret
  };
}

function getRetryAfterMs(error, fallbackMs = 15000) {
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

function isMemoryTokenValid() {
  return memoryAccessToken && Date.now() < memoryTokenExpiresAt;
}

async function getStoredToken() {
  const token = await getAppSetting("guesty_access_token", "");
  const expiresAtRaw = await getAppSetting("guesty_access_token_expires_at", "0");
  const expiresAt = Number(expiresAtRaw || 0);

  if (token && Date.now() < expiresAt) {
    memoryAccessToken = token;
    memoryTokenExpiresAt = expiresAt;

    return token;
  }

  return "";
}

async function saveToken(accessToken, expiresInSeconds) {
  const safetyBufferMs = 10 * 60 * 1000;
  const expiresAt = Date.now() + expiresInSeconds * 1000 - safetyBufferMs;

  memoryAccessToken = accessToken;
  memoryTokenExpiresAt = expiresAt;

  await setAppSetting("guesty_access_token", accessToken);
  await setAppSetting("guesty_access_token_expires_at", String(expiresAt));

  console.log(
    `Guesty token saved and cached. Expires in ${expiresInSeconds} seconds.`
  );

  return accessToken;
}

async function requestNewAccessToken() {
  const { clientId, clientSecret } = getGuestyCredentials();

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("scope", "open-api");

  try {
    const response = await axios.post(
      GUESTY_TOKEN_URL,
      body.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        timeout: 30000
      }
    );

    const accessToken = response.data?.access_token;
    const expiresInSeconds = Number(response.data?.expires_in || 86400);

    if (!accessToken) {
      throw new Error("Guesty token response did not include access_token");
    }

    return saveToken(accessToken, expiresInSeconds);
  } catch (error) {
    if (error.response?.status === 429) {
      const waitMs = getRetryAfterMs(error, 15 * 60 * 1000);

      throw new Error(
        `Guesty token endpoint is rate limited. Wait about ${Math.ceil(waitMs / 60000)} minutes before testing again.`
      );
    }

    throw error;
  }
}

async function getAccessToken() {
  if (isMemoryTokenValid()) {
    return memoryAccessToken;
  }

  const storedToken = await getStoredToken();

  if (storedToken) {
    return storedToken;
  }

  if (!tokenRequestInProgress) {
    tokenRequestInProgress = requestNewAccessToken()
      .finally(() => {
        tokenRequestInProgress = null;
      });
  }

  return tokenRequestInProgress;
}

async function clearStoredToken() {
  memoryAccessToken = null;
  memoryTokenExpiresAt = 0;

  await setAppSetting("guesty_access_token", "");
  await setAppSetting("guesty_access_token_expires_at", "0");
}

async function guestyRequest(config, options = {}) {
  const {
    retryAfterUnauthorized = true,
    retry429 = true,
    max429Retries = 5
  } = options;

  let attempt = 0;

  while (true) {
    attempt++;

    const token = await getAccessToken();

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

      if (status === 401 && retryAfterUnauthorized) {
        console.log("Guesty returned 401. Clearing saved token and retrying once.");

        await clearStoredToken();

        const freshToken = await getAccessToken();

        const retryResponse = await axios({
          baseURL: GUESTY_BASE_URL,
          timeout: 60000,
          ...config,
          headers: {
            ...(config.headers || {}),
            Authorization: `Bearer ${freshToken}`
          }
        });

        return retryResponse.data;
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

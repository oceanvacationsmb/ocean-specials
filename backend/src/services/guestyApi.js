import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const GUESTY_BASE_URL = "https://open-api.guesty.com/v1";
const GUESTY_TOKEN_URL = "https://open-api.guesty.com/oauth2/token";

let cachedAccessToken = null;
let cachedTokenExpiresAt = 0;
let tokenRequestInProgress = null;

function getGuestyCredentials() {
  const clientId = process.env.GUESTY_CLIENT_ID;
  const clientSecret = process.env.GUESTY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing GUESTY_CLIENT_ID or GUESTY_CLIENT_SECRET in Render environment variables");
  }

  return {
    clientId,
    clientSecret
  };
}

function isTokenStillValid() {
  if (!cachedAccessToken) {
    return false;
  }

  const now = Date.now();

  return now < cachedTokenExpiresAt;
}

async function requestNewAccessToken() {
  const { clientId, clientSecret } = getGuestyCredentials();

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("scope", "open-api");

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await axios.post(GUESTY_TOKEN_URL, body.toString(), {
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    timeout: 30000
  });

  const accessToken = response.data?.access_token;
  const expiresInSeconds = Number(response.data?.expires_in || 86400);

  if (!accessToken) {
    throw new Error("Guesty token response did not include access_token");
  }

  cachedAccessToken = accessToken;

  const safetyBufferMs = 10 * 60 * 1000;
  cachedTokenExpiresAt = Date.now() + expiresInSeconds * 1000 - safetyBufferMs;

  console.log(
    `Guesty token refreshed. Expires in ${expiresInSeconds} seconds.`
  );

  return cachedAccessToken;
}

async function getAccessToken() {
  if (isTokenStillValid()) {
    return cachedAccessToken;
  }

  if (!tokenRequestInProgress) {
    tokenRequestInProgress = requestNewAccessToken()
      .finally(() => {
        tokenRequestInProgress = null;
      });
  }

  return tokenRequestInProgress;
}

async function guestyRequest(config, retryAfterUnauthorized = true) {
  const token = await getAccessToken();

  try {
    const response = await axios({
      baseURL: GUESTY_BASE_URL,
      timeout: 45000,
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
      cachedAccessToken = null;
      cachedTokenExpiresAt = 0;

      const freshToken = await getAccessToken();

      const response = await axios({
        baseURL: GUESTY_BASE_URL,
        timeout: 45000,
        ...config,
        headers: {
          ...(config.headers || {}),
          Authorization: `Bearer ${freshToken}`
        }
      });

      return response.data;
    }

    throw error;
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
  return guestyRequest({
    method: "GET",
    url: `/availability-pricing/api/calendar/listings/${listingId}`,
    params: {
      startDate,
      endDate
    }
  });
}

import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const GUESTY_BASE_URL =
  process.env.GUESTY_BASE_URL ||
  "https://open-api.guesty.com/v1";

const GUESTY_TOKEN_URL =
  process.env.GUESTY_TOKEN_URL ||
  "https://open-api.guesty.com/oauth2/token";

let cachedAccessToken = null;
let cachedTokenExpiresAt = 0;
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

function getRetryAfterMs(error, fallbackMs = 5000) {
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

function isTokenStillValid() {
  if (!cachedAccessToken) {
    return false;
  }

  return Date.now() < cachedTokenExpiresAt;
}

function saveTokenFromResponse(response) {
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

async function requestTokenUsingBasicAuth() {
  const { clientId, clientSecret } = getGuestyCredentials();

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("scope", "open-api");

  const basicAuth = Buffer
    .from(`${clientId}:${clientSecret}`)
    .toString("base64");

  const response = await axios.post(
    GUESTY_TOKEN_URL,
    body.toString(),
    {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      timeout: 30000
    }
  );

  return saveTokenFromResponse(response);
}

async function requestTokenUsingFormBody() {
  const { clientId, clientSecret } = getGuestyCredentials();

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("scope", "open-api");

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

  return saveTokenFromResponse(response);
}

async function requestTokenUsingJsonBody() {
  const { clientId, clientSecret } = getGuestyCredentials();

  const response = await axios.post(
    GUESTY_TOKEN_URL,
    {
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "open-api"
    },
    {
      headers: {
        "Content-Type": "application/json"
      },
      timeout: 30000
    }
  );

  return saveTokenFromResponse(response);
}

async function requestNewAccessToken() {
  cachedAccessToken = null;
  cachedTokenExpiresAt = 0;

  const methods = [
    {
      name: "basic-auth",
      run: requestTokenUsingBasicAuth
    },
    {
      name: "form-body",
      run: requestTokenUsingFormBody
    },
    {
      name: "json-body",
      run: requestTokenUsingJsonBody
    }
  ];

  const errors = [];

  for (const method of methods) {
    try {
      console.log(`Trying Guesty token method: ${method.name}`);
      return await method.run();
    } catch (error) {
      const status = error.response?.status;
      const data = error.response?.data;

      errors.push({
        method: method.name,
        status,
        data
      });

      console.log(
        `Guesty token method failed: ${method.name}`,
        status || "",
        data || error.message
      );
    }
  }

  throw new Error(
    "Guesty token request failed. Check GUESTY_CLIENT_ID and GUESTY_CLIENT_SECRET. Details: " +
      JSON.stringify(errors)
  );
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

async function guestyRequest(config, options = {}) {
  const {
    retryAfterUnauthorized = true,
    retry429 = true,
    max429Retries = 4
  } = options;

  let attempt = 0;

  while (true) {
    attempt++;

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
        console.log("Guesty returned 401. Refreshing token and retrying once.");

        cachedAccessToken = null;
        cachedTokenExpiresAt = 0;

        const freshToken = await getAccessToken();

        const retryResponse = await axios({
          baseURL: GUESTY_BASE_URL,
          timeout: 45000,
          ...config,
          headers: {
            ...(config.headers || {}),
            Authorization: `Bearer ${freshToken}`
          }
        });

        return retryResponse.data;
      }

      if (status === 429 && retry429 && attempt <= max429Retries) {
        const waitMs = getRetryAfterMs(error, attempt * 6000);

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

import axios from "axios";

let cachedToken = null;
let tokenExpiresAt = 0;

const AUTH_URL = "https://booking.guesty.com/oauth2/token";
const API_BASE = "https://booking.guesty.com/api";

export async function getGuestyToken() {
  const now = Date.now();

  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const clientId = process.env.GUESTY_CLIENT_ID;
  const clientSecret = process.env.GUESTY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing Guesty Client ID or Client Secret");
  }

  const body = new URLSearchParams();
  body.append("grant_type", "client_credentials");
  body.append("scope", "booking_engine:api");
  body.append("client_id", clientId);
  body.append("client_secret", clientSecret);

  const response = await axios.post(AUTH_URL, body, {
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded"
    }
  });

  cachedToken = response.data.access_token;

  const expiresInSeconds = response.data.expires_in || 86400;
  tokenExpiresAt = now + (expiresInSeconds - 600) * 1000;

  return cachedToken;
}

export async function testGuestyConnection() {
  const token = await getGuestyToken();

  return {
    ok: true,
    message: "Guesty token received",
    tokenPreview: token.slice(0, 8) + "..."
  };
}

export async function getListingCalendar(listingId, from, to) {
  const token = await getGuestyToken();

  const response = await axios.get(`${API_BASE}/listings/${listingId}/calendar`, {
    params: {
      from,
      to
    },
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${token}`
    }
  });

  return response.data;
}

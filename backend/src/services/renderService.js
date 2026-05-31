import axios from "axios";

const RENDER_API_URL = "https://api.render.com/v1";
const ALLOWED_GUESTY_KEYS = new Set([
  "GUESTY_CLIENT_ID",
  "GUESTY_CLIENT_SECRET"
]);

function getRenderConfig() {
  const apiKey = String(process.env.RENDER_API_KEY || "").trim();
  const serviceId = String(process.env.RENDER_SERVICE_ID || "").trim();

  if (!apiKey) {
    throw new Error("RENDER_API_KEY is missing");
  }

  if (!serviceId) {
    throw new Error("RENDER_SERVICE_ID is missing");
  }

  return {
    apiKey,
    serviceId
  };
}

export function isValidDashboardAdminKey(value) {
  const configuredKey = String(process.env.DASHBOARD_ADMIN_KEY || "").trim();
  const suppliedKey = String(value || "").trim();

  return Boolean(configuredKey && suppliedKey && suppliedKey === configuredKey);
}

export async function updateRenderGuestyCredentials({
  clientId,
  clientSecret
}) {
  const { apiKey, serviceId } = getRenderConfig();

  const credentials = {
    GUESTY_CLIENT_ID: String(clientId || "").trim(),
    GUESTY_CLIENT_SECRET: String(clientSecret || "").trim()
  };

  for (const [key, value] of Object.entries(credentials)) {
    if (!ALLOWED_GUESTY_KEYS.has(key) || !value) {
      throw new Error("Both Guesty credentials are required");
    }

    await axios.put(
      `${RENDER_API_URL}/services/${encodeURIComponent(serviceId)}/env-vars/${encodeURIComponent(key)}`,
      {
        value
      },
      {
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );
  }

  process.env.GUESTY_CLIENT_ID = credentials.GUESTY_CLIENT_ID;
  process.env.GUESTY_CLIENT_SECRET = credentials.GUESTY_CLIENT_SECRET;
}

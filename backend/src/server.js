import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import {
  testGuestyConnection,
  getListingCalendar,
  getAllListings,
  resetGuestyToken
} from "./services/guestyApi.js";

import {
  getManagedProperties,
  saveManagedProperty
} from "./services/propertyManager.js";

import {
  generateSpecials,
  generateOffSeasonRentals,
  clearOffSeasonRentalsCache
} from "./services/specialGenerator.js";

import {
  regenerateOffSeasonFlyer
} from "./services/winterFlyerService.js";

import {
  getAppSetting,
  setAppSetting
} from "./services/db.js";

import {
  isValidDashboardAdminKey,
  updateRenderGuestyCredentials
} from "./services/renderService.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 10000;

const DEFAULT_FACEBOOK_GROUPS = [
  "https://www.facebook.com/groups/officialmyrtlebeach",
  "https://www.facebook.com/groups/548668215322021/",
  "https://www.facebook.com/groups/241622156398436/",
  "https://www.facebook.com/groups/1328068897918078/",
  "https://www.facebook.com/groups/264018952933987/",
  "https://www.facebook.com/groups/2736252166756091/",
  "https://www.facebook.com/groups/540977461189642/",
  "https://www.facebook.com/groups/1113712659905398/"
].join("\n");

function getScanOptions(req) {
  return {
    days: req.query.days || req.body?.days || 45
  };
}

function pageShell(title, body) {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        <style>
          body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 0;
            background: #f4f7fb;
            color: #102a43;
          }

          header {
            background: #062f53;
            color: white;
            padding: 18px 24px;
          }

          header h1 {
            margin: 0;
            font-size: 24px;
          }

          nav {
            margin-top: 10px;
          }

          nav a {
            color: white;
            margin-right: 18px;
            text-decoration: none;
            font-weight: 700;
          }

          main {
            padding: 24px;
            max-width: 1300px;
            margin: 0 auto;
          }

          .card {
            background: white;
            border-radius: 14px;
            padding: 18px;
            margin-bottom: 18px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.08);
          }

          .grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
          }

          .grid-3 {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 14px;
          }

          label {
            display: block;
            font-weight: 700;
            margin-bottom: 6px;
          }

          input,
          textarea,
          select {
            width: 100%;
            box-sizing: border-box;
            padding: 10px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            font-size: 14px;
          }

          textarea {
            min-height: 140px;
          }

          button,
          .group-link-button {
            background: #0f8f9f;
            color: white;
            border: 0;
            border-radius: 9px;
            padding: 10px 16px;
            font-weight: 800;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
          }

          .group-link-button {
            background: #062f53;
            margin: 4px 6px 4px 0;
          }

          .row {
            display: flex;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
          }

          .small {
            color: #52616f;
            font-size: 13px;
          }

          .property-header {
            display: grid;
            grid-template-columns: 140px 1fr;
            gap: 14px;
            align-items: start;
          }

          .property-header img {
            width: 140px;
            height: 100px;
            object-fit: cover;
            border-radius: 10px;
            background: #e5e7eb;
          }

          .postbox {
            width: 100%;
            min-height: 340px;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 15px;
          }

          .flyer-preview {
            width: min(100%, 360px);
            aspect-ratio: 4 / 5;
            object-fit: cover;
            border-radius: 8px;
            border: 1px solid #d5e0e8;
            background: #eef3f6;
          }

          .success {
            color: #067647;
            font-weight: 800;
          }

          .error {
            color: #b42318;
            font-weight: 800;
          }

          .tabs {
            display: flex;
            gap: 8px;
            margin-bottom: 18px;
          }

          .tab-button {
            background: #dbe7ee;
            color: #16324a;
          }

          .tab-button.active {
            background: #062f53;
            color: white;
          }

          .off-season-settings {
            padding: 16px;
            border: 1px solid #d5e0e8;
            border-radius: 9px;
            background: #f8fbfd;
          }

          @media (max-width: 850px) {
            .grid,
            .grid-3,
            .property-header {
              grid-template-columns: 1fr;
            }

            .property-header img {
              width: 100%;
              height: 220px;
            }
          }
        </style>
      </head>
      <body>
        <header>
          <h1>Ocean Vacations Specials</h1>
          <nav>
            <a href="/properties">Properties</a>
            <a href="/specials">Specials</a>
            <a href="/api/test">API Test</a>
          </nav>
        </header>
        <main>
          ${body}
        </main>
      </body>
    </html>
  `;
}

app.get("/", (req, res) => {
  res.redirect("/specials");
});

app.get("/api/test", (req, res) => {
  res.json({
    ok: true,
    app: "Ocean Specials",
    time: new Date().toISOString()
  });
});

app.get("/api/guesty/test", async (req, res) => {
  try {
    const result = await testGuestyConnection();

    res.json({
      ok: true,
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

app.get("/api/guesty/listings-test", async (req, res) => {
  try {
    const result = await getAllListings();

    res.json({
      ok: true,
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

app.get("/api/guesty/calendar-test", async (req, res) => {
  try {
    const listingId = req.query.listingId;

    if (!listingId) {
      return res.status(400).json({
        ok: false,
        error: "Missing listingId query parameter"
      });
    }

    const today = new Date();

    const from =
      req.query.from ||
      new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

    const to =
      req.query.to ||
      new Date(today.getTime() + 47 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

    const result = await getListingCalendar(listingId, from, to);

    res.json({
      ok: true,
      from,
      to,
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

app.get("/api/properties", async (req, res) => {
  try {
    const properties = await getManagedProperties();

    res.json({
      ok: true,
      count: properties.length,
      properties
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

app.put("/api/properties/:listingId", async (req, res) => {
  try {
    const listingId = req.params.listingId;
    const saved = await saveManagedProperty(listingId, req.body || {});

    res.json({
      ok: true,
      listingId,
      saved
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

app.post("/api/properties/:listingId", async (req, res) => {
  try {
    const listingId = req.params.listingId;
    const saved = await saveManagedProperty(listingId, req.body || {});

    res.json({
      ok: true,
      listingId,
      saved
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

app.put("/api/properties-bulk", async (req, res) => {
  try {
    const properties = Array.isArray(req.body?.properties)
      ? req.body.properties
      : [];

    const saved = [];

    for (const property of properties) {
      if (!property.listingId) {
        continue;
      }

      const result = await saveManagedProperty(property.listingId, property);

      saved.push({
        listingId: property.listingId,
        saved: result
      });
    }

    res.json({
      ok: true,
      count: saved.length,
      saved
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

app.get("/api/facebook-groups", async (req, res) => {
  try {
    const savedGroups = await getAppSetting("facebook_groups", "");
    const groups = savedGroups.trim() ? savedGroups : DEFAULT_FACEBOOK_GROUPS;

    res.json({
      ok: true,
      groups
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.put("/api/facebook-groups", async (req, res) => {
  try {
    const groups = req.body?.groups || "";

    await setAppSetting("facebook_groups", groups);

    res.json({
      ok: true,
      groups
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.put("/api/guesty-credentials", async (req, res) => {
  try {
    if (!isValidDashboardAdminKey(req.headers["x-dashboard-admin-key"])) {
      return res.status(401).json({
        ok: false,
        error: "Invalid dashboard access key"
      });
    }

    const clientId = String(req.body?.clientId || "").trim();
    const clientSecret = String(req.body?.clientSecret || "").trim();

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        ok: false,
        error: "Both Guesty credentials are required"
      });
    }

    await updateRenderGuestyCredentials({
      clientId,
      clientSecret
    });

    await resetGuestyToken();

    res.json({
      ok: true
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.get("/api/specials/generate", async (req, res) => {
  try {
    const result = await generateSpecials([], getScanOptions(req));
    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

app.post("/api/specials/generate", async (req, res) => {
  try {
    const result = await generateSpecials([], getScanOptions(req));
    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

app.get("/api/off-season-rentals/generate", async (req, res) => {
  try {
    const result = await generateOffSeasonRentals();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

app.post("/api/off-season-rentals/:listingId/flyer/regenerate", async (req, res) => {
  try {
    const result = await regenerateOffSeasonFlyer(req.params.listingId);

    clearOffSeasonRentalsCache();

    res.json({
      ok: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.get("/properties", (req, res) => {
  res.send(
    pageShell(
      "Properties",
      `
        <div class="card">
          <h2>Property Dashboard</h2>
          <p class="small">
            Guesty supplies the property title, bedrooms, bathrooms, sleeps, city, and main photo automatically.
            Add Airbnb and VRBO URLs only.
          </p>

          <div class="row">
            <button onclick="loadProperties()">Reload Properties</button>
            <button onclick="saveAllProperties()">Save All Properties</button>
            <span id="saveAllStatus"></span>
          </div>
        </div>

        <details class="card">
          <summary style="font-weight:800; cursor:pointer;">Facebook Groups Dashboard</summary>

          <br />

          <p class="small">
            Add, delete, or edit group links here. One group link per line. Saved on the server.
          </p>

          <textarea
            id="facebookGroups"
            style="min-height: 190px;"
            placeholder="Paste Facebook group links here, one per line"
          ></textarea>

          <br />
          <br />

          <div class="row">
            <button onclick="saveFacebookGroups()">Save Facebook Groups</button>
            <span id="facebookGroupsStatus"></span>
          </div>
        </details>

        <details class="card">
          <summary style="font-weight:800; cursor:pointer;">Guesty Key Settings</summary>

          <br />

          <p class="small">
            Update the two Guesty credentials stored in Render. Existing keys are never displayed.
          </p>

          <div class="grid">
            <div>
              <label>Guesty Client ID</label>
              <input id="guestyClientId" type="password" autocomplete="off" />
            </div>

            <div>
              <label>Guesty Client Secret</label>
              <input id="guestyClientSecret" type="password" autocomplete="off" />
            </div>
          </div>

          <br />

          <div>
            <label>Dashboard Access Key</label>
            <input id="dashboardAdminKey" type="password" autocomplete="off" />
          </div>

          <br />

          <div class="row">
            <button onclick="saveGuestyCredentials()">Update Guesty Keys in Render</button>
            <span id="guestyCredentialsStatus"></span>
          </div>
        </details>

        <div id="status"></div>
        <div id="properties"></div>

        <script>
          let CURRENT_PROPERTIES = [];

          function escapeHtml(value) {
            return String(value || "")
              .replaceAll("&", "&amp;")
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;")
              .replaceAll('"', "&quot;")
              .replaceAll("'", "&#039;");
          }

          function getValue(id) {
            const el = document.getElementById(id);
            return el ? el.value : "";
          }

          function getChecked(id) {
            const el = document.getElementById(id);
            return el ? el.checked : false;
          }

          async function loadFacebookGroups() {
            const box = document.getElementById("facebookGroups");
            const status = document.getElementById("facebookGroupsStatus");

            status.innerHTML = '<span class="small">Loading...</span>';

            const response = await fetch("/api/facebook-groups");
            const data = await response.json();

            if (!data.ok) {
              status.innerHTML = '<span class="error">' + escapeHtml(data.error || "Failed to load groups") + '</span>';
              return;
            }

            box.value = data.groups || "";
            status.innerHTML = '<span class="success">Loaded</span>';
          }

          async function saveFacebookGroups() {
            const box = document.getElementById("facebookGroups");
            const status = document.getElementById("facebookGroupsStatus");

            status.innerHTML = '<span class="small">Saving...</span>';

            const response = await fetch("/api/facebook-groups", {
              method: "PUT",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                groups: box.value || ""
              })
            });

            const data = await response.json();

            if (!data.ok) {
              status.innerHTML = '<span class="error">' + escapeHtml(data.error || "Failed to save groups") + '</span>';
              return;
            }

            box.value = data.groups || "";
            status.innerHTML = '<span class="success">Saved</span>';
          }

          async function saveGuestyCredentials() {
            const status = document.getElementById("guestyCredentialsStatus");
            const clientId = getValue("guestyClientId");
            const clientSecret = getValue("guestyClientSecret");
            const dashboardAdminKey = getValue("dashboardAdminKey");

            if (!clientId || !clientSecret || !dashboardAdminKey) {
              status.innerHTML = '<span class="error">Enter both Guesty keys and the dashboard access key.</span>';
              return;
            }

            status.innerHTML = '<span class="small">Updating Render...</span>';

            const response = await fetch("/api/guesty-credentials", {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                "x-dashboard-admin-key": dashboardAdminKey
              },
              body: JSON.stringify({
                clientId,
                clientSecret
              })
            });

            const data = await response.json();

            if (!data.ok) {
              status.innerHTML = '<span class="error">' + escapeHtml(data.error || "Failed to update Guesty keys") + '</span>';
              return;
            }

            document.getElementById("guestyClientId").value = "";
            document.getElementById("guestyClientSecret").value = "";
            status.innerHTML = '<span class="success">Guesty keys updated in Render.</span>';
          }

          function buildPropertyBody(listingId) {
            return {
              listingId,
              shortId: getValue("shortId-" + listingId),
              active: getChecked("active-" + listingId),
              airbnbUrl: getValue("airbnbUrl-" + listingId),
              vrboUrl: getValue("vrboUrl-" + listingId),
              minNights: 1,
              maxNights: 45,
              scanDays: 45,
              offSeasonActive: getChecked("offSeasonActive-" + listingId),
              offSeasonMonthlyRate: getValue("offSeasonMonthlyRate-" + listingId),
              offSeasonStartMonth: getValue("offSeasonStartMonth-" + listingId),
              offSeasonEndMonth: getValue("offSeasonEndMonth-" + listingId)
            };
          }

          async function saveProperty(listingId) {
            const body = buildPropertyBody(listingId);

            const response = await fetch("/api/properties/" + encodeURIComponent(listingId), {
              method: "PUT",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify(body)
            });

            const data = await response.json();
            const status = document.getElementById("saveStatus-" + listingId);

            if (data.ok) {
              status.innerHTML = '<span class="success">Saved</span>';
            } else {
              status.innerHTML = '<span class="error">' + escapeHtml(data.error || "Save failed") + '</span>';
            }
          }

          async function saveAllProperties() {
            const status = document.getElementById("saveAllStatus");

            status.innerHTML = '<span class="small">Saving all...</span>';

            const properties = CURRENT_PROPERTIES.map((property) =>
              buildPropertyBody(property.listingId)
            );

            const response = await fetch("/api/properties-bulk", {
              method: "PUT",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                properties
              })
            });

            const data = await response.json();

            if (data.ok) {
              status.innerHTML = '<span class="success">Saved all ' + data.count + ' properties</span>';
            } else {
              status.innerHTML = '<span class="error">' + escapeHtml(data.error || "Save all failed") + '</span>';
            }
          }

          function renderProperty(property) {
            const id = property.listingId;

            return ''
              + '<div class="card">'
              + '  <div class="property-header">'
              + '    <img src="' + escapeHtml(property.picture || "") + '" />'
              + '    <div>'
              + '      <h3>' + escapeHtml(property.title || "Untitled Property") + '</h3>'
              + '      <div class="small">Listing ID: ' + escapeHtml(property.listingId) + '</div>'
              + '      <div class="small">City: ' + escapeHtml(property.city || "") + '</div>'
              + '      <div class="small">'
              +          escapeHtml(property.bedrooms || "") + ' Bedrooms • '
              +          escapeHtml(property.bathrooms || "") + ' Bathrooms • '
              +          'Sleeps ' + escapeHtml(property.sleeps || "")
              + '      </div>'
              + '      <div class="small">'
              + '        Direct booking URL is automatic: '
              + '        https://oceanvacationsmb.guestybookings.com/properties/' + escapeHtml(property.listingId)
              + '      </div>'
              + '    </div>'
              + '  </div>'

              + '  <br />'

              + '  <div class="grid-3">'
              + '    <div>'
              + '      <label>Active</label>'
              + '      <input id="active-' + escapeHtml(id) + '" type="checkbox" ' + (property.active !== false ? "checked" : "") + ' style="width:auto;" />'
              + '    </div>'

              + '    <div>'
              + '      <label>Property Short ID</label>'
              + '      <input id="shortId-' + escapeHtml(id) + '" value="' + escapeHtml(property.shortId || "") + '" placeholder="3104-1" />'
              + '    </div>'

              + '    <div>'
              + '      <label>Scan Days Per Property</label>'
              + '      <input id="scanDays-' + escapeHtml(id) + '" type="number" value="45" readonly />'
              + '    </div>'
              + '  </div>'

              + '  <br />'

              + '  <div class="grid">'
              + '    <div>'
              + '      <label>Min Nights</label>'
              + '      <input id="minNights-' + escapeHtml(id) + '" type="number" value="1" readonly />'
              + '    </div>'

              + '    <div>'
              + '      <label>Max Nights</label>'
              + '      <input id="maxNights-' + escapeHtml(id) + '" type="number" value="45" readonly />'
              + '    </div>'
              + '  </div>'

              + '  <br />'

              + '  <div class="grid">'
              + '    <div>'
              + '      <label>Airbnb URL</label>'
              + '      <input id="airbnbUrl-' + escapeHtml(id) + '" value="' + escapeHtml(property.airbnbUrl || "") + '" placeholder="https://www.airbnb.com/rooms/..." />'
              + '    </div>'

              + '    <div>'
              + '      <label>VRBO URL</label>'
              + '      <input id="vrboUrl-' + escapeHtml(id) + '" value="' + escapeHtml(property.vrboUrl || "") + '" placeholder="https://www.vrbo.com/..." />'
              + '    </div>'
              + '  </div>'

              + '  <br />'

              + '  <div class="off-season-settings">'
              + '    <h3>Off Season Monthly Rental</h3>'
              + '    <div class="grid-3">'
              + '      <div>'
              + '        <label>Include in Off Season Rentals</label>'
              + '        <input id="offSeasonActive-' + escapeHtml(id) + '" type="checkbox" ' + (property.offSeasonActive === true ? "checked" : "") + ' style="width:auto;" />'
              + '      </div>'
              + '      <div>'
              + '        <label>Monthly Rate</label>'
              + '        <input id="offSeasonMonthlyRate-' + escapeHtml(id) + '" type="number" min="0" step="1" value="' + escapeHtml(property.offSeasonMonthlyRate || "") + '" placeholder="3000" />'
              + '      </div>'
              + '      <div>'
              + '        <label>Season Period</label>'
              + '        <div class="small">The start month begins on day 1. The end month includes its final day.</div>'
              + '      </div>'
              + '    </div>'
              + '    <br />'
              + '    <div class="grid">'
              + '      <div>'
              + '        <label>Start Month</label>'
              + '        <input id="offSeasonStartMonth-' + escapeHtml(id) + '" type="month" value="' + escapeHtml(property.offSeasonStartMonth || "") + '" />'
              + '      </div>'
              + '      <div>'
              + '        <label>End Month</label>'
              + '        <input id="offSeasonEndMonth-' + escapeHtml(id) + '" type="month" value="' + escapeHtml(property.offSeasonEndMonth || "") + '" />'
              + '      </div>'
              + '    </div>'
              + '  </div>'

              + '  <br />'

              + '  <div class="row">'
              + '    <button onclick="saveProperty(\\'' + escapeHtml(id) + '\\')">Save Property</button>'
              + '    <span id="saveStatus-' + escapeHtml(id) + '"></span>'
              + '  </div>'
              + '</div>';
          }

          async function loadProperties() {
            const status = document.getElementById("status");
            const container = document.getElementById("properties");

            status.innerHTML = '<div class="card">Loading properties...</div>';
            container.innerHTML = "";

            const response = await fetch("/api/properties");
            const data = await response.json();

            if (!data.ok) {
              status.innerHTML = '<div class="card error">' + escapeHtml(data.error || "Failed to load") + '</div>';
              return;
            }

            CURRENT_PROPERTIES = data.properties || [];

            status.innerHTML = '<div class="card">Loaded ' + CURRENT_PROPERTIES.length + ' properties.</div>';
            container.innerHTML = CURRENT_PROPERTIES.map(renderProperty).join("");
          }

          loadFacebookGroups();
          loadProperties();
        </script>
      `
    )
  );
});

app.get("/specials", (req, res) => {
  res.send(
    pageShell(
      "Specials",
      `
        <div class="tabs">
          <button id="lastMinuteTab" class="tab-button active" onclick="showSpecialsTab('last-minute')">LAST MINUTE DEALS</button>
          <button id="offSeasonTab" class="tab-button" onclick="showSpecialsTab('off-season')">OFF SEASON RENTALS</button>
        </div>

        <section id="last-minute-panel" class="tab-panel">
          <div class="card">
            <h2>Generate Specials</h2>
            <p class="small">
              Specials scan automatically when this page opens. Default is 45 days starting 2 days from today.
            </p>

            <div class="small">
              Period: Today + 2 days through the next 45 days
            </div>

            <input id="scanDays" type="hidden" value="45" />
          </div>

          <div id="status"></div>
          <div id="results"></div>
        </section>

        <section id="off-season-panel" class="tab-panel" style="display:none;">
          <div class="card">
            <h2>Off Season Rentals</h2>
            <p class="small">
              Monthly rental posts use the rates and dates saved in the Property Dashboard.
              Default period is Oct 1 through the end of February. A post is created when Guesty shows at least one continuous 30-night opening.
            </p>
          </div>

          <div id="offSeasonStatus"></div>
          <div id="offSeasonResults"></div>
        </section>

        <script>
          let SERVER_FACEBOOK_GROUPS = "";
          let ACTIVE_FACEBOOK_POST_STATUS_ID = "";

          function escapeHtml(value) {
            return String(value || "")
              .replaceAll("&", "&amp;")
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;")
              .replaceAll('"', "&quot;")
              .replaceAll("'", "&#039;");
          }

          function getCleanFacebookGroups() {
            return String(SERVER_FACEBOOK_GROUPS || "")
              .split("\\n")
              .map((line) => line.trim())
              .filter(Boolean);
          }

          function getScanFrom(data) {
            return (
              data.scanFrom ||
              data.from ||
              (data.scan && data.scan.from) ||
              (data.range && data.range.from) ||
              (data.period && data.period.from) ||
              (data.scanRange && data.scanRange.from) ||
              ""
            );
          }

          function getScanTo(data) {
            return (
              data.scanTo ||
              data.to ||
              (data.scan && data.scan.to) ||
              (data.range && data.range.to) ||
              (data.period && data.period.to) ||
              (data.scanRange && data.scanRange.to) ||
              ""
            );
          }

          function getPostTitle(post) {
            return (
              post.propertyTitle ||
              post.title ||
              post.shortId ||
              post.propertyId ||
              post.listingId ||
              "Property"
            );
          }

          function getPostId(post) {
            return (
              post.propertyId ||
              post.listingId ||
              post.shortId ||
              ""
            );
          }

          function getPostMessage(post) {
            return post.message || post.post || "";
          }

          function getPostSpecials(post) {
            if (Array.isArray(post.specials)) return post.specials;
            if (Array.isArray(post.gaps)) return post.gaps;
            return [];
          }

          async function loadFacebookGroups() {
            const response = await fetch("/api/facebook-groups");
            const data = await response.json();

            if (!data.ok) {
              SERVER_FACEBOOK_GROUPS = "";
              return;
            }

            SERVER_FACEBOOK_GROUPS = data.groups || "";
          }

          async function copyText(id) {
            const el = document.getElementById(id);

            await navigator.clipboard.writeText(el.value);

            const status = document.getElementById("copy-" + id);
            status.innerHTML = '<span class="success">Copied</span>';
          }

          async function startFacebookPosting(id) {
            const el = document.getElementById(id);
            const message = el.value || "";
            const groups = getCleanFacebookGroups();

            if (!message.trim()) {
              alert("Message is empty.");
              return;
            }

            if (!groups.length) {
              alert("No Facebook groups saved.");
              return;
            }

            await navigator.clipboard.writeText(message);

            window.postMessage(
              {
                source: "OCEAN_SPECIALS_APP",
                type: "START_FB_POSTING",
                payload: {
                  groups,
                  message
                }
              },
              "*"
            );

            const status = document.getElementById("posting-" + id);
            ACTIVE_FACEBOOK_POST_STATUS_ID = "posting-" + id;
            status.innerHTML = '<span class="small">Opening Facebook groups and preparing posts...</span>';
          }

          function showSpecialsTab(tab) {
            const isLastMinute = tab === "last-minute";

            document.getElementById("last-minute-panel").style.display = isLastMinute ? "" : "none";
            document.getElementById("off-season-panel").style.display = isLastMinute ? "none" : "";
            document.getElementById("lastMinuteTab").classList.toggle("active", isLastMinute);
            document.getElementById("offSeasonTab").classList.toggle("active", !isLastMinute);
          }

          window.addEventListener("message", (event) => {
            if (event.source !== window) return;

            const data = event.data || {};

            if (
              data.source !== "OCEAN_FB_EXTENSION" ||
              data.type !== "FB_POSTING_PROGRESS"
            ) {
              return;
            }

            const status = document.getElementById(ACTIVE_FACEBOOK_POST_STATUS_ID);
            const prepared = Number(data.prepared || 0);
            const total = Number(data.total || 0);
            const failed = Number(data.failed || 0);

            if (!status) return;

            if (failed) {
              status.innerHTML =
                '<span class="small">Prepared '
                + prepared
                + ' of '
                + total
                + ' groups. '
                + failed
                + ' group(s) need manual attention.</span>';
              return;
            }

            status.innerHTML =
              '<span class="success">Prepared '
              + prepared
              + ' of '
              + total
              + ' Facebook groups.</span>';
          });

          function renderPost(post, index) {
            const textareaId = "post-" + index;
            const message = getPostMessage(post);
            const specials = getPostSpecials(post);
            const title = getPostTitle(post);
            const propertyId = getPostId(post);

            const flyerLine = post.flyerImageUrl || post.flyerUrl
              ? '<div class="small success">Flyer URL included</div>'
              : '';

            return ''
              + '<div class="card">'
              + '  <h3>' + escapeHtml(title) + '</h3>'
              + '  <div class="small">Property ID: ' + escapeHtml(propertyId) + '</div>'
              + '  <div class="small">Specials found: ' + specials.length + '</div>'
              +    flyerLine
              + '  <br />'
              + '  <textarea class="postbox" id="' + textareaId + '">' + escapeHtml(message) + '</textarea>'
              + '  <br /><br />'
              + '  <div class="row">'
              + '    <button onclick="startFacebookPosting(\\'' + textareaId + '\\')">Prepare Facebook Posts</button>'
              + '    <button onclick="copyText(\\'' + textareaId + '\\')">Copy Message</button>'
              + '    <span id="copy-' + textareaId + '"></span>'
              + '    <span id="posting-' + textareaId + '"></span>'
              + '  </div>'
              + '</div>';
          }

          function renderOffSeasonPost(post, index) {
            const textareaId = "off-season-post-" + index;
            const message = getPostMessage(post);
            const title = getPostTitle(post);
            const propertyId = getPostId(post);
            const listingId = post.listingId || "";
            const flyerUrl = post.flyerUrl || "";
            const previewId = "off-season-flyer-" + index;
            const flyerStatusId = "off-season-flyer-status-" + index;

            return ''
              + '<div class="card">'
              + '  <h3>' + escapeHtml(title) + '</h3>'
              + '  <div class="small">Property ID: ' + escapeHtml(propertyId) + '</div>'
              + '  <div class="small">Monthly rate: $' + escapeHtml(Number(post.monthlyRate || 0).toLocaleString()) + '</div>'
              + '  <div class="small">Period: ' + escapeHtml(post.startDate || "") + ' to ' + escapeHtml(post.endDate || "") + '</div>'
              + (flyerUrl
                ? '  <br /><img id="' + previewId + '" class="flyer-preview" src="' + escapeHtml(flyerUrl) + '" alt="Winter special flyer for ' + escapeHtml(propertyId) + '" />'
                : '  <br /><img id="' + previewId + '" class="flyer-preview" style="display:none;" alt="Winter special flyer for ' + escapeHtml(propertyId) + '" />')
              + '  <br />'
              + '  <textarea class="postbox" id="' + textareaId + '">' + escapeHtml(message) + '</textarea>'
              + '  <br /><br />'
              + '  <div class="row">'
              + '    <button onclick="regenerateWinterFlyer(\\'' + escapeHtml(listingId) + '\\', \\'' + textareaId + '\\', \\'' + previewId + '\\', \\'' + flyerStatusId + '\\', \\'' + escapeHtml(flyerUrl) + '\\')">Regenerate Flyer</button>'
              + '    <button onclick="startFacebookPosting(\\'' + textareaId + '\\')">Prepare Facebook Posts</button>'
              + '    <button onclick="copyText(\\'' + textareaId + '\\')">Copy Message</button>'
              + '    <span id="copy-' + textareaId + '"></span>'
              + '    <span id="posting-' + textareaId + '"></span>'
              + '    <span id="' + flyerStatusId + '"></span>'
              + '  </div>'
              + '</div>';
          }

          function renderOffSeasonScanResults(allResults) {
            if (!Array.isArray(allResults) || !allResults.length) {
              return "";
            }

            return ''
              + '<details class="card">'
              + '  <summary style="font-weight:800; cursor:pointer;">Properties Checked</summary>'
              + '  <br />'
              + allResults.map((result) => {
                  const propertyId =
                    result.propertyId ||
                    result.shortId ||
                    result.listingId ||
                    "";
                  const title =
                    result.title ||
                    result.propertyTitle ||
                    propertyId;
                  const monthlyGaps = Array.isArray(result.monthlyGaps)
                    ? result.monthlyGaps
                    : [];
                  const calendarDays = Number(result.calendarDaysCount || 0);
                  const availableDays = Number(result.availableDaysCount || 0);
                  let statusHtml = "";
                  let flyerHtml = "";

                  if (result.error) {
                    statusHtml =
                      '<div class="error">Scan error: '
                      + escapeHtml(result.error)
                      + '</div>';
                  } else if (monthlyGaps.length) {
                    statusHtml =
                      '<div class="success">Available: '
                      + monthlyGaps.length
                      + ' continuous monthly opening'
                      + (monthlyGaps.length === 1 ? '' : 's')
                      + ' found.</div>';
                  } else {
                    statusHtml =
                      '<div class="small">No continuous 30-night opening found.</div>';
                  }

                  if (result.flyerUrl) {
                    flyerHtml =
                      '<div class="success">Winter flyer saved in Cloudinary.</div>';
                  } else if (result.flyerError) {
                    flyerHtml =
                      '<div class="error">Flyer error: '
                      + escapeHtml(result.flyerError)
                      + '</div>';
                  } else {
                    flyerHtml =
                      '<div class="small">Winter flyer is not ready yet.</div>';
                  }

                  return ''
                    + '<div style="padding:14px 0; border-top:1px solid #d9e3ea;">'
                    + '  <strong>' + escapeHtml(propertyId) + ' - ' + escapeHtml(title) + '</strong>'
                    + '  <div class="small">Calendar days checked: ' + calendarDays
                    + ' | Available days: ' + availableDays + '</div>'
                    +    statusHtml
                    +    flyerHtml
                    + '</div>';
                }).join("")
              + '</details>';
          }

          async function regenerateWinterFlyer(
            listingId,
            textareaId,
            previewId,
            flyerStatusId,
            previousFlyerUrl
          ) {
            const status = document.getElementById(flyerStatusId);

            status.innerHTML = '<span class="small">Creating flyer...</span>';

            const response = await fetch(
              "/api/off-season-rentals/"
                + encodeURIComponent(listingId)
                + "/flyer/regenerate",
              {
                method: "POST"
              }
            );

            const data = await response.json();

            if (!data.ok) {
              status.innerHTML =
                '<span class="error">'
                + escapeHtml(data.error || "Flyer generation failed")
                + '</span>';
              return;
            }

            const flyerUrl = data.flyerUrl || "";
            const preview = document.getElementById(previewId);
            const textarea = document.getElementById(textareaId);

            preview.src = flyerUrl;
            preview.style.display = "";

            if (previousFlyerUrl && textarea.value.includes(previousFlyerUrl)) {
              textarea.value = textarea.value.replace(previousFlyerUrl, flyerUrl);
            } else if (!textarea.value.includes(flyerUrl)) {
              textarea.value += "\\n\\nflyer:\\n" + flyerUrl;
            }

            status.innerHTML = '<span class="success">Flyer updated.</span>';
          }

          function renderDebug(allResults) {
            if (!Array.isArray(allResults) || !allResults.length) {
              return "";
            }

            return ''
              + '<details class="card">'
              + '<summary style="font-weight:800; cursor:pointer;">Scan Debug: All Properties Checked</summary>'
              + '<br />'
              + allResults.map((result) => {
                  const id =
                    result.propertyId ||
                    result.listingId ||
                    result.shortId ||
                    result.property?.propertyId ||
                    "";

                  const title =
                    result.propertyTitle ||
                    result.title ||
                    result.property?.propertyTitle ||
                    result.property?.propertyId ||
                    result.shortId ||
                    "Unknown";

                  const specials = Array.isArray(result.specials)
                    ? result.specials
                    : Array.isArray(result.gaps)
                      ? result.gaps
                      : [];

                  const gapCount = specials.length;
                  const calendarDays = result.calendarDaysCount || 0;
                  const availableDays = result.availableDaysCount || 0;
                  const error = result.error ? " ERROR: " + result.error : "";

                  return escapeHtml(
                    id + " - " + title +
                    " - gaps found: " + gapCount +
                    " - calendar days: " + calendarDays +
                    " - available days: " + availableDays +
                    error
                  );
                }).join("<br />")
              + '</details>';
          }

          async function generateSpecials() {
            const status = document.getElementById("status");
            const results = document.getElementById("results");

            const days = document.getElementById("scanDays").value;

            const params = new URLSearchParams();
            params.set("days", days);

            status.innerHTML = '<div class="card">Scanning Guesty availability...</div>';
            results.innerHTML = "";

            const response = await fetch("/api/specials/generate?" + params.toString(), {
              cache: "no-store"
            });

            const data = await response.json();

            if (!data.ok) {
              status.innerHTML = '<div class="card error">' + escapeHtml(data.error || "Failed to generate") + '</div>';
              return;
            }

            const propertyPosts = Array.isArray(data.propertyPosts)
              ? data.propertyPosts
              : Array.isArray(data.posts)
                ? data.posts
                : [];

            const allResults = Array.isArray(data.results) ? data.results : [];

            const from = getScanFrom(data);
            const to = getScanTo(data);

            status.innerHTML =
              '<div class="card">Scan range: '
              + escapeHtml(from)
              + ' to '
              + escapeHtml(to)
              + '. Found '
              + propertyPosts.length
              + ' properties with open gaps.</div>';

            const debugHtml = renderDebug(allResults);

            if (!propertyPosts.length) {
              results.innerHTML =
                debugHtml +
                '<div class="card">No open gaps found for the selected scan window.</div>';
              return;
            }

            results.innerHTML = debugHtml + propertyPosts.map(renderPost).join("");
          }

          async function generateOffSeasonRentals() {
            const status = document.getElementById("offSeasonStatus");
            const results = document.getElementById("offSeasonResults");

            status.innerHTML = '<div class="card">Loading off season rental posts...</div>';
            results.innerHTML = "";

            const response = await fetch("/api/off-season-rentals/generate", {
              cache: "no-store"
            });

            const data = await response.json();

            if (!data.ok) {
              status.innerHTML = '<div class="card error">' + escapeHtml(data.error || "Failed to generate") + '</div>';
              return;
            }

            const propertyPosts = Array.isArray(data.propertyPosts)
              ? data.propertyPosts
              : [];
            const allResults = Array.isArray(data.results)
              ? data.results
              : [];
            const scanErrors = allResults.filter((result) => result.error).length;

            status.innerHTML =
              '<div class="card">Scanned '
              + Number(data.scannedProperties || 0)
              + ' configured properties. Found '
              + propertyPosts.length
              + ' off season rentals with at least one continuous 30-night opening.'
              + (scanErrors
                ? ' <span class="error">' + scanErrors + ' properties could not be scanned.</span>'
                : '')
              + '</div>';

            const scanResultsHtml = renderOffSeasonScanResults(allResults);

            if (!propertyPosts.length) {
              results.innerHTML =
                scanResultsHtml +
                '<div class="card">No configured properties currently have a continuous 30-night opening during their saved off-season period.</div>';
              return;
            }

            results.innerHTML =
              scanResultsHtml +
              propertyPosts.map(renderOffSeasonPost).join("");
          }

          async function startPage() {
            await loadFacebookGroups();
            await Promise.all([
              generateSpecials(),
              generateOffSeasonRentals()
            ]);
          }

          startPage();
        </script>
      `
    )
  );
});

app.listen(PORT, () => {
  console.log("Ocean Specials server running on port " + PORT);
});

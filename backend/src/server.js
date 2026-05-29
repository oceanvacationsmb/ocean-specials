import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import {
  testGuestyConnection,
  getListingCalendar,
  getAllListings
} from "./services/guestyApi.js";

import {
  getManagedProperties,
  saveManagedProperty
} from "./services/propertyManager.js";

import { generateSpecials } from "./services/specialGenerator.js";

import {
  getAppSetting,
  setAppSetting
} from "./services/db.js";

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
    days: req.query.days || req.body?.days || 60
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

          .success {
            color: #067647;
            font-weight: 800;
          }

          .error {
            color: #b42318;
            font-weight: 800;
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
      new Date(today.getTime() + 17 * 24 * 60 * 60 * 1000)
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

app.get("/properties", (req, res) => {
  res.send(
    pageShell(
      "Properties",
      `
        <div class="card">
          <h2>Property Dashboard</h2>
          <p class="small">
            Guesty supplies the property title, bedrooms, bathrooms, sleeps, city, and main photo automatically.
            Add Airbnb, VRBO, and Cloudinary flyer URL only.
          </p>
          <button onclick="loadProperties()">Reload Properties</button>
        </div>

        <div id="status"></div>
        <div id="properties"></div>

        <script>
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

          async function saveProperty(listingId) {
            const body = {
              shortId: getValue("shortId-" + listingId),
              active: getChecked("active-" + listingId),
              airbnbUrl: getValue("airbnbUrl-" + listingId),
              vrboUrl: getValue("vrboUrl-" + listingId),
              flyerImageUrl: getValue("flyerImageUrl-" + listingId),
              minNights: Number(getValue("minNights-" + listingId) || 1),
              maxNights: Number(getValue("maxNights-" + listingId) || 30),
              scanDays: Number(getValue("scanDays-" + listingId) || 15)
            };

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
              + '      <input id="scanDays-' + escapeHtml(id) + '" type="number" value="' + escapeHtml(property.scanDays || 15) + '" />'
              + '    </div>'
              + '  </div>'
              + '  <br />'
              + '  <div class="grid">'
              + '    <div>'
              + '      <label>Min Nights</label>'
              + '      <input id="minNights-' + escapeHtml(id) + '" type="number" value="' + escapeHtml(property.minNights || 1) + '" />'
              + '    </div>'
              + '    <div>'
              + '      <label>Max Nights</label>'
              + '      <input id="maxNights-' + escapeHtml(id) + '" type="number" value="' + escapeHtml(property.maxNights || 30) + '" />'
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
              + '  <div>'
              + '    <label>Flyer Image URL from Cloudinary</label>'
              + '    <input id="flyerImageUrl-' + escapeHtml(id) + '" value="' + escapeHtml(property.flyerImageUrl || "") + '" placeholder="https://res.cloudinary.com/.../image/upload/..." />'
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

            status.innerHTML = '<div class="card">Loaded ' + data.properties.length + ' properties.</div>';
            container.innerHTML = data.properties.map(renderProperty).join("");
          }

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
        <div class="card">
          <h2>Generate Specials</h2>
          <p class="small">
            Specials scan automatically when this page opens. Default is 15 days starting 2 days from today.
          </p>

         <div class="small">
  Period: Today + 2 days through the next 60 days
</div>

<input id="scanDays" type="hidden" value="60" />
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

        <div id="status"></div>
        <div id="results"></div>

        <script>
          let SERVER_FACEBOOK_GROUPS = "";

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

            SERVER_FACEBOOK_GROUPS = data.groups || "";
            box.value = SERVER_FACEBOOK_GROUPS;

            status.innerHTML = '<span class="success">Loaded</span>';
          }

          async function saveFacebookGroups() {
            const box = document.getElementById("facebookGroups");
            const status = document.getElementById("facebookGroupsStatus");

            const groups = box.value || "";

            status.innerHTML = '<span class="small">Saving...</span>';

            const response = await fetch("/api/facebook-groups", {
              method: "PUT",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                groups
              })
            });

            const data = await response.json();

            if (!data.ok) {
              status.innerHTML = '<span class="error">' + escapeHtml(data.error || "Failed to save groups") + '</span>';
              return;
            }

            SERVER_FACEBOOK_GROUPS = data.groups || "";
            box.value = SERVER_FACEBOOK_GROUPS;

            status.innerHTML = '<span class="success">Saved</span>';
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
        groups
      }
    },
    "*"
  );

  const status = document.getElementById("posting-" + id);
  status.innerHTML = '<span class="success">Message copied. Facebook groups opened.</span>';
}

          function renderPost(post, index) {
            const textareaId = "post-" + index;

            const flyerLine = post.flyerImageUrl
              ? '<div class="small success">Flyer URL included</div>'
              : '<div class="small error">No flyer URL saved for this property</div>';

            return ''
              + '<div class="card">'
              + '  <h3>' + escapeHtml(post.propertyTitle) + '</h3>'
              + '  <div class="small">Property ID: ' + escapeHtml(post.propertyId || "") + '</div>'
              + '  <div class="small">Specials found: ' + post.specials.length + '</div>'
              +    flyerLine
              + '  <br />'
              + '  <textarea class="postbox" id="' + textareaId + '">' + escapeHtml(post.message) + '</textarea>'
              + '  <br /><br />'
              + '  <div class="row">'
              + '    <button onclick="startFacebookPosting(\\'' + textareaId + '\\')">Start Posting</button>'
              + '    <button onclick="copyText(\\'' + textareaId + '\\')">Copy Message</button>'
              + '    <span id="copy-' + textareaId + '"></span>'
              + '    <span id="posting-' + textareaId + '"></span>'
              + '  </div>'
              + '</div>';
          }

          async function generateSpecials() {
            const status = document.getElementById("status");
            const results = document.getElementById("results");

            const days = document.getElementById("scanDays").value;

            const params = new URLSearchParams();
            params.set("days", days);

            status.innerHTML = '<div class="card">Scanning Guesty availability...</div>';
            results.innerHTML = "";

            const response = await fetch("/api/specials/generate?" + params.toString());
            const data = await response.json();

            if (!data.ok) {
              status.innerHTML = '<div class="card error">' + escapeHtml(data.error || "Failed to generate") + '</div>';
              return;
            }

            status.innerHTML = '<div class="card">Scan range: ' + escapeHtml(data.scan.from) + ' to ' + escapeHtml(data.scan.to) + '. Found ' + data.propertyPosts.length + ' properties with open gaps.</div>';

            if (!data.propertyPosts.length) {
              results.innerHTML = '<div class="card">No open gaps found for the selected scan window.</div>';
              return;
            }

            results.innerHTML = data.propertyPosts.map(renderPost).join("");
          }

          async function startPage() {
            await loadFacebookGroups();
            await generateSpecials();
          }

          startPage();
        </script>
      `
    )
  );
});

app.listen(PORT, () => {
  console.log(`Ocean Specials server running on port ${PORT}`);
});

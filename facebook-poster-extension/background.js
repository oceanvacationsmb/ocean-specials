const pendingPostsByTabId = new Map();
const postingWindowIds = new Set();
const preparedTabIds = new Set();
const failedTabIds = new Set();
const fillingTabIds = new Set();

let dashboardTabId = null;
let totalGroups = 0;
let queuedGroups = [];
let queuedMessage = "";
let queuedPostType = "last-minute";
let currentGroupIndex = -1;
let currentWindowId = null;
let currentTabId = null;
let queueAdvancePending = false;

function cleanGroups(groups) {
  if (!Array.isArray(groups)) {
    return [];
  }

  return groups
    .map((url) => String(url || "").trim())
    .filter(Boolean)
    .filter((url) => url.startsWith("https://www.facebook.com/groups/"));
}

async function getScreenArea() {
  try {
    const displays = await chrome.system.display.getInfo();
    const primary =
      displays.find((display) => display.isPrimary) ||
      displays[0];

    if (primary?.workArea) {
      return primary.workArea;
    }
  } catch (error) {
    // fallback
  }

  return {
    left: 0,
    top: 0,
    width: 1366,
    height: 768
  };
}

async function getGridPosition(index, total) {
  const area = await getScreenArea();

  const gap = 8;
  const columns = Math.min(4, Math.max(1, total));
  const rows = Math.ceil(total / columns);

  const availableWidth = area.width - gap * (columns + 1);
  const availableHeight = area.height - gap * (rows + 1);

  const width = Math.max(360, Math.floor(availableWidth / columns));
  const height = Math.max(420, Math.floor(availableHeight / rows));

  const row = Math.floor(index / columns);
  const col = index % columns;

  return {
    left: Math.max(area.left, area.left + gap + col * (width + gap)),
    top: Math.max(area.top, area.top + gap + row * (height + gap)),
    width: Math.min(width, area.width),
    height: Math.min(height, area.height)
  };
}

function notifyDashboard() {
  if (!dashboardTabId) {
    return;
  }

  chrome.tabs.sendMessage(
    dashboardTabId,
    {
      type: "FB_POSTING_PROGRESS",
      prepared: preparedTabIds.size,
      failed: failedTabIds.size,
      total: totalGroups
    },
    () => {
      void chrome.runtime.lastError;
    }
  );
}

async function sendFillMessage(tabId, message, attempt = 1) {
  if (preparedTabIds.has(tabId) || fillingTabIds.has(tabId)) {
    return;
  }

  fillingTabIds.add(tabId);

  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "FILL_FACEBOOK_POST",
      message
    });

    if (response?.ok) {
      preparedTabIds.add(tabId);
      failedTabIds.delete(tabId);
      notifyDashboard();
      return;
    }
  } catch (error) {
    // Facebook may still be loading. Retry below.
  } finally {
    fillingTabIds.delete(tabId);
  }

  if (attempt < 8) {
    setTimeout(() => {
      sendFillMessage(tabId, message, attempt + 1);
    }, 1400);
    return;
  }

  failedTabIds.add(tabId);
  notifyDashboard();
}

async function openNextGroup() {
  currentGroupIndex += 1;
  queueAdvancePending = false;

  if (currentGroupIndex >= queuedGroups.length) {
    currentWindowId = null;
    currentTabId = null;
    notifyDashboard();
    return;
  }

  const area = await getScreenArea();
  const margin = 8;
  const reviewWidth = Math.min(720, Math.max(560, area.width - margin * 2));
  const reviewHeight = Math.max(720, area.height - margin * 2);
  const createdWindow = await chrome.windows.create({
    url: queuedGroups[currentGroupIndex],
    type: "popup",
    focused: true,
    left: area.left + margin,
    top: area.top + margin,
    width: reviewWidth,
    height: reviewHeight
  });

  if (createdWindow?.id) {
    currentWindowId = createdWindow.id;
    postingWindowIds.add(createdWindow.id);
  }

  const tabId = createdWindow?.tabs?.[0]?.id;

  if (tabId) {
    currentTabId = tabId;
    pendingPostsByTabId.set(tabId, queuedMessage);

    setTimeout(() => {
      sendFillMessage(tabId, queuedMessage);
    }, 1800);
  }
}

async function openGroupWindows(message, groups, postType) {
  await closePostingWindows();

  pendingPostsByTabId.clear();
  preparedTabIds.clear();
  failedTabIds.clear();
  fillingTabIds.clear();

  const clean = cleanGroups(groups);
  queuedGroups = clean;
  queuedMessage = message;
  queuedPostType = postType === "off-season" ? "off-season" : "last-minute";
  currentGroupIndex = -1;
  totalGroups = clean.length;
  notifyDashboard();

  await openNextGroup();
}

async function closePostingWindows() {
  const ids = Array.from(postingWindowIds);

  postingWindowIds.clear();
  pendingPostsByTabId.clear();
  preparedTabIds.clear();
  failedTabIds.clear();
  fillingTabIds.clear();
  queuedGroups = [];
  queuedMessage = "";
  queuedPostType = "last-minute";
  currentGroupIndex = -1;
  currentWindowId = null;
  currentTabId = null;
  queueAdvancePending = false;
  totalGroups = 0;

  for (const windowId of ids) {
    try {
      await chrome.windows.remove(windowId);
    } catch (error) {
      // already closed
    }
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.type === "START_FB_POSTING") {
    dashboardTabId = sender?.tab?.id || null;

    openGroupWindows(
      request.payload?.message || "",
      request.payload?.groups || [],
      request.payload?.postType || "last-minute"
    );

    sendResponse({
      ok: true
    });

    return true;
  }

  if (request?.type === "FB_CONTENT_READY") {
    const tabId = sender?.tab?.id;

    if (tabId && pendingPostsByTabId.has(tabId)) {
      setTimeout(() => {
        sendFillMessage(tabId, pendingPostsByTabId.get(tabId));
      }, 1000);
    }

    sendResponse({
      ok: true
    });

    return true;
  }

  if (request?.type === "FB_USER_POSTED") {
    const tabId = sender?.tab?.id;

    if (!tabId || tabId !== currentTabId || queueAdvancePending) {
      sendResponse({ ok: false });
      return true;
    }

    queueAdvancePending = true;

    setTimeout(async () => {
      const previousWindowId = currentWindowId;

      if (previousWindowId) {
        postingWindowIds.delete(previousWindowId);

        try {
          await chrome.windows.remove(previousWindowId);
        } catch (error) {
          // already closed
        }
      }

      await openNextGroup();
    }, 1800);

    sendResponse({ ok: true });
    return true;
  }

  if (request?.type === "CLOSE_POSTING_WINDOWS") {
    closePostingWindows();

    sendResponse({
      ok: true
    });

    return true;
  }

  return false;
});

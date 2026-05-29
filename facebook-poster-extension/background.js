const pendingPostsByTabId = new Map();
const postingWindowIds = new Set();
const filledTabIds = new Set();

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
    // fallback below
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

async function sendFillMessage(tabId, message, attempt = 1) {
  if (filledTabIds.has(tabId)) {
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "FILL_FACEBOOK_POST",
      message
    });

    if (response?.ok) {
      filledTabIds.add(tabId);
    }
  } catch (error) {
    if (attempt < 8 && !filledTabIds.has(tabId)) {
      setTimeout(() => {
        sendFillMessage(tabId, message, attempt + 1);
      }, 1400);
    }
  }
}

async function openPostingWindows(message, groups) {
  pendingPostsByTabId.clear();
  filledTabIds.clear();

  const clean = cleanGroups(groups);

  for (let i = 0; i < clean.length; i++) {
    const url = clean[i];
    const pos = await getGridPosition(i, clean.length);

    const createdWindow = await chrome.windows.create({
      url,
      type: "popup",
      focused: i === 0,
      left: pos.left,
      top: pos.top,
      width: pos.width,
      height: pos.height
    });

    if (createdWindow?.id) {
      postingWindowIds.add(createdWindow.id);
    }

    const tabId = createdWindow?.tabs?.[0]?.id;

    if (tabId) {
      pendingPostsByTabId.set(tabId, message);
    }
  }
}

async function closePostingWindows() {
  const ids = Array.from(postingWindowIds);

  postingWindowIds.clear();
  pendingPostsByTabId.clear();
  filledTabIds.clear();

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
    openPostingWindows(
      request.payload?.message || "",
      request.payload?.groups || []
    );

    sendResponse({
      ok: true
    });

    return true;
  }

  if (request?.type === "FB_CONTENT_READY") {
    const tabId = sender?.tab?.id;

    if (tabId && pendingPostsByTabId.has(tabId) && !filledTabIds.has(tabId)) {
      const message = pendingPostsByTabId.get(tabId);

      setTimeout(() => {
        sendFillMessage(tabId, message);
      }, 1800);
    }

    sendResponse({
      ok: true
    });

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

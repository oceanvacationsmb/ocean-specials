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

function getGridPosition(index) {
  const columns = 4;
  const width = 470;
  const height = 520;
  const gap = 12;

  const row = Math.floor(index / columns);
  const col = index % columns;

  return {
    left: 20 + col * (width + gap),
    top: 20 + row * (height + gap),
    width,
    height
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
    if (attempt < 10 && !filledTabIds.has(tabId)) {
      setTimeout(() => {
        sendFillMessage(tabId, message, attempt + 1);
      }, 1200);
    }
  }
}

async function openPostingWindows(message, groups) {
  pendingPostsByTabId.clear();
  filledTabIds.clear();

  const clean = cleanGroups(groups);

  for (let i = 0; i < clean.length; i++) {
    const url = clean[i];
    const pos = getGridPosition(i);

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
    openPostingWindows(request.payload?.message || "", request.payload?.groups || []);

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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") {
    return;
  }

  if (!pendingPostsByTabId.has(tabId)) {
    return;
  }

  if (filledTabIds.has(tabId)) {
    return;
  }

  if (!tab.url || !tab.url.startsWith("https://www.facebook.com/groups/")) {
    return;
  }

  const message = pendingPostsByTabId.get(tabId);

  setTimeout(() => {
    sendFillMessage(tabId, message);
  }, 2500);
});

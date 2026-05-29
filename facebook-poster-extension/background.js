const postingWindowIds = new Set();

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

async function openGroupWindows(groups) {
  const clean = cleanGroups(groups);

  for (let i = 0; i < clean.length; i++) {
    const pos = await getGridPosition(i, clean.length);

    const createdWindow = await chrome.windows.create({
      url: clean[i],
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
  }
}

async function closePostingWindows() {
  const ids = Array.from(postingWindowIds);

  postingWindowIds.clear();

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
    openGroupWindows(request.payload?.groups || []);

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

window.addEventListener("message", (event) => {
  if (event.source !== window) {
    return;
  }

  const data = event.data || {};

  if (data.source !== "OCEAN_SPECIALS_APP") {
    return;
  }

  if (data.type !== "START_FB_POSTING") {
    return;
  }

  chrome.runtime.sendMessage(
    {
      type: "START_FB_POSTING",
      payload: data.payload || {}
    },
    (response) => {
      window.postMessage(
        {
          source: "OCEAN_FB_EXTENSION",
          type: "START_FB_POSTING_RESPONSE",
          response: response || { ok: false }
        },
        "*"
      );
    }
  );
});

chrome.runtime.onMessage.addListener((request) => {
  if (request?.type !== "FB_POSTING_PROGRESS") {
    return false;
  }

  window.postMessage(
    {
      source: "OCEAN_FB_EXTENSION",
      type: "FB_POSTING_PROGRESS",
      prepared: request.prepared || 0,
      failed: request.failed || 0,
      total: request.total || 0
    },
    "*"
  );

  return false;
});

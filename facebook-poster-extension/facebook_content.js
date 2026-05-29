function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isVisible(el) {
  if (!el) return false;

  const rect = el.getBoundingClientRect();

  return rect.width > 0 && rect.height > 0;
}

function textIncludes(el, texts) {
  const value = String(el.innerText || el.textContent || "")
    .toLowerCase()
    .trim();

  return texts.some((text) => value.includes(text));
}

function findClickableComposer() {
  const searchTexts = [
    "write something",
    "what's on your mind",
    "create public post",
    "create post"
  ];

  const selectors = [
    '[aria-label*="Write something"]',
    '[aria-label*="Create public post"]',
    '[aria-label*="Create post"]',
    'div[role="button"]',
    'span',
    'div'
  ];

  for (const selector of selectors) {
    const elements = Array.from(document.querySelectorAll(selector));

    for (const el of elements) {
      if (!isVisible(el)) {
        continue;
      }

      const aria = String(el.getAttribute("aria-label") || "").toLowerCase();

      if (searchTexts.some((text) => aria.includes(text))) {
        return el;
      }

      if (textIncludes(el, searchTexts)) {
        return el;
      }
    }
  }

  return null;
}

function findEditableBox() {
  const dialogBoxes = Array.from(
    document.querySelectorAll('div[role="dialog"] div[contenteditable="true"]')
  ).filter(isVisible);

  if (dialogBoxes.length) {
    return dialogBoxes[dialogBoxes.length - 1];
  }

  const boxes = Array.from(
    document.querySelectorAll('div[contenteditable="true"]')
  ).filter(isVisible);

  if (boxes.length) {
    return boxes[boxes.length - 1];
  }

  return null;
}

function insertTextIntoEditable(el, text) {
  el.focus();

  const selection = window.getSelection();
  const range = document.createRange();

  range.selectNodeContents(el);
  range.collapse(false);

  selection.removeAllRanges();
  selection.addRange(range);

  const success = document.execCommand("insertText", false, text);

  if (!success) {
    el.textContent = text;
  }

  el.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: text
    })
  );

  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function showOceanStatus(message, isError = false) {
  let box = document.getElementById("ocean-specials-fill-status");

  if (!box) {
    box = document.createElement("div");
    box.id = "ocean-specials-fill-status";
    box.style.position = "fixed";
    box.style.zIndex = "999999999";
    box.style.left = "12px";
    box.style.bottom = "12px";
    box.style.padding = "12px 14px";
    box.style.borderRadius = "10px";
    box.style.fontFamily = "Arial, sans-serif";
    box.style.fontSize = "14px";
    box.style.fontWeight = "700";
    box.style.boxShadow = "0 4px 16px rgba(0,0,0,0.25)";
    document.body.appendChild(box);
  }

  box.style.background = isError ? "#b42318" : "#067647";
  box.style.color = "white";
  box.textContent = message;
}

async function fillFacebookPost(message) {
  showOceanStatus("Ocean Specials: opening post box...");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  await sleep(1200);

  const composerButton = findClickableComposer();

  if (composerButton) {
    composerButton.click();
    await sleep(2000);
  }

  let editable = findEditableBox();

  if (!editable) {
    await sleep(2000);
    editable = findEditableBox();
  }

  if (!editable) {
    showOceanStatus("Ocean Specials: could not find Facebook post box", true);
    return;
  }

  insertTextIntoEditable(editable, message);

  showOceanStatus("Ocean Specials: message filled. Review and click Post.");
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.type === "FILL_FACEBOOK_POST") {
    fillFacebookPost(request.message || "");

    sendResponse({
      ok: true
    });

    return true;
  }

  return false;
});

chrome.runtime.sendMessage({
  type: "FB_CONTENT_READY"
});

let oceanAlreadyFilled = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isVisible(el) {
  if (!el) return false;

  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== "hidden" &&
    style.display !== "none"
  );
}

function cleanText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function textIncludes(el, texts) {
  const value = cleanText(el.innerText || el.textContent || "");
  return texts.some((text) => value.includes(text));
}

function findComposerButton() {
  const searchTexts = [
    "write something",
    "create a public post",
    "create public post",
    "create post",
    "what's on your mind"
  ];

  const selectors = [
    '[aria-label*="Write something"]',
    '[aria-label*="Create a public post"]',
    '[aria-label*="Create public post"]',
    '[aria-label*="Create post"]',
    '[role="button"]',
    "span",
    "div"
  ];

  for (const selector of selectors) {
    const elements = Array.from(document.querySelectorAll(selector)).filter(isVisible);

    for (const el of elements) {
      const aria = cleanText(el.getAttribute("aria-label"));

      if (
        searchTexts.some((text) => aria.includes(text)) ||
        textIncludes(el, searchTexts)
      ) {
        return el;
      }
    }
  }

  return null;
}

function findEditableBox() {
  const selectors = [
    'div[role="dialog"] div[contenteditable="true"]',
    '[role="textbox"][contenteditable="true"]',
    'div[contenteditable="true"]'
  ];

  for (const selector of selectors) {
    const boxes = Array.from(document.querySelectorAll(selector)).filter(isVisible);

    if (boxes.length) {
      return boxes[boxes.length - 1];
    }
  }

  return null;
}

async function clickElement(el) {
  if (!el) return false;

  el.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });

  await sleep(500);

  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));

  return true;
}

function fillEditable(el, message) {
  const text = String(message || "")
    .replace(/\r\n/g, "\n")
    .trim();

  el.focus();

  const selection = window.getSelection();
  const range = document.createRange();

  range.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(range);

  try {
    document.execCommand("delete", false, null);
  } catch (error) {
    el.textContent = "";
  }

  let inserted = false;

  try {
    inserted = document.execCommand("insertText", false, text);
  } catch (error) {
    inserted = false;
  }

  if (!inserted) {
    el.innerText = text;
  }

  el.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: text
    })
  );

  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
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
    box.style.borderRadius = "8px";
    box.style.fontFamily = "Arial, sans-serif";
    box.style.fontSize = "14px";
    box.style.fontWeight = "700";
    box.style.boxShadow = "0 4px 16px rgba(0,0,0,0.25)";
    box.style.maxWidth = "420px";
    document.body.appendChild(box);
  }

  box.style.background = isError ? "#b42318" : "#067647";
  box.style.color = "white";
  box.textContent = message;
}

async function openComposer() {
  for (let attempt = 1; attempt <= 8; attempt++) {
    const existingBox = findEditableBox();

    if (existingBox) {
      return existingBox;
    }

    const composerButton = findComposerButton();

    if (composerButton) {
      showOceanStatus("Ocean Specials: opening post box...");
      await clickElement(composerButton);
      await sleep(1600);

      const editable = findEditableBox();

      if (editable) {
        return editable;
      }
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });

    await sleep(1000);
  }

  return null;
}

async function prepareFacebookPost(message) {
  if (oceanAlreadyFilled) {
    return true;
  }

  showOceanStatus("Ocean Specials: preparing Facebook post...");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  await sleep(1200);

  const editable = await openComposer();

  if (!editable) {
    showOceanStatus("Ocean Specials: post box not found. Prepare this group manually.", true);
    return false;
  }

  fillEditable(editable, message);
  oceanAlreadyFilled = true;

  await sleep(500);

  showOceanStatus("Ocean Specials: post prepared. Review and click Post.");

  return true;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.type !== "FILL_FACEBOOK_POST") {
    return false;
  }

  prepareFacebookPost(request.message || "").then((ok) => {
    sendResponse({
      ok
    });
  });

  return true;
});

setTimeout(() => {
  chrome.runtime.sendMessage({
    type: "FB_CONTENT_READY"
  });
}, 1000);

let oceanAlreadyFilled = false;
let oceanAdvanceSent = false;

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

function findEditableBox(dialogOnly = false) {
  const selectors = dialogOnly
    ? [
      'div[role="dialog"] [data-lexical-editor="true"][contenteditable="true"]',
      'div[role="dialog"] [role="textbox"][contenteditable="true"]',
      'div[role="dialog"] div[contenteditable="true"]'
    ]
    : [
    'div[role="dialog"] [data-lexical-editor="true"][contenteditable="true"]',
    'div[role="dialog"] div[contenteditable="true"]',
    '[data-lexical-editor="true"][contenteditable="true"]',
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

  el.click();
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));

  return true;
}

function getEditableText(el) {
  return String(el?.innerText || el?.textContent || "")
    .replace(/\u200b/g, "")
    .trim();
}

function hasExpectedText(el, message) {
  const actual = getEditableText(el).replace(/\s+/g, " ");
  const expected = String(message || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .replace(/\s+/g, " ");

  return expected.length > 0 && actual.includes(expected.slice(0, Math.min(80, expected.length)));
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

  const clipboardData = new DataTransfer();
  clipboardData.setData("text/plain", text);

  el.dispatchEvent(
    new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData
    })
  );

  el.dispatchEvent(
    new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: text
    })
  );

  let inserted = false;

  try {
    inserted = document.execCommand("insertText", false, text);
  } catch (error) {
    inserted = false;
  }

  if (!inserted) {
    el.textContent = text;
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

  return hasExpectedText(el, text);
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

function isFacebookPostButton(el) {
  const button = el?.closest?.('[role="button"], button');

  if (!button || !isVisible(button)) {
    return false;
  }

  const label = cleanText(
    button.getAttribute("aria-label") ||
    button.innerText ||
    button.textContent
  );

  return label === "post";
}

document.addEventListener(
  "click",
  (event) => {
    if (!oceanAlreadyFilled || oceanAdvanceSent || !isFacebookPostButton(event.target)) {
      return;
    }

    oceanAdvanceSent = true;
    showOceanStatus("Ocean Specials: posted. Opening the next group...");

    chrome.runtime.sendMessage({
      type: "FB_USER_POSTED"
    });
  },
  true
);

async function openComposer() {
  for (let attempt = 1; attempt <= 8; attempt++) {
    const existingBox = findEditableBox(true);

    if (existingBox) {
      return existingBox;
    }

    const composerButton = findComposerButton();

    if (composerButton) {
      showOceanStatus("Ocean Specials: opening post box...");
      await clickElement(composerButton);
      await sleep(1600);

      const editable = findEditableBox(true) || findEditableBox();

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

  let filled = fillEditable(editable, message);

  if (!filled) {
    await sleep(700);
    filled = fillEditable(editable, message);
  }

  if (!filled) {
    showOceanStatus("Ocean Specials: Facebook blocked the automatic fill. Click the post box and try again.", true);
    return false;
  }

  oceanAlreadyFilled = true;

  await sleep(500);

  showOceanStatus("Ocean Specials: ready. Review and click Post. The next group opens automatically.");

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

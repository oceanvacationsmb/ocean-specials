document.getElementById("closeWindows").addEventListener("click", () => {
  const status = document.getElementById("status");

  chrome.runtime.sendMessage(
    {
      type: "CLOSE_POSTING_WINDOWS"
    },
    () => {
      status.textContent = "Posting windows closed.";
    }
  );
});

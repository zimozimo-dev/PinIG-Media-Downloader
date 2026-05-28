const api = typeof browser !== "undefined" ? browser : chrome;

async function activeTab() {
  const tabs = await api.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

document.getElementById("scan").addEventListener("click", async () => {
  const status = document.getElementById("status");
  const tab = await activeTab();
  if (!tab?.id || !/instagram\.com|pinterest\.com/i.test(tab.url || "")) {
    status.textContent = "Open an Instagram or Pinterest tab first.";
    return;
  }
  try {
    await api.tabs.sendMessage(tab.id, { type: "PING" });
    status.textContent = "The floating panel is ready on this tab.";
  } catch (_) {
    status.textContent = "Refresh the page once, then try again.";
  }
});

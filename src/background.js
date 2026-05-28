const api = typeof browser !== "undefined" ? browser : chrome;

const MIME_EXTENSION = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov"
};

function safePart(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|#%{}~&]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90) || "media";
}

function extensionFromUrl(url, type) {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.match(/\.([a-z0-9]{2,5})(?:$|[/?#])/i)?.[1];
    if (ext) return ext.toLowerCase();
  } catch (_) {
    // Fall through to MIME-derived extension.
  }
  return MIME_EXTENSION[type] || (type === "video" ? "mp4" : "jpg");
}

function filenameFor(item, index, total) {
  const host = safePart(item.platform || "social");
  const kind = item.type === "video" ? "video" : "photo";
  const page = safePart(item.pageTitle || item.owner || "download");
  const id = safePart(item.id || `${kind}-${String(index + 1).padStart(3, "0")}`);
  const ext = extensionFromUrl(item.url, item.mime || item.type);
  const prefix = total > 1 ? String(index + 1).padStart(3, "0") + "-" : "";
  return `${host}/${page}/${prefix}${id}.${ext}`;
}

async function downloadItem(item, index = 0, total = 1) {
  if (!item?.url) throw new Error("Missing media URL");
  return api.downloads.download({
    url: item.url,
    filename: filenameFor(item, index, total),
    conflictAction: "uniquify",
    saveAs: false
  });
}

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return false;

  if (message.type === "PING") {
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "DOWNLOAD_MEDIA") {
    downloadItem(message.item)
      .then((downloadId) => sendResponse({ ok: true, downloadId }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "DOWNLOAD_MEDIA_BATCH") {
    const items = Array.isArray(message.items) ? message.items : [];
    (async () => {
      const results = [];
      for (let index = 0; index < items.length; index += 1) {
        try {
          const downloadId = await downloadItem(items[index], index, items.length);
          results.push({ ok: true, downloadId, url: items[index].url });
          await new Promise((resolve) => setTimeout(resolve, 180));
        } catch (error) {
          results.push({ ok: false, error: error.message, url: items[index]?.url });
        }
      }
      sendResponse({
        ok: true,
        requested: items.length,
        completed: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        results
      });
    })();
    return true;
  }

  return false;
});

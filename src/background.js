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
  const cleanType = String(type || "").split(";")[0].trim().toLowerCase();
  if (MIME_EXTENSION[cleanType]) return MIME_EXTENSION[cleanType];
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.match(/\.([a-z0-9]{2,5})(?:$|[/?#])/i)?.[1];
    if (ext && /^(jpe?g|png|webp|gif|mp4|webm|mov)$/i.test(ext)) return ext.toLowerCase();
  } catch (_) {
    // Fall through to MIME-derived extension.
  }
  return MIME_EXTENSION[cleanType] || (type === "video" ? "mp4" : "jpg");
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

function zipFilenameFor(item, index, total) {
  const kind = item.type === "video" ? "video" : "photo";
  const id = safePart(item.id || kind);
  const ext = extensionFromUrl(item.url, item.mime || item.type);
  return `${String(index + 1).padStart(Math.max(3, String(total).length), "0")}-${kind}-${id}.${ext}`;
}

function browserDownload(options) {
  return new Promise((resolve, reject) => {
    try {
      api.downloads.download(options, (downloadId) => {
        const error = api.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(downloadId);
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function downloadItem(item, index = 0, total = 1) {
  if (!item?.url) throw new Error("Missing media URL");
  return browserDownload({
    url: item.url,
    filename: filenameFor(item, index, total),
    conflictAction: "uniquify",
    saveAs: false
  });
}

const CRC_TABLE = (() => {
  const table = [];
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[index]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function bytes16(value) {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
}

function bytes32(value) {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function concatBytes(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

function buildZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach((file) => {
    const name = encoder.encode(file.name);
    const { time, date } = dosDateTime(file.date);
    const crc = crc32(file.bytes);
    const localHeader = concatBytes([
      bytes32(0x04034b50),
      bytes16(20),
      bytes16(0x0800),
      bytes16(0),
      bytes16(time),
      bytes16(date),
      bytes32(crc),
      bytes32(file.bytes.length),
      bytes32(file.bytes.length),
      bytes16(name.length),
      bytes16(0),
      name
    ]);

    const centralHeader = concatBytes([
      bytes32(0x02014b50),
      bytes16(20),
      bytes16(20),
      bytes16(0x0800),
      bytes16(0),
      bytes16(time),
      bytes16(date),
      bytes32(crc),
      bytes32(file.bytes.length),
      bytes32(file.bytes.length),
      bytes16(name.length),
      bytes16(0),
      bytes16(0),
      bytes16(0),
      bytes16(0),
      bytes32(0),
      bytes32(offset),
      name
    ]);

    localParts.push(localHeader, file.bytes);
    centralParts.push(centralHeader);
    offset += localHeader.length + file.bytes.length;
  });

  const centralDirectory = concatBytes(centralParts);
  const end = concatBytes([
    bytes32(0x06054b50),
    bytes16(0),
    bytes16(0),
    bytes16(files.length),
    bytes16(files.length),
    bytes32(centralDirectory.length),
    bytes32(offset),
    bytes16(0)
  ]);

  return concatBytes([...localParts, centralDirectory, end]);
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function zipDownloadUrl(bytes) {
  if (typeof URL.createObjectURL === "function") {
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
    return { url: blobUrl, revoke: () => URL.revokeObjectURL(blobUrl) };
  }
  return {
    url: `data:application/zip;base64,${bytesToBase64(bytes)}`,
    revoke: () => {}
  };
}

async function fetchMediaFile(item, index, total) {
  const response = await fetch(item.url, { credentials: "include" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "";
  const name = zipFilenameFor({ ...item, mime: contentType || item.mime }, index, total);
  return { name, bytes, date: new Date() };
}

async function downloadZip(items, context = {}) {
  const files = [];
  const results = [];
  for (let index = 0; index < items.length; index += 1) {
    try {
      const file = await fetchMediaFile(items[index], index, items.length);
      files.push(file);
      results.push({ ok: true, url: items[index].url, filename: file.name });
    } catch (error) {
      results.push({ ok: false, url: items[index]?.url, error: error.message });
    }
  }
  if (!files.length) throw new Error("No media files could be fetched");

  const zipBytes = buildZip(files);
  const downloadUrl = zipDownloadUrl(zipBytes);
  const host = safePart(context.platform || items[0]?.platform || "social");
  const page = safePart(context.pageTitle || items[0]?.pageTitle || "post");
  const downloadId = await browserDownload({
    url: downloadUrl.url,
    filename: `${host}/${page}.zip`,
    conflictAction: "uniquify",
    saveAs: false
  });
  setTimeout(downloadUrl.revoke, 60000);

  return {
    downloadId,
    requested: items.length,
    completed: files.length,
    failed: results.filter((result) => !result.ok).length,
    results
  };
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

  if (message.type === "DOWNLOAD_MEDIA_ZIP") {
    const items = Array.isArray(message.items) ? message.items : [];
    downloadZip(items, message.context)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

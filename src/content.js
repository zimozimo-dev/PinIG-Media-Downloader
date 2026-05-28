(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const STATE = {
    media: [],
    busy: false,
    collapsed: false,
    filter: "all",
    layout: null,
    dragging: null,
    resizing: null,
    postButtons: new Map(),
    postPositionFrame: 0,
    postRefreshTimer: 0
  };
  const INSTANCE_ID = `pinig-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const PLATFORM = location.hostname.includes("pinterest") ? "pinterest" : "instagram";
  const VIDEO_EXT = /\.(mp4|webm|mov)(?:$|[?#])/i;
  const IMAGE_EXT = /\.(jpe?g|png|webp|gif)(?:$|[?#])/i;
  const BLOCKED_IMAGE_HINTS = [
    "profile_pic",
    "s150x150",
    "x150",
    "emoji",
    "sprite",
    "favicon",
    "blank.gif"
  ];
  const LAYOUT_KEY = "pinig_panel_layout";
  const DEFAULT_LAYOUT = {
    width: 380,
    height: 256,
    margin: 18
  };
  const MIN_PANEL = {
    width: 320,
    height: 210
  };
  const MAX_PANEL_RATIO = {
    width: 0.92,
    height: 0.82
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function layoutBounds() {
    return {
      maxWidth: Math.max(MIN_PANEL.width, Math.round(window.innerWidth * MAX_PANEL_RATIO.width)),
      maxHeight: Math.max(MIN_PANEL.height, Math.round(window.innerHeight * MAX_PANEL_RATIO.height))
    };
  }

  function defaultLayout() {
    const bounds = layoutBounds();
    const width = clamp(DEFAULT_LAYOUT.width, MIN_PANEL.width, bounds.maxWidth);
    const height = clamp(DEFAULT_LAYOUT.height, MIN_PANEL.height, bounds.maxHeight);
    return {
      left: Math.max(DEFAULT_LAYOUT.margin, window.innerWidth - width - DEFAULT_LAYOUT.margin),
      top: Math.max(DEFAULT_LAYOUT.margin, window.innerHeight - height - DEFAULT_LAYOUT.margin),
      width,
      height
    };
  }

  function normalizeLayout(layout) {
    const fallback = defaultLayout();
    const bounds = layoutBounds();
    const width = clamp(Number(layout?.width) || fallback.width, MIN_PANEL.width, bounds.maxWidth);
    const height = clamp(Number(layout?.height) || fallback.height, MIN_PANEL.height, bounds.maxHeight);
    return {
      width,
      height,
      left: clamp(Number(layout?.left) || fallback.left, DEFAULT_LAYOUT.margin, window.innerWidth - width - DEFAULT_LAYOUT.margin),
      top: clamp(Number(layout?.top) || fallback.top, DEFAULT_LAYOUT.margin, window.innerHeight - height - DEFAULT_LAYOUT.margin)
    };
  }

  async function loadLayout() {
    try {
      const stored = await api.storage.local.get(LAYOUT_KEY);
      STATE.layout = normalizeLayout(stored?.[LAYOUT_KEY]);
    } catch (_) {
      STATE.layout = defaultLayout();
    }
  }

  function saveLayoutSoon() {
    clearTimeout(saveLayoutSoon._timer);
    saveLayoutSoon._timer = setTimeout(() => {
      try {
        api.storage.local.set({ [LAYOUT_KEY]: STATE.layout });
      } catch (_) {
        // Layout persistence is a convenience; interaction should keep working without it.
      }
    }, 180);
  }

  function applyPanelLayout() {
    const panel = document.querySelector(".pinig-panel");
    if (!panel) return;
    STATE.layout = normalizeLayout(STATE.layout);
    panel.style.left = `${STATE.layout.left}px`;
    panel.style.top = `${STATE.layout.top}px`;
    panel.style.width = `${STATE.layout.width}px`;
    panel.style.height = STATE.collapsed ? "auto" : `${STATE.layout.height}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }

  function bestFromSrcset(srcset) {
    if (!srcset) return "";
    return srcset
      .split(",")
      .map((part) => {
        const [url, size] = part.trim().split(/\s+/);
        const score = Number.parseInt(size, 10) || 0;
        return { url, score };
      })
      .filter((item) => item.url)
      .sort((a, b) => b.score - a.score)[0]?.url || "";
  }

  function normalizeUrlWithBase(url, base = location.href) {
    if (!url || url.startsWith("blob:") || url.startsWith("data:")) return "";
    try {
      const parsed = new URL(url, base);
      parsed.hash = "";
      return parsed.href;
    } catch (_) {
      return "";
    }
  }

  function normalizeUrl(url) {
    return normalizeUrlWithBase(url);
  }

  function typeForUrl(url, fallback = "") {
    if (fallback === "video" || VIDEO_EXT.test(url)) return "video";
    return "photo";
  }

  function stableId(url) {
    try {
      const parsed = new URL(url);
      const base = parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname;
      return base.replace(/\.[a-z0-9]{2,5}$/i, "").slice(0, 70);
    } catch (_) {
      return String(Math.random()).slice(2);
    }
  }

  function pageTitle() {
    const raw = document.title || `${PLATFORM}-${Date.now()}`;
    return raw.replace(/\s*[\|•-]\s*(Instagram|Pinterest).*$/i, "").trim() || PLATFORM;
  }

  function titleFromPostUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      const parts = parsed.pathname.split("/").filter(Boolean);
      const postIndex = parts.findIndex((part) => /^(p|reel|tv|pin)$/i.test(part));
      const slug = postIndex >= 0 ? parts[postIndex + 1] : parts.at(-1);
      return `${PLATFORM}-${slug || "post"}`;
    } catch (_) {
      return `${PLATFORM}-post`;
    }
  }

  function postCodeFromUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      const parts = parsed.pathname.split("/").filter(Boolean);
      const postIndex = parts.findIndex((part) => /^(p|reel|tv|pin)$/i.test(part));
      return postIndex >= 0 ? parts[postIndex + 1] || "" : "";
    } catch (_) {
      return "";
    }
  }

  function canonicalPostUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      parsed.hash = "";
      parsed.search = "";
      if (!parsed.pathname.endsWith("/")) parsed.pathname += "/";
      return parsed.href;
    } catch (_) {
      return "";
    }
  }

  function isUsefulImage(url, element) {
    const lower = url.toLowerCase();
    if (!IMAGE_EXT.test(lower) && !lower.includes("pinimg.com") && !lower.includes("cdninstagram")) return false;
    if (BLOCKED_IMAGE_HINTS.some((hint) => lower.includes(hint))) return false;
    const rect = element?.getBoundingClientRect?.();
    if (rect && (rect.width < 120 || rect.height < 120)) return false;
    return true;
  }

  function mediaItem(url, type, element, source = "dom", title = pageTitle()) {
    return {
      id: stableId(url),
      url,
      type,
      platform: PLATFORM,
      source,
      pageTitle: title,
      width: Math.round(element?.naturalWidth || element?.videoWidth || element?.getBoundingClientRect?.().width || 0),
      height: Math.round(element?.naturalHeight || element?.videoHeight || element?.getBoundingClientRect?.().height || 0)
    };
  }

  function collectMediaFromDocument(root, baseUrl, source = "post") {
    const found = [];
    const seenStrings = new Set();
    const postTitle = titleFromPostUrl(baseUrl);

    const addUrl = (url, fallbackType = "") => {
      const normalized = normalizeUrlWithBase(String(url || "").replace(/\\u0026/g, "&"), baseUrl);
      if (!normalized || seenStrings.has(normalized)) return;
      if (!/cdninstagram|fbcdn|pinimg|pinterest/i.test(normalized)) return;
      if (!VIDEO_EXT.test(normalized) && !IMAGE_EXT.test(normalized) && !/pinimg|cdninstagram|fbcdn/i.test(normalized)) return;
      if (BLOCKED_IMAGE_HINTS.some((hint) => normalized.toLowerCase().includes(hint))) return;
      seenStrings.add(normalized);
      found.push({
        ...mediaItem(normalized, typeForUrl(normalized, fallbackType), null, source, postTitle),
        postUrl: baseUrl
      });
    };

    const walk = (value, key = "") => {
      if (!value) return;
      if (typeof value === "string") {
        if (/url|src|uri|video|image|display|playback|thumbnail/i.test(key) || /https?:\/\//.test(value)) {
          addUrl(value, /video|playback/i.test(key) ? "video" : "photo");
        }
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => walk(item, key));
        return;
      }
      if (typeof value === "object") {
        Object.entries(value).forEach(([childKey, childValue]) => walk(childValue, childKey));
      }
    };

    root.querySelectorAll('meta[property="og:image"], meta[property="og:video"], meta[name="twitter:image"], meta[name="twitter:player:stream"]').forEach((meta) => {
      addUrl(meta.content, /video/i.test(meta.getAttribute("property") || meta.name) ? "video" : "photo");
    });

    root.querySelectorAll("video, source, img").forEach((element) => {
      const type = element.tagName === "VIDEO" || /video/i.test(element.type || "") ? "video" : "photo";
      addUrl(bestFromSrcset(element.srcset) || element.currentSrc || element.src, type);
    });

    root.querySelectorAll('script[type="application/ld+json"], script:not([src])').forEach((script) => {
      const text = script.textContent || "";
      if (!/cdninstagram|fbcdn|pinimg|video_url|display_url|images|playbackUrl/i.test(text)) return;
      try {
        walk(JSON.parse(text));
      } catch (_) {
        const matches = text.match(/https?:\\?\/\\?\/[^"'\\\s<>]+/g) || [];
        matches.forEach((match) => addUrl(match.replaceAll("\\/", "/")));
      }
    });

    return unique(found);
  }

  function collectInstagramPostFromJson(root, baseUrl) {
    const code = postCodeFromUrl(baseUrl);
    if (!code || PLATFORM !== "instagram") return [];
    const postTitle = titleFromPostUrl(baseUrl);
    const matches = [];
    const seenObjects = new WeakSet();

    const objectMatchesPost = (value) => {
      if (!value || typeof value !== "object") return false;
      const candidates = [
        value.shortcode,
        value.code,
        value.pk,
        value.id,
        value.url,
        value.permalink,
        value.link,
        value.share_url,
        value.canonical_url
      ].filter(Boolean).map(String);
      return candidates.some((candidate) => candidate === code || candidate.includes(`/p/${code}`) || candidate.includes(`/reel/${code}`) || candidate.includes(`/tv/${code}`));
    };

    const findMatchingObjects = (value) => {
      if (!value || typeof value !== "object" || seenObjects.has(value)) return;
      seenObjects.add(value);
      if (objectMatchesPost(value)) matches.push(value);
      if (Array.isArray(value)) {
        value.forEach(findMatchingObjects);
        return;
      }
      Object.values(value).forEach(findMatchingObjects);
    };

    root.querySelectorAll('script[type="application/json"], script[type="application/ld+json"], script:not([src])').forEach((script) => {
      const text = script.textContent || "";
      if (!text.includes(code) || !/cdninstagram|fbcdn|display_url|video_url|image_versions|carousel_media/i.test(text)) return;
      try {
        findMatchingObjects(JSON.parse(text));
      } catch (_) {
        // Instagram often embeds several non-JSON script bodies; skip them here.
      }
    });

    const found = [];
    const seenUrls = new Set();
    const addUrl = (url, fallbackType = "") => {
      const normalized = normalizeUrlWithBase(String(url || "").replace(/\\u0026/g, "&"), baseUrl);
      if (!normalized || seenUrls.has(normalized)) return;
      if (!/cdninstagram|fbcdn/i.test(normalized)) return;
      if (BLOCKED_IMAGE_HINTS.some((hint) => normalized.toLowerCase().includes(hint))) return;
      seenUrls.add(normalized);
      found.push({
        ...mediaItem(normalized, typeForUrl(normalized, fallbackType), null, "post-json", postTitle),
        postUrl: baseUrl
      });
    };

    const addCandidateList = (list, fallbackType) => {
      if (!Array.isArray(list)) return;
      const best = list
        .map((candidate) => ({
          url: candidate?.url || candidate?.src,
          score: Number(candidate?.width || 0) * Number(candidate?.height || 0)
        }))
        .filter((candidate) => candidate.url)
        .sort((a, b) => b.score - a.score)[0];
      addUrl(best?.url, fallbackType);
    };

    const collectFromMediaNode = (node) => {
      if (!node || typeof node !== "object") return;
      const videoUrl = node.video_url || node.playback_url || node.playbackUrl;
      const hasVideo = videoUrl || (Array.isArray(node.video_versions) && node.video_versions.length);
      if (hasVideo) {
        addCandidateList(node.video_versions, "video");
        addUrl(videoUrl, "video");
        return;
      }
      addCandidateList(node.image_versions2?.candidates, "photo");
      addUrl(node.display_url || node.displayUrl || node.thumbnail_src || node.thumbnail_url || node.src, "photo");
    };

    const collectOrdered = (node) => {
      if (!node || typeof node !== "object") return;
      const carousel = node.carousel_media || node.carouselMedia || node.edge_sidecar_to_children?.edges?.map((edge) => edge.node);
      if (Array.isArray(carousel) && carousel.length) {
        carousel.forEach(collectFromMediaNode);
        return;
      }
      collectFromMediaNode(node);
    };

    matches.forEach(collectOrdered);
    return uniquePreserveOrder(found);
  }

  function collectFromDom() {
    const items = [];

    document.querySelectorAll("video").forEach((video) => {
      const url = normalizeUrl(video.currentSrc || video.src || video.querySelector("source[src]")?.src);
      if (url) items.push(mediaItem(url, "video", video, "video"));
    });

    document.querySelectorAll("img").forEach((img) => {
      const url = normalizeUrl(bestFromSrcset(img.srcset) || img.currentSrc || img.src);
      if (url && isUsefulImage(url, img)) items.push(mediaItem(url, "photo", img, "image"));
    });

    return items;
  }

  function collectFromJson() {
    const found = [];
    const seenStrings = new Set();
    const addUrl = (url, fallbackType) => {
      const normalized = normalizeUrl(String(url || "").replace(/\\u0026/g, "&"));
      if (!normalized || seenStrings.has(normalized)) return;
      if (!/cdninstagram|fbcdn|pinimg|pinterest/i.test(normalized)) return;
      if (!VIDEO_EXT.test(normalized) && !IMAGE_EXT.test(normalized) && !/pinimg|cdninstagram|fbcdn/i.test(normalized)) return;
      seenStrings.add(normalized);
      found.push(mediaItem(normalized, typeForUrl(normalized, fallbackType), null, "json"));
    };

    const walk = (value, key = "") => {
      if (!value) return;
      if (typeof value === "string") {
        if (/url|src|uri|video|image|display/i.test(key) || /https?:\/\//.test(value)) addUrl(value, /video/i.test(key) ? "video" : "photo");
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => walk(item, key));
        return;
      }
      if (typeof value === "object") {
        Object.entries(value).forEach(([childKey, childValue]) => walk(childValue, childKey));
      }
    };

    document.querySelectorAll('script[type="application/ld+json"], script:not([src])').forEach((script) => {
      const text = script.textContent || "";
      if (!/cdninstagram|fbcdn|pinimg|video_url|display_url|images/i.test(text)) return;
      try {
        walk(JSON.parse(text));
      } catch (_) {
        const matches = text.match(/https?:\\?\/\\?\/[^"'\\\s<>]+/g) || [];
        matches.forEach((match) => addUrl(match.replaceAll("\\/", "/")));
      }
    });

    return found;
  }

  function collectFromPerformance() {
    return performance.getEntriesByType("resource")
      .map((entry) => normalizeUrl(entry.name))
      .filter((url) => /cdninstagram|fbcdn|pinimg/i.test(url) && (VIDEO_EXT.test(url) || IMAGE_EXT.test(url)))
      .map((url) => mediaItem(url, typeForUrl(url), null, "network"));
  }

  function unique(items) {
    const byUrl = new Map();
    items.forEach((item) => {
      if (!item.url) return;
      const existing = byUrl.get(item.url);
      if (!existing || (item.width * item.height) > (existing.width * existing.height)) byUrl.set(item.url, item);
    });
    return [...byUrl.values()].sort((a, b) => {
      if (a.type !== b.type) return a.type === "photo" ? -1 : 1;
      return (b.width * b.height) - (a.width * a.height);
    });
  }

  function uniquePreserveOrder(items) {
    const seen = new Set();
    return items.filter((item) => {
      if (!item.url || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  }

  function scan() {
    STATE.media = unique([
      ...collectFromDom(),
      ...collectFromJson(),
      ...collectFromPerformance()
    ]);
    attachButtons();
    renderPanel();
    return STATE.media;
  }

  function filteredMedia() {
    if (STATE.filter === "photos") return STATE.media.filter((item) => item.type === "photo");
    if (STATE.filter === "videos") return STATE.media.filter((item) => item.type === "video");
    return STATE.media;
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      try {
        api.runtime.sendMessage(message, (response) => {
          const error = api.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve(response);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function sendDownload(item) {
    return sendRuntimeMessage({ type: "DOWNLOAD_MEDIA", item });
  }

  async function sendBatch(items) {
    return sendRuntimeMessage({ type: "DOWNLOAD_MEDIA_BATCH", items });
  }

  async function sendZip(items, context) {
    return sendRuntimeMessage({ type: "DOWNLOAD_MEDIA_ZIP", items, context });
  }

  function findItemForElement(element) {
    if (element.tagName === "VIDEO") {
      const url = normalizeUrl(element.currentSrc || element.src || element.querySelector("source[src]")?.src);
      return STATE.media.find((item) => item.url === url) || (url && mediaItem(url, "video", element, "single"));
    }
    const url = normalizeUrl(bestFromSrcset(element.srcset) || element.currentSrc || element.src);
    return STATE.media.find((item) => item.url === url) || (url && mediaItem(url, "photo", element, "single"));
  }

  function isPostLink(anchor) {
    const href = anchor?.href || "";
    if (PLATFORM === "instagram") return /instagram\.com\/(p|reel|tv)\//i.test(href);
    return /pinterest\.[^/]+\/pin\//i.test(href);
  }

  function postHostFor(anchor) {
    return anchor.closest("article, [role='listitem'], [data-grid-item]") || anchor;
  }

  function isVisibleCardRect(rect) {
    if (!rect || rect.width < 96 || rect.height < 96) return false;
    if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= window.innerHeight || rect.left >= window.innerWidth) return false;
    const ratio = rect.width / rect.height;
    if (ratio < 0.45 || ratio > 2.4) return false;
    if ((rect.width * rect.height) > window.innerWidth * window.innerHeight * 0.7) return false;
    return true;
  }

  function rectScore(rect) {
    const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    const area = visibleWidth * visibleHeight;
    const squareBias = 1 - Math.min(0.8, Math.abs(Math.log(rect.width / rect.height)));
    return area * squareBias;
  }

  function rectsForElement(element) {
    if (!element?.getBoundingClientRect) return [];
    const rects = [element.getBoundingClientRect()];
    try {
      rects.push(...element.getClientRects());
    } catch (_) {
      // Some synthetic DOM nodes do not expose client rect lists consistently.
    }
    return rects;
  }

  function bestVisibleRect(elements) {
    let best = null;
    let bestScore = 0;
    elements.forEach((element) => {
      rectsForElement(element).forEach((rect) => {
        if (!isVisibleCardRect(rect)) return;
        const score = rectScore(rect);
        if (score > bestScore) {
          best = rect;
          bestScore = score;
        }
      });
    });
    return best;
  }

  function postRectFromAnchor(anchor, host) {
    const candidates = [anchor, host].filter(Boolean);
    let parent = anchor.parentElement;
    for (let depth = 0; parent && depth < 7; depth += 1) {
      candidates.push(parent);
      parent = parent.parentElement;
    }
    anchor.querySelectorAll("img, video, canvas, picture, div").forEach((element) => candidates.push(element));
    return bestVisibleRect(candidates);
  }

  function visiblePostRect(anchor, host) {
    return postRectFromAnchor(anchor, host);
  }

  function activeDialog() {
    return [...document.querySelectorAll('[role="dialog"], dialog')]
      .filter((dialog) => {
        const rect = dialog.getBoundingClientRect();
        return rect.width > 320 && rect.height > 320 && rect.bottom > 0 && rect.right > 0;
      })
      .sort((a, b) => (b.getBoundingClientRect().width * b.getBoundingClientRect().height) - (a.getBoundingClientRect().width * a.getBoundingClientRect().height))[0] || null;
  }

  function largestMediaRect(root) {
    const media = [...root.querySelectorAll("img, video")].filter((element) => {
      const src = element.currentSrc || element.src || "";
      if (BLOCKED_IMAGE_HINTS.some((hint) => src.toLowerCase().includes(hint))) return false;
      return true;
    });
    return bestVisibleRect(media) || bestVisibleRect([root]);
  }

  function currentDialogPostUrl(dialog) {
    if (isPostLink({ href: location.href })) return canonicalPostUrl(location.href);
    const link = dialog.querySelector('a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"], a[href*="/pin/"]');
    return canonicalPostUrl(link?.href || "");
  }

  function postAnchorForUrl(root, postUrl) {
    return [...root.querySelectorAll("a[href]")].find((anchor) => canonicalPostUrl(anchor.href) === postUrl) || {
      href: postUrl,
      isConnected: true,
      querySelectorAll: () => []
    };
  }

  function postLayer() {
    let layer = document.querySelector(`.pinig-post-layer[data-pinig-instance="${INSTANCE_ID}"]`);
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "pinig-post-layer";
      layer.dataset.pinigInstance = INSTANCE_ID;
      Object.assign(layer.style, {
        position: "fixed",
        inset: "0",
        zIndex: "2147483646",
        pointerEvents: "none"
      });
      (document.body || document.documentElement).appendChild(layer);
    }
    return layer;
  }

  function cleanupPostButtonDom() {
    const layer = postLayer();
    document.querySelectorAll(".pinig-post-layer").forEach((candidate) => {
      if (candidate !== layer) candidate.remove();
    });
    const ownedButtons = new Set([...STATE.postButtons.values()].map((entry) => entry.button));
    document.querySelectorAll(".pinig-post-button").forEach((button) => {
      if (!ownedButtons.has(button)) button.remove();
    });
  }

  function rectsOverlap(first, second) {
    if (!first || !second) return false;
    const width = Math.min(first.right, second.right) - Math.max(first.left, second.left);
    const height = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
    return width > 24 && height > 24;
  }

  function horizontalOverlap(first, second) {
    if (!first || !second) return 0;
    return Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
  }

  function usefulMediaElements(root) {
    return [...(root?.querySelectorAll?.("img, video") || [])].filter((element) => {
      const item = findItemForElement(element);
      if (!item) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 120) return false;
      if (item.type === "photo" && !isUsefulImage(item.url, element)) return false;
      return true;
    });
  }

  function carouselRootFor(host) {
    const elements = usefulMediaElements(host);
    if (!elements.length) return host;
    const largest = elements
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height))[0]?.element;
    let node = largest?.parentElement;
    for (let depth = 0; node && depth < 10; depth += 1) {
      if (host && !host.contains(node)) break;
      if (usefulMediaElements(node).length >= 2) return node;
      if (node === host || node === document.body) break;
      node = node.parentElement;
    }
    return host;
  }

  function mediaFallbackFromHost(host, postUrl) {
    const scopedHost = currentPostHost(host) || host;
    const carouselRoot = carouselRootFor(scopedHost);
    const mediaRect = carouselRoot ? largestMediaRect(carouselRoot) : null;
    const elements = usefulMediaElements(carouselRoot).filter((element) => {
      if (!mediaRect) return true;
      return rectsForElement(element).some((rect) => {
        const sameColumn = horizontalOverlap(rect, mediaRect) > Math.min(rect.width, mediaRect.width) * 0.35;
        const nearPost = rect.top < mediaRect.bottom + window.innerHeight * 1.4 && rect.bottom > mediaRect.top - window.innerHeight * 0.6;
        return sameColumn && nearPost;
      });
    });
    return uniquePreserveOrder(elements.map((element) => {
      const item = findItemForElement(element);
      return item ? { ...item, pageTitle: titleFromPostUrl(postUrl), postUrl, source: "post-fallback" } : null;
    }).filter(Boolean));
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function buttonText(button) {
    return [
      button.getAttribute("aria-label"),
      button.title,
      button.textContent
    ].filter(Boolean).join(" ");
  }

  function isVisibleButton(button) {
    if (!button || button.disabled) return false;
    const rect = button.getBoundingClientRect();
    return rect.width >= 20 && rect.height >= 20 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
  }

  function carouselNextButton(host) {
    const scopedHost = currentPostHost(host) || host;
    const root = carouselRootFor(scopedHost) || scopedHost;
    const buttons = [...new Set([
      ...(root?.querySelectorAll?.("button") || []),
      ...(scopedHost?.querySelectorAll?.("button") || [])
    ])];
    return buttons.find((button) => isVisibleButton(button) && /(next|下一步|chevron right)/i.test(buttonText(button)));
  }

  async function collectCarouselByWalking(host, postUrl) {
    const scopedHost = currentPostHost(host) || host;
    if (!scopedHost) return [];
    const byUrl = new Map();
    let staleSteps = 0;

    for (let step = 0; step < 24 && staleSteps < 2; step += 1) {
      const before = byUrl.size;
      mediaFallbackFromHost(scopedHost, postUrl).forEach((item) => byUrl.set(item.url, item));
      staleSteps = byUrl.size === before ? staleSteps + 1 : 0;

      const next = carouselNextButton(scopedHost);
      if (!next) break;
      next.click();
      await wait(560);
    }

    mediaFallbackFromHost(scopedHost, postUrl).forEach((item) => byUrl.set(item.url, item));
    return [...byUrl.values()];
  }

  async function mediaFromPost(anchor, host) {
    const postUrl = canonicalPostUrl(anchor.href) || normalizeUrl(anchor.href);
    if (!postUrl) return [];
    const liveItems = collectInstagramPostFromJson(document, postUrl);
    if (liveItems.length > 1) return liveItems;
    try {
      const response = await fetch(postUrl, { credentials: "include" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const exactItems = collectInstagramPostFromJson(doc, postUrl);
      if (exactItems.length > 1) return exactItems;
      const items = collectMediaFromDocument(doc, postUrl, "post");
      if (items.length > 1 && items.length <= 40) return uniquePreserveOrder(items);
    } catch (_) {
      // Some pages hide full media until opened; visible thumbnails are still useful.
    }
    const walkedItems = await collectCarouselByWalking(host, postUrl);
    if (walkedItems.length > 1) return walkedItems;
    if (liveItems.length === 1) return liveItems;
    return mediaFallbackFromHost(host, postUrl);
  }

  function currentPostHost(fallback = null) {
    if (!isPostLink({ href: location.href })) return fallback;
    const main = document.querySelector("main") || document.body;
    const media = [...main.querySelectorAll("img, video")].filter((element) => {
      const item = findItemForElement(element);
      const rect = element.getBoundingClientRect();
      return item && rect.width >= 160 && rect.height >= 160;
    });
    const rect = bestVisibleRect(media);
    if (!rect) return fallback;
    const centerX = Math.round(rect.left + rect.width / 2);
    const centerY = Math.round(rect.top + rect.height / 2);
    const element = document.elementFromPoint(centerX, centerY);
    return element?.closest?.("article, main [role='presentation'], main section, main") || fallback;
  }

  function attachElementButtons() {
    document.querySelectorAll("img, video").forEach((element) => {
      if (element.dataset.pinigReady === "1") return;
      if (isPostLink(element.closest("a"))) return;
      const item = findItemForElement(element);
      if (!item) return;
      const rect = element.getBoundingClientRect();
      if (rect.width < 140 || rect.height < 140) return;

      const host = element.parentElement;
      if (!host) return;
      const style = getComputedStyle(host);
      if (style.position === "static") host.style.position = "relative";
      host.classList.add("pinig-media-host");

      const button = document.createElement("button");
      button.className = `pinig-media-button${item.type === "video" ? " is-video" : ""}`;
      button.type = "button";
      button.title = item.type === "video" ? "Download video" : "Download photo";
      button.textContent = "↓";
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        button.disabled = true;
        try {
          const latest = findItemForElement(element) || item;
          const result = await sendDownload(latest);
          setStatus(result?.ok ? "Sent 1 media item to downloads." : `Download failed: ${result?.error || "unknown error"}`);
        } catch (error) {
          setStatus(`Download failed: ${error.message}`);
        } finally {
          button.disabled = false;
        }
      });
      host.appendChild(button);
      element.dataset.pinigReady = "1";
    });
  }

  function attachPostButtons() {
    cleanupPostButtonDom();

    const seen = new Set();
    const dialog = activeDialog();
    if (dialog) {
      const postUrl = currentDialogPostUrl(dialog);
      const rect = postUrl ? largestMediaRect(dialog) : null;
      if (postUrl && rect) {
        seen.add(`dialog:${postUrl}`);
        let entry = STATE.postButtons.get(`dialog:${postUrl}`);
        if (!entry) {
          const button = createPostButton(postUrl);
          postLayer().appendChild(button);
          entry = { button, anchor: postAnchorForUrl(dialog, postUrl), host: dialog, postUrl, mode: "dialog" };
          STATE.postButtons.set(`dialog:${postUrl}`, entry);
        }
        entry.anchor = postAnchorForUrl(dialog, postUrl);
        entry.host = dialog;
      }
      STATE.postButtons.forEach((entry, key) => {
        if (seen.has(key)) return;
        entry.button.remove();
        STATE.postButtons.delete(key);
      });
      schedulePostButtonPositioning();
      return;
    }

    const currentUrl = canonicalPostUrl(location.href);
    const currentHost = currentPostHost();
    const currentRect = currentUrl && currentHost ? largestMediaRect(currentHost) : null;
    if (currentUrl && currentRect) {
      const key = `page:${currentUrl}`;
      seen.add(key);
      let entry = STATE.postButtons.get(key);
      if (!entry) {
        const button = createPostButton(currentUrl);
        postLayer().appendChild(button);
        entry = { button, anchor: postAnchorForUrl(currentHost, currentUrl), host: currentHost, postUrl: currentUrl, mode: "page" };
        STATE.postButtons.set(key, entry);
      }
      entry.anchor = postAnchorForUrl(currentHost, currentUrl);
      entry.host = currentHost;
      entry.mode = "page";
    }

    document.querySelectorAll("a[href]").forEach((anchor) => {
      if (!isPostLink(anchor)) return;
      const postUrl = canonicalPostUrl(anchor.href);
      if (!postUrl) return;
      if (currentUrl && postUrl === currentUrl) return;
      const host = postHostFor(anchor);
      if (!visiblePostRect(anchor, host)) return;
      seen.add(postUrl);

      let entry = STATE.postButtons.get(postUrl);
      if (!entry) {
        const button = createPostButton(postUrl);
        postLayer().appendChild(button);
        entry = { button, anchor, host, postUrl, mode: "grid" };
        STATE.postButtons.set(postUrl, entry);
      }
      entry.anchor = anchor;
      entry.host = host;
      entry.mode = "grid";
    });

    STATE.postButtons.forEach((entry, postUrl) => {
      if (seen.has(postUrl)) return;
      entry.button.remove();
      STATE.postButtons.delete(postUrl);
    });
    schedulePostButtonPositioning();
  }

  function createPostButton(postUrl) {
    const button = document.createElement("button");
    button.className = "pinig-post-button";
    button.type = "button";
    button.title = "Download this post. Carousels are saved as ZIP.";
    button.innerHTML = '<span class="pinig-post-label">ZIP ↓</span>';
    applyPostButtonStyles(button);
    button.addEventListener("click", (event) => downloadPostFromButton(event, postUrl));
    return button;
  }

  function applyPostButtonStyles(button) {
    const styles = {
      position: "fixed",
      zIndex: "2147483647",
      top: "0",
      left: "0",
      right: "auto",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "62px",
      height: "34px",
      minWidth: "62px",
      padding: "0",
      margin: "0",
      border: "1px solid rgba(255,255,255,0.58)",
      borderRadius: "999px",
      color: "#f8fafc",
      background: "#0b0f19",
      boxShadow: "0 10px 28px rgba(2,6,23,0.34), 0 0 0 3px rgba(37,244,238,0.2)",
      font: "800 13px/1 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      letterSpacing: "0",
      opacity: "0.98",
      visibility: "visible",
      pointerEvents: "auto",
      cursor: "pointer",
      appearance: "none"
    };
    Object.entries(styles).forEach(([name, value]) => button.style.setProperty(name, value, "important"));
  }

  async function downloadPostFromButton(event, postUrl) {
    event.preventDefault();
    event.stopPropagation();
    const entry = STATE.postButtons.get(postUrl) || STATE.postButtons.get(`dialog:${postUrl}`) || STATE.postButtons.get(`page:${postUrl}`);
    if (!entry) return;
    const { button, anchor, host } = entry;
    button.disabled = true;
    button.classList.add("is-loading");
    try {
      setStatus("Reading post media...");
      const items = await mediaFromPost(anchor, host);
      if (!items.length) {
        setStatus("No media found in this post.");
      } else if (items.length === 1) {
        const result = await sendDownload(items[0]);
        setStatus(result?.ok ? "Sent 1 media item to downloads." : `Download failed: ${result?.error || "unknown error"}`);
      } else {
        const result = await sendZip(items, {
          platform: PLATFORM,
          pageTitle: titleFromPostUrl(postUrl),
          postUrl
        });
        setStatus(result?.ok ? `Saved ${result.completed}/${items.length} media items as ZIP.` : `ZIP failed: ${result?.error || "unknown error"}`);
      }
    } catch (error) {
      setStatus(`Download failed: ${error.message}`);
    } finally {
      button.disabled = false;
      button.classList.remove("is-loading");
    }
  }

  function positionPostButtons() {
    STATE.postPositionFrame = 0;
    STATE.postButtons.forEach((entry, key) => {
      if (entry.mode !== "dialog" && entry.mode !== "page" && !entry.anchor?.isConnected) {
        entry.button.remove();
        STATE.postButtons.delete(key);
        return;
      }
      const rect = entry.mode === "dialog" || entry.mode === "page" ? largestMediaRect(entry.host) : visiblePostRect(entry.anchor, entry.host);
      if (!rect) {
        entry.button.style.setProperty("display", "none", "important");
        return;
      }
      entry.button.style.setProperty("display", "inline-flex", "important");
      const left = Math.round(rect.left + 12);
      const top = Math.round(rect.bottom - 46);
      entry.button.style.setProperty("transform", `translate(${left}px, ${top}px)`, "important");
    });
  }

  function schedulePostButtonPositioning() {
    if (STATE.postPositionFrame) return;
    STATE.postPositionFrame = requestAnimationFrame(positionPostButtons);
  }

  function schedulePostButtonRefresh() {
    schedulePostButtonPositioning();
    clearTimeout(STATE.postRefreshTimer);
    STATE.postRefreshTimer = setTimeout(attachPostButtons, 160);
  }

  function attachButtons() {
    attachPostButtons();
    attachElementButtons();
  }

  async function scrollAndScan() {
    setBusy(true, "Loading more media from this page...");
    let stableRounds = 0;
    let previousCount = 0;
    for (let round = 0; round < 12 && stableRounds < 3; round += 1) {
      window.scrollBy({ top: Math.round(window.innerHeight * 0.85), behavior: "smooth" });
      await new Promise((resolve) => setTimeout(resolve, 900));
      const count = scan().length;
      stableRounds = count === previousCount ? stableRounds + 1 : 0;
      previousCount = count;
      setStatus(`Scanned ${count} media item${count === 1 ? "" : "s"}...`);
    }
    setBusy(false, `Ready: ${filteredMedia().length} selected.`);
  }

  function setStatus(text) {
    const node = document.querySelector(".pinig-status");
    if (node) node.textContent = text;
  }

  function setBusy(value, status) {
    STATE.busy = value;
    document.querySelectorAll(".pinig-body button, .pinig-body select").forEach((node) => {
      node.disabled = value;
    });
    if (status) setStatus(status);
  }

  async function downloadSelected() {
    scan();
    const items = filteredMedia();
    if (!items.length) {
      setStatus("No matching media found. Scroll the page and scan again.");
      return;
    }
    setBusy(true, `Starting ${items.length} download${items.length === 1 ? "" : "s"}...`);
    try {
      const result = await sendBatch(items);
      setBusy(false, result?.ok ? `Sent ${result.completed}/${items.length} to browser downloads.` : `Download failed: ${result?.error || "unknown error"}`);
    } catch (error) {
      setBusy(false, `Download failed: ${error.message}`);
    }
  }

  function renderPanel() {
    let panel = document.querySelector(".pinig-panel");
    if (!panel) {
      panel = document.createElement("section");
      panel.className = "pinig-panel";
      (document.body || document.documentElement).appendChild(panel);
      panel.innerHTML = `
        <div class="pinig-head">
          <div class="pinig-title"><img class="pinig-logo" src="${api.runtime.getURL("assets/logo.png")}" alt=""><span>PinIG Downloader</span></div>
          <div class="pinig-window-actions">
            <button type="button" class="pinig-reset" title="Reset position">⌖</button>
            <button type="button" class="pinig-toggle" title="Collapse">-</button>
          </div>
        </div>
        <div class="pinig-body">
          <div class="pinig-stats">
            <div class="pinig-stat"><strong data-pinig-stat="all">0</strong><span>All</span></div>
            <div class="pinig-stat"><strong data-pinig-stat="photos">0</strong><span>Photos</span></div>
            <div class="pinig-stat"><strong data-pinig-stat="videos">0</strong><span>Videos</span></div>
          </div>
          <div class="pinig-row">
            <select class="pinig-filter" title="Download filter">
              <option value="all">All photos + videos</option>
              <option value="photos">Photos only</option>
              <option value="videos">Videos only</option>
            </select>
            <button type="button" class="pinig-scan">Scan page</button>
          </div>
          <div class="pinig-row">
            <button type="button" class="pinig-load">Load more</button>
            <button type="button" class="pinig-download primary">Download</button>
          </div>
          <div class="pinig-status">Ready.</div>
        </div>
        <div class="pinig-resize" title="Resize"></div>
      `;

      panel.addEventListener("pointerdown", (event) => event.stopPropagation());
      panel.addEventListener("click", (event) => event.stopPropagation());

      panel.querySelector(".pinig-head").addEventListener("pointerdown", startDrag);
      panel.querySelector(".pinig-resize").addEventListener("pointerdown", startResize);
      panel.querySelector(".pinig-reset").addEventListener("click", () => {
        STATE.layout = defaultLayout();
        applyPanelLayout();
        saveLayoutSoon();
      });
      panel.querySelector(".pinig-toggle").addEventListener("click", () => {
        STATE.collapsed = !STATE.collapsed;
        updatePanel();
      });
      panel.querySelector(".pinig-filter")?.addEventListener("change", (event) => {
        STATE.filter = event.target.value;
        updatePanel();
        setStatus(`Ready: ${filteredMedia().length} selected.`);
      });
      panel.querySelector(".pinig-scan")?.addEventListener("click", () => {
        scan();
        setStatus(`Ready: ${filteredMedia().length} selected.`);
      });
      panel.querySelector(".pinig-load")?.addEventListener("click", scrollAndScan);
      panel.querySelector(".pinig-download")?.addEventListener("click", downloadSelected);
    }
    updatePanel();
  }

  function startDrag(event) {
    if (event.button !== 0 || event.target.closest("button, select, input, .pinig-resize")) return;
    const panel = document.querySelector(".pinig-panel");
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    STATE.dragging = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    panel.classList.add("is-moving");
    panel.setPointerCapture(event.pointerId);
    panel.addEventListener("pointermove", dragPanel);
    panel.addEventListener("pointerup", stopDrag);
    panel.addEventListener("pointercancel", stopDrag);
    event.preventDefault();
  }

  function dragPanel(event) {
    if (!STATE.dragging || event.pointerId !== STATE.dragging.pointerId) return;
    STATE.layout = normalizeLayout({
      ...STATE.layout,
      left: event.clientX - STATE.dragging.offsetX,
      top: event.clientY - STATE.dragging.offsetY
    });
    applyPanelLayout();
  }

  function stopDrag(event) {
    const panel = document.querySelector(".pinig-panel");
    if (panel) {
      panel.classList.remove("is-moving");
      panel.removeEventListener("pointermove", dragPanel);
      panel.removeEventListener("pointerup", stopDrag);
      panel.removeEventListener("pointercancel", stopDrag);
      try {
        panel.releasePointerCapture(event.pointerId);
      } catch (_) {}
    }
    STATE.dragging = null;
    saveLayoutSoon();
  }

  function startResize(event) {
    if (event.button !== 0 || STATE.collapsed) return;
    const panel = document.querySelector(".pinig-panel");
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    STATE.resizing = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height
    };
    panel.classList.add("is-resizing");
    panel.setPointerCapture(event.pointerId);
    panel.addEventListener("pointermove", resizePanel);
    panel.addEventListener("pointerup", stopResize);
    panel.addEventListener("pointercancel", stopResize);
    event.preventDefault();
  }

  function resizePanel(event) {
    if (!STATE.resizing || event.pointerId !== STATE.resizing.pointerId) return;
    const bounds = layoutBounds();
    const nextWidth = clamp(STATE.resizing.width + event.clientX - STATE.resizing.startX, MIN_PANEL.width, bounds.maxWidth);
    const nextHeight = clamp(STATE.resizing.height + event.clientY - STATE.resizing.startY, MIN_PANEL.height, bounds.maxHeight);
    STATE.layout = normalizeLayout({
      ...STATE.layout,
      width: nextWidth,
      height: nextHeight
    });
    applyPanelLayout();
  }

  function stopResize(event) {
    const panel = document.querySelector(".pinig-panel");
    if (panel) {
      panel.classList.remove("is-resizing");
      panel.removeEventListener("pointermove", resizePanel);
      panel.removeEventListener("pointerup", stopResize);
      panel.removeEventListener("pointercancel", stopResize);
      try {
        panel.releasePointerCapture(event.pointerId);
      } catch (_) {}
    }
    STATE.resizing = null;
    saveLayoutSoon();
  }

  function updatePanel() {
    const panel = document.querySelector(".pinig-panel");
    if (!panel) return;
    const photos = STATE.media.filter((item) => item.type === "photo").length;
    const videos = STATE.media.filter((item) => item.type === "video").length;
    const selected = filteredMedia().length;
    applyPanelLayout();
    panel.classList.toggle("is-collapsed", STATE.collapsed);
    panel.querySelector(".pinig-toggle").textContent = STATE.collapsed ? "+" : "-";
    panel.querySelector(".pinig-toggle").title = STATE.collapsed ? "Expand" : "Collapse";
    panel.querySelector('[data-pinig-stat="all"]').textContent = STATE.media.length;
    panel.querySelector('[data-pinig-stat="photos"]').textContent = photos;
    panel.querySelector('[data-pinig-stat="videos"]').textContent = videos;
    panel.querySelector(".pinig-filter").value = STATE.filter;
    panel.querySelector(".pinig-download").textContent = `Download ${selected || ""}`.trim();
  }

  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "PING") {
      scan();
      sendResponse({ ok: true, count: STATE.media.length });
    }
    return false;
  });

  const observer = new MutationObserver((mutations) => {
    const onlyOwnChanges = mutations.every((mutation) => {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      return target?.closest(".pinig-panel, .pinig-media-button, .pinig-media-host, .pinig-post-button, .pinig-post-layer, .pinig-post-host");
    });
    if (onlyOwnChanges) return;
    clearTimeout(observer._timer);
    observer._timer = setTimeout(scan, 450);
  });

  window.addEventListener("resize", () => {
    STATE.layout = normalizeLayout(STATE.layout);
    applyPanelLayout();
    schedulePostButtonPositioning();
    saveLayoutSoon();
  });

  window.addEventListener("scroll", schedulePostButtonRefresh, { passive: true });

  loadLayout().finally(() => {
    scan();
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
})();

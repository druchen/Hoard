const NATIVE_HOST = "com.hoard.bridge";
const MENU_CINEMATOGRAPHY = "hoard-cinematography";
const MENU_CONCEPT = "hoard-concept";
const MENU_FOLDERS = {
  [MENU_CINEMATOGRAPHY]: "cinematography",
  [MENU_CONCEPT]: "concept",
};
const DEFAULT_FOLDER_KEY = "cinematography";
const IMAGE_URL_EXT = /\.(jpe?g|png|gif|webp|avif|bmp)(\?|#|$)/i;
const WEBP_QUALITY = 0.8;
const REFERER_RULE_ID = 1;
let saveChain = Promise.resolve();

// Pending overwrites: saveId → { filename, webpB64, folderKey, metadataMissing }
const pendingOverwrites = new Map();

function isImageResponse(contentType, url) {
  const type = (contentType || "").toLowerCase();
  if (type.includes("svg")) {
    return false;
  }
  if (!type || type.includes("octet-stream") || type.includes("binary")) {
    return IMAGE_URL_EXT.test(url || "");
  }
  return type.includes("image");
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

/**
 * fetch() cannot set Referer itself, and many sites block image downloads without one.
 * While this extension downloads an image, a short-lived session rule sends the page's
 * origin as Referer (what the browser itself would send when loading the image).
 */
async function setRefererRule(url, referer) {
  let origin;
  let host;
  try {
    origin = new URL(referer).origin;
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  if (!/^https?:/i.test(origin) || !chrome.declarativeNetRequest?.updateSessionRules) {
    return false;
  }
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [REFERER_RULE_ID],
      addRules: [
        {
          id: REFERER_RULE_ID,
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: [{ header: "Referer", operation: "set", value: `${origin}/` }],
          },
          condition: {
            requestDomains: [host],
            tabIds: [chrome.tabs.TAB_ID_NONE],
            resourceTypes: ["xmlhttprequest", "other"],
          },
        },
      ],
    });
    return true;
  } catch (err) {
    console.warn("Hoard: could not set Referer rule:", err);
    return false;
  }
}

async function clearRefererRule() {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [REFERER_RULE_ID] });
  } catch {
    // Rule was never added.
  }
}

function describeHttpError(status) {
  if (status === 401 || status === 403) {
    return `The site refused the download (${status}). Make sure you are logged in, or open the image in its own tab and save from there.`;
  }
  if (status === 404) {
    return "Image not found on the server (404).";
  }
  return `Failed to download image (${status}).`;
}

async function fetchImageInBackground(url, referer) {
  const ruleSet = referer ? await setRefererRule(url, referer) : false;
  try {
    let response;
    try {
      response = await fetch(url, { credentials: "include" });
    } catch (err) {
      throw new Error(`Could not reach image server: ${err.message}`);
    }
    if (!response.ok) {
      throw new Error(describeHttpError(response.status));
    }

    const contentType = response.headers.get("Content-Type") || "";
    if (contentType.toLowerCase().includes("svg")) {
      throw new Error("SVG images are not supported.");
    }
    if (!isImageResponse(contentType, url)) {
      throw new Error("URL did not return an image (it may be a web page or video).");
    }

    const data = arrayBufferToBase64(await response.arrayBuffer());
    return { data, contentType };
  } finally {
    if (ruleSet) {
      await clearRefererRule();
    }
  }
}

async function convertImageDataToWebPBase64(data, contentType) {
  if ((contentType || "").toLowerCase().includes("image/webp")) {
    // Already WebP: keep the original bytes instead of re-encoding.
    return data;
  }
  const blob = new Blob([base64ToBytes(data)], { type: contentType || "image/jpeg" });
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new Error(`Could not decode image (${contentType || "unknown type"}).`);
  }
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const webpBlob = await canvas.convertToBlob({ type: "image/webp", quality: WEBP_QUALITY });
  return arrayBufferToBase64(await webpBlob.arrayBuffer());
}

function describeNativeError(message) {
  const id = chrome.runtime.id;
  if (/not found/i.test(message)) {
    return `Hoard native bridge is not installed. Run scripts/install_native_host with extension ID ${id}.`;
  }
  if (/forbidden/i.test(message)) {
    return `The native bridge does not allow this extension. Re-run scripts/install_native_host with extension ID ${id}.`;
  }
  if (/exited|failed to start/i.test(message)) {
    return `${message} Check that Python 3 is installed and re-run scripts/install_native_host.`;
  }
  return `${message} Install the Hoard native bridge (see README).`;
}

function saveViaNativeHost(filename, data, folderKey, metadataMissing, overwrite = false) {
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(
      NATIVE_HOST,
      {
        filename,
        data,
        folderKey: folderKey || DEFAULT_FOLDER_KEY,
        overwrite,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: describeNativeError(chrome.runtime.lastError.message) });
          return;
        }
        if (metadataMissing && response?.ok) {
          response.note = "Title/year not found; used still id for filename.";
        }
        resolve(response || { ok: false, error: "Native bridge returned no response." });
      }
    );
  });
}

async function getLastFolderKey() {
  try {
    const { lastFolderKey } = await chrome.storage.local.get("lastFolderKey");
    return lastFolderKey || DEFAULT_FOLDER_KEY;
  } catch {
    return DEFAULT_FOLDER_KEY;
  }
}

/** Folder for an H-hotkey save: site default, else the last folder picked from the menu. */
async function resolveFolderKey(folderKey, pageUrl) {
  if (folderKey) return folderKey;
  let host = "";
  try {
    host = new URL(pageUrl).hostname;
  } catch {
    host = "";
  }
  if (host === "shotdeck.com" || host.endsWith(".shotdeck.com")) return "cinematography";
  if (host === "artstation.com" || host.endsWith(".artstation.com")) return "concept";
  return getLastFolderKey();
}

async function hoardSaveRemote(message) {
  const urls = Array.isArray(message.urls) ? message.urls : [];
  const referer = message.referer || "";
  const filename = message.filename || "hoard.webp";
  const folderKey = await resolveFolderKey(message.folderKey, referer);

  let lastError = null;
  let imageData = message.data || null;
  let contentType = message.contentType || null;

  if (!imageData) {
    for (const url of urls) {
      if (!url || !/^https?:\/\//i.test(url)) {
        continue;
      }
      try {
        const result = await fetchImageInBackground(url, referer);
        imageData = result.data;
        contentType = result.contentType;
        break;
      } catch (err) {
        lastError = err;
      }
    }
  }

  if (!imageData) {
    throw lastError || new Error("Failed to download image");
  }

  const webpB64 = await convertImageDataToWebPBase64(imageData, contentType);
  const result = await saveViaNativeHost(filename, webpB64, folderKey, message.metadataMissing);

  if (result.exists) {
    const saveId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingOverwrites.set(saveId, { filename, webpB64, folderKey, metadataMissing: message.metadataMissing });
    // Auto-expire after 2 minutes
    setTimeout(() => pendingOverwrites.delete(saveId), 120000);
    return { ok: false, exists: true, filename: result.filename, folder: result.folder, saveId };
  }

  return result;
}

function enqueueSave(task) {
  const next = saveChain.then(task, task);
  saveChain = next.catch(() => {});
  return next;
}

/** Filename from the image URL, used when the page script is unavailable. */
function fallbackFilename(srcUrl, pageUrl) {
  let host = "hoard";
  try {
    host = new URL(pageUrl).hostname.replace(/^www\./, "") || host;
  } catch {
    // keep default
  }
  let base = "";
  try {
    const last = new URL(srcUrl).pathname.split("/").filter(Boolean).pop() || "";
    base = decodeURIComponent(last)
      .replace(/\.[^.]+$/, "")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 150);
  } catch {
    base = "";
  }
  return `${base || `${host}_${Date.now()}`}.webp`;
}

/**
 * Save straight from the background when the tab has no Hoard page script
 * (tab opened before the extension was installed or updated, or a restricted page).
 */
async function saveWithoutPageScript(info, tab, folderKey) {
  const srcUrl = info.srcUrl || "";
  if (!/^https?:\/\//i.test(srcUrl)) {
    notify("Hoard save failed", "Reload the page and try again.");
    return;
  }
  const pageUrl = info.frameUrl || info.pageUrl || tab?.url || "";
  try {
    const result = await enqueueSave(() =>
      hoardSaveRemote({
        urls: [srcUrl],
        referer: pageUrl,
        filename: fallbackFilename(srcUrl, pageUrl),
        folderKey,
      })
    );
    if (result.exists) {
      notify("Hoard", `Already saved: ${result.filename}\nReload the page to get the overwrite option.`);
      return;
    }
    handleSaveResult(result);
  } catch (err) {
    notify("Hoard save failed", String(err.message || err));
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create(
      {
        id: MENU_CINEMATOGRAPHY,
        title: "Hoard — Cinematography (H)",
        contexts: ["image"],
      },
      () => void chrome.runtime.lastError
    );
    chrome.contextMenus.create(
      {
        id: MENU_CONCEPT,
        title: "Hoard — Concept (H)",
        contexts: ["image"],
      },
      () => void chrome.runtime.lastError
    );
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const folderKey = MENU_FOLDERS[info.menuItemId];
  if (!folderKey) return;

  chrome.storage.local.set({ lastFolderKey: folderKey }).catch(() => {});

  if (!tab?.id || tab.id < 0) {
    void saveWithoutPageScript(info, tab, folderKey);
    return;
  }

  chrome.tabs.sendMessage(
    tab.id,
    { action: "hoardSave", srcUrl: info.srcUrl || "", folderKey },
    { frameId: info.frameId || 0 },
    () => {
      if (chrome.runtime.lastError) {
        void saveWithoutPageScript(info, tab, folderKey);
      }
    }
  );
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "showResult") {
    if (message.result) handleSaveResult(message.result);
    return false;
  }

  if (message.action === "hoardSaveRemote") {
    enqueueSave(() => hoardSaveRemote(message))
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }

  if (message.action === "hoardConfirmOverwrite") {
    const pending = pendingOverwrites.get(message.saveId);
    if (!pending) {
      sendResponse({ ok: false, error: "Save expired. Please try saving again." });
      return true;
    }
    pendingOverwrites.delete(message.saveId);
    enqueueSave(() =>
      saveViaNativeHost(pending.filename, pending.webpB64, pending.folderKey, pending.metadataMissing, true)
    )
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }

  return false;
});

function handleSaveResult(result) {
  if (!result) {
    notify("Hoard save failed", "No response from page script.");
    return;
  }
  if (result.ok) {
    let msg = `Saved: ${result.filename || "image"}`;
    if (result.folder) msg += `\n${result.folder}`;
    if (result.note) msg += ` (${result.note})`;
    notify("Hoard", msg);
  } else {
    notify("Hoard save failed", result.error || "Unknown error");
  }
}

function notify(title, message) {
  const safeTitle = String(title || "Hoard").trim() || "Hoard";
  const safeMessage = String(message || "").trim();
  if (!safeMessage) return;

  const iconUrl = chrome.runtime.getURL("icon48.png");
  chrome.notifications.create(
    {
      type: "basic",
      iconUrl,
      title: safeTitle,
      message: safeMessage,
    },
    (notificationId) => {
      if (chrome.runtime.lastError) {
        console.error("Hoard notification failed:", chrome.runtime.lastError.message, iconUrl);
      } else if (notificationId) {
        setTimeout(() => {
          chrome.notifications.clear(notificationId, () => void chrome.runtime.lastError);
        }, 12000);
      }
    }
  );
}

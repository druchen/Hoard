importScripts("hoard-settings.js");

const NATIVE_HOST = "com.hoard.bridge";
const MENU_ID = "hoard";
const CONTENT_SCRIPTS = ["hoard-settings.js", "hoard-common.js", "sd.js", "artstation.js", "content.js"];
const IMAGE_URL_EXT = /\.(jpe?g|png|gif|webp|avif|bmp)(\?|#|$)/i;
const REFERER_RULE_ID = 1;
const MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/pjpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/bmp": "bmp",
};
let saveChain = Promise.resolve();

// Saves waiting on the rename/overwrite dialog: saveId → { filename, ext, data, folderPath, folderName, note }
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

function extensionForMime(contentType, url) {
  const mime = (contentType || "").split(";")[0].trim().toLowerCase();
  if (MIME_EXTENSIONS[mime]) return MIME_EXTENSIONS[mime];
  const match = (url || "").match(IMAGE_URL_EXT);
  if (match) return match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  return "jpg";
}

/**
 * Encode the downloaded image in the chosen format. Images already in that format are kept
 * as-is so they are not compressed twice.
 */
async function encodeImage(data, contentType, sourceUrl, format, quality) {
  const target = HOARD_FORMATS[format] || HOARD_FORMATS[HOARD_DEFAULT_FORMAT];
  const sourceMime = (contentType || "").split(";")[0].trim().toLowerCase();

  if (!target.mime) {
    return { data, ext: extensionForMime(contentType, sourceUrl) };
  }
  if (sourceMime === target.mime || (target.ext === "jpg" && sourceMime === "image/jpg")) {
    return { data, ext: target.ext };
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
  if (target.mime === "image/jpeg") {
    // JPEG has no transparency; flatten onto white instead of black.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, bitmap.width, bitmap.height);
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const options = { type: target.mime };
  if (target.lossy) options.quality = clampHoardQuality(quality) / 100;
  const encoded = await canvas.convertToBlob(options);
  if (encoded.type !== target.mime) {
    throw new Error(`This browser cannot encode ${target.label}.`);
  }
  return { data: arrayBufferToBase64(await encoded.arrayBuffer()), ext: target.ext };
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

function sendToBridge(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(NATIVE_HOST, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: describeNativeError(chrome.runtime.lastError.message) });
        return;
      }
      resolve(response || { ok: false, error: "Native bridge returned no response." });
    });
  });
}

async function saveViaNativeHost(pending, overwrite = false) {
  const response = await sendToBridge({
    action: "save",
    filename: pending.filename,
    data: pending.data,
    folderPath: pending.folderPath,
    overwrite,
  });
  if (response.ok && pending.note) {
    response.note = pending.note;
  }
  return response;
}

async function findFolder(folderId) {
  const settings = await loadHoardSettings();
  const folder = settings.folders.find((f) => f.id === folderId);
  if (!folder) {
    throw new Error("That save folder no longer exists. Pick another or open Hoard settings.");
  }
  if (!folder.path) {
    throw new Error(`No path set for "${hoardFolderLabel(folder)}". Open Hoard settings to add one.`);
  }
  return { folder, settings };
}

async function hoardSaveRemote(message) {
  const { folder, settings } = await findFolder(message.folderId);
  const urls = Array.isArray(message.urls) ? message.urls : [];
  const referer = message.referer || "";
  const baseName = message.filename || "hoard";

  let lastError = null;
  let imageData = message.data || null;
  let contentType = message.contentType || null;
  let sourceUrl = "";

  if (!imageData) {
    for (const url of urls) {
      if (!url || !/^https?:\/\//i.test(url)) {
        continue;
      }
      try {
        const result = await fetchImageInBackground(url, referer);
        imageData = result.data;
        contentType = result.contentType;
        sourceUrl = url;
        break;
      } catch (err) {
        lastError = err;
      }
    }
  }

  if (!imageData) {
    throw lastError || new Error("Failed to download image");
  }

  const encoded = await encodeImage(imageData, contentType, sourceUrl, settings.format, settings.quality);
  const pending = {
    filename: `${baseName}.${encoded.ext}`,
    ext: encoded.ext,
    data: encoded.data,
    folderPath: folder.path,
    folderName: hoardFolderLabel(folder),
    note: message.metadataMissing ? "Title/year not found; used still id for filename." : "",
  };
  return finishSave(pending, await saveViaNativeHost(pending));
}

/** Hand an "already exists" result to the page's rename dialog, keeping the image for the retry. */
function finishSave(pending, result) {
  if (result.exists) {
    const saveId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingOverwrites.set(saveId, pending);
    // Auto-expire after 5 minutes
    setTimeout(() => pendingOverwrites.delete(saveId), 300000);
    return {
      ok: false,
      exists: true,
      filename: result.filename,
      suggested: result.suggested,
      folder: result.folder,
      folderName: pending.folderName,
      saveId,
    };
  }
  return { ...result, folderName: pending.folderName };
}

/** Save under a name typed in the rename dialog (or overwrite the existing file). */
async function saveAs(saveId, filename, overwrite) {
  const pending = pendingOverwrites.get(saveId);
  if (!pending) {
    return { ok: false, error: "Save expired. Please try saving again." };
  }
  pendingOverwrites.delete(saveId);
  let name = String(filename || "").trim() || pending.filename;
  if (!name.toLowerCase().endsWith(`.${pending.ext}`)) {
    // Keep the saved format's extension even if the user deleted or changed it.
    name = `${name.replace(/\.(webp|jpe?g|png|gif|avif|bmp)$/i, "")}.${pending.ext}`;
  }
  const next = { ...pending, filename: name };
  return finishSave(next, await saveViaNativeHost(next, overwrite));
}

function enqueueSave(task) {
  const next = saveChain.then(task, task);
  saveChain = next.catch(() => {});
  return next;
}

function createMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create(
      { id: MENU_ID, title: "Hoard", contexts: ["image"] },
      () => void chrome.runtime.lastError
    );
  });
}

/** Ask the page to show the folder popup; inject the page scripts first if the tab predates the extension. */
async function showPicker(tab, info) {
  const target = { tabId: tab.id, frameIds: [info.frameId || 0] };
  const message = { action: "hoardPick", srcUrl: info.srcUrl || "" };
  const send = () =>
    chrome.tabs.sendMessage(tab.id, message, { frameId: info.frameId || 0 });
  try {
    await send();
    return;
  } catch {
    // No Hoard page script in this frame yet.
  }
  try {
    await chrome.scripting.executeScript({ target, files: CONTENT_SCRIPTS });
    await send();
  } catch (err) {
    notify("Hoard", `Reload the page to use Hoard here. (${err.message || err})`);
  }
}

/** First run (or upgrade from fixed folders): seed folders from the bridge's config.py. */
async function seedFoldersIfNeeded() {
  const stored = await chrome.storage.local.get("folders");
  if (Array.isArray(stored.folders)) return;

  const response = await sendToBridge({ action: "defaults" });
  const defaults = response.ok && Array.isArray(response.folders) ? response.folders : [];
  const folders = defaults.map((folder, i) => ({
    id: crypto.randomUUID(),
    name: folder.name || `Folder ${i + 1}`,
    path: folder.path || "",
    key: i < 9 ? String(i + 1) : "",
  }));
  await chrome.storage.local.set({
    folders,
    format: HOARD_DEFAULT_FORMAT,
    quality: HOARD_DEFAULT_QUALITY,
  });
  if (folders.length === 0) {
    chrome.runtime.openOptionsPage();
  }
}

chrome.runtime.onInstalled.addListener(() => {
  createMenu();
  seedFoldersIfNeeded().catch((err) => console.error("Hoard setup:", err));
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  if (!tab?.id || tab.id < 0) {
    notify("Hoard", "Hoard can't open its folder menu here.");
    return;
  }
  void showPicker(tab, info);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "showResult") {
    if (message.result) handleSaveResult(message.result);
    return false;
  }

  if (message.action === "openSettings") {
    chrome.runtime.openOptionsPage();
    return false;
  }

  if (message.action === "bridge") {
    // Settings page: ping / pickFolder / defaults.
    const allowed = ["ping", "pickFolder", "defaults"];
    const fromSettingsPage = sender.url?.startsWith(chrome.runtime.getURL(""));
    if (!fromSettingsPage || !allowed.includes(message.request?.action)) {
      sendResponse({ ok: false, error: "Unsupported bridge request." });
      return false;
    }
    sendToBridge(message.request).then(sendResponse);
    return true;
  }

  if (message.action === "hoardSaveRemote") {
    enqueueSave(() => hoardSaveRemote(message))
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }

  if (message.action === "hoardSaveAs") {
    enqueueSave(() => saveAs(message.saveId, message.filename, Boolean(message.overwrite)))
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
    let msg = `Saved to ${result.folderName || "folder"}: ${result.filename || "image"}`;
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

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

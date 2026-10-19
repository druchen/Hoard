const NATIVE_HOST = "com.hoard.bridge";
const MENU_SHOTDECK = "hoard-shotdeck";
const MENU_ARTSTATION = "hoard-artstation";
const IMAGE_URL_EXT = /\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i;
const WEBP_QUALITY = 0.8;
let saveChain = Promise.resolve();

// Pending overwrites: saveId → { filename, webpB64, folderKey, metadataMissing }
const pendingOverwrites = new Map();

function isImageResponse(contentType, url) {
  const type = (contentType || "").toLowerCase();
  if (type.includes("svg")) {
    return false;
  }
  if (!type || type.includes("octet-stream")) {
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

async function fetchImageInBackground(url, referer) {
  const headers = {};
  if (referer) {
    headers.Referer = referer;
  }

  const response = await fetch(url, {
    credentials: "include",
    headers,
  });
  if (!response.ok) {
    throw new Error(`Failed to download image (${response.status})`);
  }

  const contentType = response.headers.get("Content-Type") || "";
  if (!isImageResponse(contentType, url)) {
    throw new Error("URL did not return a supported image");
  }

  const data = arrayBufferToBase64(await response.arrayBuffer());
  return { data, contentType };
}

function base64ToBytes(base64) {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

async function convertImageDataToWebPBase64(data, contentType) {
  const blob = new Blob([base64ToBytes(data)], { type: contentType || "image/jpeg" });
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const webpBlob = await canvas.convertToBlob({ type: "image/webp", quality: WEBP_QUALITY });
  return arrayBufferToBase64(await webpBlob.arrayBuffer());
}

function saveViaNativeHost(filename, data, folderKey, metadataMissing, overwrite = false) {
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(
      NATIVE_HOST,
      {
        filename,
        data,
        folderKey: folderKey || "cinematography",
        overwrite,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            error:
              chrome.runtime.lastError.message +
              " Install the Hoard native bridge (see README).",
          });
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

async function hoardSaveRemote(message) {
  const urls = Array.isArray(message.urls) ? message.urls : [];
  const referer = message.referer || "";
  const filename = message.filename || "hoard.webp";
  const folderKey = message.folderKey || "cinematography";

  let lastError = null;
  let imageData = null;
  let contentType = null;

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

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create(
      {
        id: MENU_SHOTDECK,
        title: "Hoard — Cinematography (H)",
        contexts: ["image"],
        documentUrlPatterns: ["*://shotdeck.com/*"],
      },
      () => void chrome.runtime.lastError
    );
    chrome.contextMenus.create(
      {
        id: MENU_ARTSTATION,
        title: "Hoard — Concept (H)",
        contexts: ["image"],
        documentUrlPatterns: ["*://*.artstation.com/*", "*://artstation.com/*"],
      },
      () => void chrome.runtime.lastError
    );
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;

  let folderKey = null;
  if (info.menuItemId === MENU_SHOTDECK) {
    folderKey = "cinematography";
  } else if (info.menuItemId === MENU_ARTSTATION) {
    folderKey = "concept";
  } else {
    return;
  }

  chrome.tabs.sendMessage(
    tab.id,
    { action: "hoardSave", srcUrl: info.srcUrl || "", folderKey },
    () => {
      if (chrome.runtime.lastError) {
        notify(
          "Hoard save failed",
          chrome.runtime.lastError.message +
            " Reload the page after updating the extension."
        );
      }
    }
  );
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "showResult") {
    if (message.result) handleSaveResult(message.result);
    return false;
  }

  if (message.action === "fetchImage") {
    fetchImageInBackground(message.url, message.referer)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: `${err.message}`,
          url: message.url,
        })
      );
    return true;
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

  if (message.action !== "nativeSave") {
    return false;
  }

  chrome.runtime.sendNativeMessage(
    NATIVE_HOST,
    {
      filename: message.filename,
      data: message.data,
      folderKey: message.folderKey || "cinematography",
    },
    (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({
          ok: false,
          error:
            chrome.runtime.lastError.message +
            " Install the Hoard native bridge (see README).",
        });
        return;
      }
      if (message.metadataMissing && response?.ok) {
        response.note = "Title/year not found; used still id for filename.";
      }
      sendResponse(response);
    }
  );

  return true;
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

/** Content script: Hoard menu item / H key → folder popup at the cursor → save. */

let lastContextImg = null;
let lastContextPos = null;
let lastContextTime = 0;
let saveInFlight = false;
const CONTEXT_HOTKEY_MS = 5000;
const CONTEXT_MENU_MS = 30000;

document.addEventListener(
  "contextmenu",
  (e) => {
    lastContextPos = { x: e.clientX, y: e.clientY };
    const img = imageAtPoint(e);
    lastContextImg = img;
    lastContextTime = img ? Date.now() : 0;
  },
  true
);

document.addEventListener(
  "keydown",
  (e) => {
    if (e.key?.toLowerCase() !== "h" || e.ctrlKey || e.altKey || e.metaKey) {
      return;
    }
    if (hoardPickerIsOpen()) {
      return;
    }
    if (e.target.closest?.("input, textarea, select, [contenteditable]:not([contenteditable=false])")) {
      return;
    }
    if (!lastContextTime || Date.now() - lastContextTime > CONTEXT_HOTKEY_MS) {
      // Only act right after an image right-click; plain "h" typing elsewhere stays untouched.
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const img = lastContextImg;
    lastContextTime = 0;
    void pickFolderAndSave(img.currentSrc || img.src || "", img, lastContextPos);
  },
  true
);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== "hoardPick") {
    return false;
  }

  const recent = Date.now() - lastContextTime < CONTEXT_MENU_MS;
  const img = findImageForUrl(message.srcUrl) || (recent ? lastContextImg : null);
  lastContextTime = 0;
  void pickFolderAndSave(
    message.srcUrl || img?.currentSrc || img?.src || "",
    img,
    recent ? lastContextPos : imageCenter(img)
  );
  sendResponse({ received: true });
  return false;
});

/** Popup position when the right-click itself was not seen (script injected afterwards). */
function imageCenter(img) {
  const rect = img?.getBoundingClientRect();
  if (!rect || !rect.width) return null;
  return {
    x: Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth),
    y: Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight),
  };
}

async function pickFolderAndSave(srcUrl, img, position) {
  const { folders } = await loadHoardSettings();
  const usable = folders.filter((folder) => folder.path);
  if (usable.length === 0) {
    showHoardToast("Hoard", "No save folders yet. Add them in Hoard settings.", true);
    chrome.runtime.sendMessage({ action: "openSettings" }, () => void chrome.runtime.lastError);
    return;
  }
  const folder = await showHoardFolderPicker(usable, position);
  if (folder) {
    await runSave(srcUrl, img, folder.id);
  }
}

async function runSave(srcUrl, img, folderId) {
  if (saveInFlight) {
    showHoardToast("Hoard", "Already saving. Please wait...", true);
    return;
  }

  saveInFlight = true;
  showHoardToast("Hoard", "Saving...", false);

  try {
    const request = await buildSaveRequest(srcUrl, img);
    let result = request.error
      ? { ok: false, error: request.error }
      : await requestBackgroundSave({ ...request, folderId, referer: location.href });
    if (result?.needsPageFetch) {
      // Hoard can't reach the image's server directly; the page may still be allowed to read it.
      const image = await readFirstImageInPage(request.urls);
      if (image) {
        result = await requestBackgroundSave({ ...request, ...image, urls: [], folderId, referer: location.href });
      }
    }
    reportSaveResult(result);
  } catch (err) {
    reportSaveResult({ ok: false, error: String(err?.message || err) });
  } finally {
    saveInFlight = false;
  }
}

/** Work out which URLs to download (best first) and what to call the file. */
async function buildSaveRequest(srcUrl, img) {
  let request = null;
  if (hoardIsShotdeckPage()) {
    request = shotdeckSaveRequest(srcUrl, img);
  } else if (hoardIsArtStationPage()) {
    request = artStationSaveRequest(srcUrl, img);
  }
  if (!request) {
    const candidates = genericImageCandidates(srcUrl, img);
    request = {
      urls: candidates,
      filename: filenameFromImageUrl(candidates.find(isRemoteUrl) || srcUrl),
    };
  }

  const remote = request.urls.filter(isRemoteUrl);
  if (remote.length > 0) {
    return { ...request, urls: remote };
  }

  // blob:/data: images only exist inside this page, so read them here.
  const inline = request.urls.find(isInlineUrl);
  if (inline) {
    return { ...request, urls: [], ...(await readImageInPage(inline)) };
  }
  return { error: "Could not find an image URL. Right-click directly on the image." };
}

function shotdeckSaveRequest(srcUrl, img) {
  let stillId = parseStillId(srcUrl) || parseStillId(img?.currentSrc || img?.src);
  if (!stillId) {
    const modalImg = document.querySelector(
      '#shotModal img[src*="shotdeck.com"], .modal img[src*="stills"]'
    );
    if (modalImg) {
      stillId = parseStillId(modalImg.src);
    }
  }
  if (!stillId) {
    return null;
  }

  const { title, year } = readMetadata();
  return {
    urls: [fullSizeUrl(stillId), srcUrl],
    filename: buildFilename(title, year, stillId),
    metadataMissing: !(title && year),
  };
}

function artStationSaveRequest(srcUrl, img) {
  const upgraded = bestUrlFromArtStationImage(img);
  const resolved =
    upgraded && isRemoteUrl(upgraded) ? upgraded : resolveArtStationImageUrl(srcUrl);
  if (!resolved || !isArtStationImageUrl(resolved)) {
    return null;
  }
  const candidates = artStationDownloadCandidates(resolved);
  return {
    urls: [...candidates, srcUrl],
    filename: filenameFromArtStationUrl(candidates.find(isRemoteUrl) || resolved),
  };
}

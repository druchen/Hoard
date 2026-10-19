/** Content script: right-click / H hotkey image save on any site. */

let lastContextImg = null;
let lastContextTime = 0;
let saveInFlight = false;
const CONTEXT_HOTKEY_MS = 5000;
const CONTEXT_MENU_MS = 30000;

document.addEventListener(
  "contextmenu",
  (e) => {
    const img = imageAtPoint(e);
    if (img) {
      lastContextImg = img;
      lastContextTime = Date.now();
    }
  },
  true
);

document.addEventListener("keydown", (e) => {
  if (e.key?.toLowerCase() !== "h" || e.ctrlKey || e.altKey || e.metaKey) {
    return;
  }
  if (e.target.closest?.("input, textarea, select, [contenteditable]:not([contenteditable=false])")) {
    return;
  }
  if (!lastContextTime || Date.now() - lastContextTime > CONTEXT_HOTKEY_MS) {
    // Only nag when the user just right-clicked something; plain "h" typing elsewhere stays silent.
    return;
  }
  e.preventDefault();
  const img = lastContextImg;
  lastContextTime = 0;
  // folderKey null → background picks the site default or the last folder used.
  void runSave(img.currentSrc || img.src || "", img, null);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== "hoardSave") {
    return false;
  }

  const recent =
    lastContextImg && Date.now() - lastContextTime < CONTEXT_MENU_MS ? lastContextImg : null;
  const img = findImageForUrl(message.srcUrl) || recent;
  void runSave(message.srcUrl || img?.currentSrc || img?.src || "", img, message.folderKey);
  sendResponse({ received: true });
  return false;
});

async function runSave(srcUrl, img, folderKey) {
  if (saveInFlight) {
    showHoardToast("Hoard", "Already saving. Please wait...", true);
    return;
  }

  saveInFlight = true;
  showHoardToast("Hoard", "Saving...", false);

  try {
    const request = await buildSaveRequest(srcUrl, img);
    const result = request.error
      ? { ok: false, error: request.error }
      : await requestBackgroundSave({ ...request, folderKey, referer: location.href });
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
    return { ...request, urls: [], ...(await readInlineImage(inline)) };
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

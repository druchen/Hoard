/** Content script: right-click / H hotkey image save. */

let lastContextImageSrc = null;
let lastContextTime = 0;
let saveInFlight = false;
const CONTEXT_HOTKEY_MS = 5000;
const CONTEXT_MENU_MS = 30000;

document.addEventListener(
  "contextmenu",
  (e) => {
    const img = e.target.closest?.("img");
    if (img) {
      const resolved =
        (typeof bestUrlFromArtStationImage === "function"
          ? bestUrlFromArtStationImage(img)
          : null) ||
        img.currentSrc ||
        img.src ||
        null;
      if (resolved) {
        lastContextImageSrc = resolved;
        lastContextTime = Date.now();
      }
    }
  },
  true
);

document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() !== "h" || e.ctrlKey || e.altKey || e.metaKey) {
    return;
  }
  if (e.target.closest("input, textarea, [contenteditable=true]")) {
    return;
  }
  if (!lastContextImageSrc || Date.now() - lastContextTime > CONTEXT_HOTKEY_MS) {
    showHoardToast(
      "Hoard",
      "Right-click an image first, then press H within 5 seconds.",
      true
    );
    return;
  }
  e.preventDefault();
  void runSave(lastContextImageSrc, hoardIsArtStationPage() ? "concept" : "cinematography");
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action !== "hoardSave") {
    return false;
  }

  void runSave(
    pickContextSaveUrl(message.srcUrl),
    message.folderKey || "cinematography"
  );

  return false;
});

function getRecentContextImageSrc() {
  if (lastContextImageSrc && Date.now() - lastContextTime < CONTEXT_MENU_MS) {
    return lastContextImageSrc;
  }
  return null;
}

function pickContextSaveUrl(menuSrcUrl) {
  if (menuSrcUrl) {
    if (typeof resolveArtStationImageUrl === "function") {
      const resolved = resolveArtStationImageUrl(menuSrcUrl);
      if (
        resolved &&
        typeof isArtStationImageUrl === "function" &&
        isArtStationImageUrl(resolved)
      ) {
        return resolved;
      }
    }

    if (/^https?:\/\//i.test(menuSrcUrl)) {
      return menuSrcUrl;
    }

    const recentContext = getRecentContextImageSrc();
    if (
      recentContext &&
      /^https?:\/\//i.test(recentContext) &&
      (menuSrcUrl.startsWith("blob:") || menuSrcUrl.startsWith("data:"))
    ) {
      return recentContext;
    }

    return menuSrcUrl;
  }

  return getRecentContextImageSrc() || "";
}

async function runSave(srcUrl, folderKey) {
  if (saveInFlight) {
    showHoardToast("Hoard", "Already saving. Please wait...", true);
    return;
  }

  saveInFlight = true;
  showHoardToast("Hoard", "Saving...", false);

  try {
    const result = await hoardSaveFromImage(srcUrl, folderKey);
    reportSaveResult(result);
  } catch (err) {
    reportSaveResult({ ok: false, error: String(err) });
  } finally {
    saveInFlight = false;
  }
}

async function hoardSaveFromImage(srcUrl, folderKey) {
  if (hoardIsShotdeckPage()) {
    return hoardSaveShotdeck(srcUrl, folderKey);
  }
  if (hoardIsArtStationPage()) {
    return hoardSaveArtStation(srcUrl, folderKey);
  }
  return { ok: false, error: "Unsupported site." };
}

async function hoardSaveShotdeck(srcUrl, folderKey) {
  let stillId = parseStillId(srcUrl);
  if (!stillId) {
    const modalImg = document.querySelector(
      '#shotModal img[src*="shotdeck.com"], .modal img[src*="stills"]'
    );
    if (modalImg) {
      stillId = parseStillId(modalImg.src);
    }
  }
  if (!stillId) {
    return { ok: false, error: "Could not find still id from image URL." };
  }

  const { title, year } = readMetadata();
  const filename = buildFilename(title, year, stillId);
  const imageUrl = fullSizeUrl(stillId);

  try {
    const blob = await fetchImageBlob(imageUrl, "https://shotdeck.com/");
    const webpBlob = await convertToWebP(blob);
    const base64 = await blobToBase64(webpBlob);
    const result = await saveViaNativeBridge({
      filename,
      data: base64,
      folderKey,
      metadataMissing: !(title && year),
    });
    return result;
  } catch (err) {
    return {
      ok: false,
      error: `${err.message}. Are you logged in to this site?`,
    };
  }
}

async function hoardSaveArtStation(srcUrl, folderKey) {
  const resolvedUrl = resolveArtStationImageUrl(srcUrl);
  if (!resolvedUrl || !isArtStationImageUrl(resolvedUrl)) {
    return {
      ok: false,
      error: "Not a supported image URL. Right-click directly on the artwork image.",
    };
  }

  const referer = location.href || "https://www.artstation.com/";
  const candidates = artStationDownloadCandidates(resolvedUrl);
  const filename = filenameFromArtStationUrl(
    candidates.find((url) => /^https?:\/\//i.test(url)) || resolvedUrl
  );
  const remoteCandidates = candidates.filter((url) => /^https?:\/\//i.test(url));

  if (remoteCandidates.length > 0) {
    return requestBackgroundSave({
      urls: remoteCandidates,
      referer,
      filename,
      folderKey,
    });
  }

  try {
    const blob = await fetchImageBlobCandidates(candidates, referer);
    const webpBlob = await convertToWebP(blob);
    const base64 = await blobToBase64(webpBlob);
    return await saveViaNativeBridge({ filename, data: base64, folderKey });
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

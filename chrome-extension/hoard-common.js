/** Shared fetch, WebP conversion, and native bridge helpers. */

const WEBP_QUALITY = 0.8;

function hoardIsShotdeckPage() {
  const host = location.hostname;
  return host === "shotdeck.com" || host.endsWith(".shotdeck.com");
}

function hoardIsArtStationPage() {
  const host = location.hostname;
  return host === "artstation.com" || host.endsWith(".artstation.com");
}
const HOARD_TOAST_ID = "hoard-save-toast";

function showHoardToast(title, message, isError) {
  let el = document.getElementById(HOARD_TOAST_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = HOARD_TOAST_ID;
    Object.assign(el.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      zIndex: "2147483647",
      maxWidth: "380px",
      padding: "12px 16px",
      borderRadius: "8px",
      fontFamily: "system-ui, sans-serif",
      fontSize: "13px",
      lineHeight: "1.45",
      boxShadow: "0 4px 20px rgba(0,0,0,.35)",
      color: "#fff",
      pointerEvents: "none",
      whiteSpace: "pre-wrap",
    });
    document.documentElement.appendChild(el);
  }

  el.style.background = isError ? "#8b2e2e" : "#2d6a3e";
  el.textContent = "";
  const heading = document.createElement("strong");
  heading.textContent = title;
  el.appendChild(heading);
  el.appendChild(document.createElement("br"));
  el.appendChild(document.createTextNode(message));
  el.style.display = "block";
  clearTimeout(el._hoardTimer);
  el._hoardTimer = setTimeout(() => {
    el.style.display = "none";
  }, isError ? 9000 : 5000);
}

function reportSaveResult(result) {
  if (result?.exists) {
    showHoardOverwriteDialog(result);
    return;
  }

  if (!result?.ok) {
    showHoardToast("Hoard save failed", result?.error || "Unknown error", true);
  } else {
    let msg = `Saved: ${result.filename || "image"}`;
    if (result.folder) msg += `\n${result.folder}`;
    if (result.note) msg += `\n(${result.note})`;
    showHoardToast("Hoard", msg, false);
  }

  chrome.runtime.sendMessage({ action: "showResult", result }, () => {
    void chrome.runtime.lastError;
  });
}

const HOARD_DIALOG_ID = "hoard-overwrite-dialog";

function showHoardOverwriteDialog(result) {
  const existing = document.getElementById(HOARD_DIALOG_ID);
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = HOARD_DIALOG_ID;
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.55)",
    fontFamily: "system-ui, sans-serif",
  });

  const box = document.createElement("div");
  Object.assign(box.style, {
    background: "#1e1e1e",
    color: "#e8e8e8",
    borderRadius: "10px",
    padding: "24px 28px",
    maxWidth: "400px",
    width: "90%",
    boxShadow: "0 8px 32px rgba(0,0,0,.5)",
    lineHeight: "1.5",
  });

  const title = document.createElement("div");
  title.textContent = "File already exists";
  Object.assign(title.style, { fontWeight: "700", fontSize: "15px", marginBottom: "10px" });

  const msg = document.createElement("div");
  msg.textContent = result.filename || "This file";
  Object.assign(msg.style, {
    fontSize: "13px",
    color: "#aaa",
    marginBottom: "6px",
    wordBreak: "break-all",
  });

  const folder = document.createElement("div");
  folder.textContent = result.folder || "";
  Object.assign(folder.style, {
    fontSize: "12px",
    color: "#666",
    marginBottom: "20px",
    wordBreak: "break-all",
  });

  const btnRow = document.createElement("div");
  Object.assign(btnRow.style, { display: "flex", gap: "10px", justifyContent: "flex-end" });

  function makeBtn(label, bg, action) {
    const btn = document.createElement("button");
    btn.textContent = label;
    Object.assign(btn.style, {
      padding: "8px 20px",
      borderRadius: "6px",
      border: "none",
      cursor: "pointer",
      fontSize: "13px",
      fontWeight: "600",
      background: bg,
      color: "#fff",
    });
    btn.addEventListener("click", action);
    return btn;
  }

  const cancelBtn = makeBtn("Cancel", "#444", () => {
    overlay.remove();
    showHoardToast("Hoard", "Save cancelled.", false);
  });

  const overwriteBtn = makeBtn("Overwrite", "#b05a00", () => {
    overlay.remove();
    showHoardToast("Hoard", "Overwriting...", false);
    chrome.runtime.sendMessage(
      { action: "hoardConfirmOverwrite", saveId: result.saveId },
      (res) => {
        if (chrome.runtime.lastError) {
          showHoardToast("Hoard save failed", chrome.runtime.lastError.message, true);
          return;
        }
        if (res?.ok) {
          let msg2 = `Saved: ${res.filename || result.filename}`;
          if (res.folder) msg2 += `\n${res.folder}`;
          showHoardToast("Hoard", msg2, false);
        } else {
          showHoardToast("Hoard save failed", res?.error || "Unknown error", true);
        }
      }
    );
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(overwriteBtn);
  box.appendChild(title);
  box.appendChild(msg);
  if (result.folder) box.appendChild(folder);
  box.appendChild(btnRow);
  overlay.appendChild(box);
  document.documentElement.appendChild(overlay);
  overwriteBtn.focus();
}

function convertToWebP(blob, quality = WEBP_QUALITY) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (webp) => {
          if (webp) resolve(webp);
          else reject(new Error("WebP conversion failed"));
        },
        "image/webp",
        quality
      );
    };
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = URL.createObjectURL(blob);
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function saveViaNativeBridge(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "nativeSave", ...payload }, (result) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(result);
    });
  });
}

function requestBackgroundSave(payload, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({
        ok: false,
        error: "Save timed out. Reload the extension and try again.",
      });
    }, timeoutMs);

    chrome.runtime.sendMessage({ action: "hoardSaveRemote", ...payload }, (result) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(result || { ok: false, error: "No response from background save." });
    });
  });
}

const IMAGE_URL_EXT = /\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i;

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

function shouldFetchImageInBackground(url) {
  return /^https?:\/\//i.test(url || "");
}

function base64ToBlob(base64, contentType) {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return new Blob([bytes], { type: contentType || "image/jpeg" });
}

async function fetchImageBlobViaBackground(url, referer) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "fetchImage", url, referer }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.ok) {
        const detail = response?.url ? `\n${response.url}` : "";
        reject(new Error((response?.error || "Failed to download image") + detail));
        return;
      }
      resolve(base64ToBlob(response.data, response.contentType));
    });
  });
}

async function fetchImageBlobLocal(url, referer) {
  const response = await fetch(url, {
    credentials: "include",
    headers: referer ? { Referer: referer } : {},
  });
  if (!response.ok) {
    throw new Error(`Failed to download image (${response.status})`);
  }
  const contentType = response.headers.get("Content-Type") || "";
  if (!isImageResponse(contentType, url)) {
    throw new Error("URL did not return a supported image");
  }
  return response.blob();
}

async function fetchImageBlob(url, referer) {
  if (shouldFetchImageInBackground(url)) {
    return fetchImageBlobViaBackground(url, referer);
  }
  return fetchImageBlobLocal(url, referer);
}

async function fetchImageBlobCandidates(urls, referer) {
  let lastError = null;
  for (const url of urls) {
    try {
      return await fetchImageBlob(url, referer);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Failed to download image");
}

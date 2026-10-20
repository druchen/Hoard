/** Shared content-script helpers: site detection, toasts, image URL and filename helpers. */

function hoardIsShotdeckPage() {
  const host = location.hostname;
  return host === "shotdeck.com" || host.endsWith(".shotdeck.com");
}

function hoardIsArtStationPage() {
  const host = location.hostname;
  return host === "artstation.com" || host.endsWith(".artstation.com");
}

const HOARD_TOAST_ID = "hoard-save-toast";

// Bottom-right page notification on/off (Hoard settings), kept in sync with storage.
let hoardPageToasts = true;
loadHoardSettings().then((settings) => (hoardPageToasts = settings.pageNotifications));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.pageNotifications) {
    hoardPageToasts = changes.pageNotifications.newValue !== false;
  }
});

function showHoardToast(title, message, isError) {
  if (!hoardPageToasts) return;
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
    showHoardRenameDialog(result);
    return;
  }

  if (!result?.ok) {
    showHoardToast("Hoard save failed", result?.error || "Unknown error", true);
  } else {
    let msg = `Saved to ${result.folderName || "folder"}: ${result.filename || "image"}`;
    if (result.folder) msg += `\n${result.folder}`;
    if (result.note) msg += `\n(${result.note})`;
    showHoardToast("Hoard", msg, false);
  }

  chrome.runtime.sendMessage({ action: "showResult", result }, () => {
    void chrome.runtime.lastError;
  });
}

const HOARD_POPUP_STYLE = `
  :host { all: initial; }
  .catcher { position: fixed; inset: 0; z-index: 2147483647; }
  .catcher.dim { background: rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; }
  .panel {
    position: fixed; background: #1e1e1e; color: #ececec; border-radius: 8px;
    border: 1px solid #3a3a3a; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
    font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
    display: flex; flex-direction: column; overflow: hidden;
  }
  .catcher.dim .panel { position: static; }
  .title { padding: 10px 12px 6px; font-weight: 600; color: #bdbdbd; font-size: 12px; }
  .list { overflow-y: auto; padding: 0 4px 4px; }
  button.folder {
    all: unset; box-sizing: border-box; width: 100%; cursor: pointer;
    display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 5px;
  }
  button.folder:hover, button.folder:focus-visible { background: #2f2f2f; }
  kbd {
    flex: none; min-width: 20px; height: 20px; padding: 0 5px; box-sizing: border-box;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 4px; background: #3a3a3a; border: 1px solid #555;
    font: 600 11px/1 ui-monospace, Menlo, Consolas, monospace;
  }
  kbd.empty { visibility: hidden; }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .footer {
    display: flex; justify-content: space-between; align-items: center; gap: 12px;
    padding: 6px 12px; border-top: 1px solid #333; color: #8a8a8a; font-size: 11px;
  }
  .footer button, button.linkish { all: unset; cursor: pointer; color: #8ab4f8; }
  .footer button:hover { text-decoration: underline; }
  .body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 10px; }
  .body p { margin: 0; color: #bdbdbd; word-break: break-all; }
  .body input {
    box-sizing: border-box; width: 100%; padding: 8px 10px; border-radius: 6px;
    border: 1px solid #555; background: #2a2a2a; color: #ececec;
    font: 13px ui-monospace, Menlo, Consolas, monospace;
  }
  .body input:focus { outline: 2px solid #4f9c66; outline-offset: -1px; }
  .body .error { color: #f2847c; font-size: 12px; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
  .actions button {
    all: unset; cursor: pointer; padding: 7px 16px; border-radius: 6px;
    font-weight: 600; background: #3a3a3a; color: #fff;
  }
  .actions button.primary { background: #2d6a3e; }
  .actions button:focus-visible { outline: 2px solid #8ab4f8; }
`;

/**
 * Mount a closed-shadow popup that keeps the page's keyboard shortcuts from firing.
 * onKey(e) returns true when it handled the key. Returns { root, close }.
 */
function mountHoardPopup(id, html, onKey) {
  document.getElementById(id)?.remove();
  const host = document.createElement("div");
  host.id = id;
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>${HOARD_POPUP_STYLE}</style>${html}`;

  function keyHandler(e) {
    if (onKey(e)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // Tab/Enter/Space still reach the popup's own controls; everything else stays away from the page.
    if (!["Tab", "Enter", " "].includes(e.key)) e.stopPropagation();
  }
  function swallow(e) {
    e.stopPropagation();
  }

  window.addEventListener("keydown", keyHandler, true);
  window.addEventListener("keyup", swallow, true);
  window.addEventListener("keypress", swallow, true);
  document.documentElement.appendChild(host);

  return {
    root,
    close() {
      window.removeEventListener("keydown", keyHandler, true);
      window.removeEventListener("keyup", swallow, true);
      window.removeEventListener("keypress", swallow, true);
      host.remove();
    },
  };
}

const HOARD_PICKER_ID = "hoard-folder-picker";
const HOARD_RENAME_ID = "hoard-rename-dialog";

function hoardPickerIsOpen() {
  return Boolean(document.getElementById(HOARD_PICKER_ID) || document.getElementById(HOARD_RENAME_ID));
}

/**
 * Popup menu at the cursor listing the save folders with their shortcut keys.
 * Resolves with the chosen folder, or null if cancelled (Esc, click outside).
 */
function showHoardFolderPicker(folders, position) {
  return new Promise((resolve) => {
    const popup = mountHoardPopup(
      HOARD_PICKER_ID,
      `<div class="catcher">
        <div class="panel" role="menu" aria-label="Save image to">
          <div class="title">Save image to</div>
          <div class="list"></div>
          <div class="footer"><span>Esc to cancel</span><button type="button" class="settings">Settings</button></div>
        </div>
      </div>`,
      (e) => {
        if (e.key === "Escape") {
          finish(null);
          return true;
        }
        const key = (e.key || "").toLowerCase();
        if (e.ctrlKey || e.altKey || e.metaKey || key.length !== 1) return false;
        const folder = folders.find((f) => f.key && f.key === key);
        if (!folder) return false;
        finish(folder);
        return true;
      }
    );
    const { root } = popup;

    const list = root.querySelector(".list");
    for (const folder of folders) {
      const btn = document.createElement("button");
      btn.className = "folder";
      btn.type = "button";
      btn.setAttribute("role", "menuitem");
      btn.title = folder.path;
      const kbd = document.createElement("kbd");
      kbd.textContent = hoardShortcutLabel(folder.key);
      if (!folder.key) kbd.className = "empty";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = hoardFolderLabel(folder);
      btn.append(kbd, name);
      btn.addEventListener("click", () => finish(folder));
      list.appendChild(btn);
    }

    function finish(folder) {
      popup.close();
      resolve(folder);
    }

    root.querySelector(".catcher").addEventListener("mousedown", (e) => {
      if (e.target === e.currentTarget) finish(null);
    });
    root.querySelector(".settings").addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "openSettings" }, () => void chrome.runtime.lastError);
      finish(null);
    });

    // Place the menu at the cursor, flipped/clamped to stay inside the window.
    const panel = root.querySelector(".panel");
    const margin = 8;
    panel.style.width = "260px";
    panel.style.maxHeight = `${Math.max(120, window.innerHeight - margin * 2)}px`;
    const rect = panel.getBoundingClientRect();
    const x = position?.x ?? (window.innerWidth - rect.width) / 2;
    const y = position?.y ?? (window.innerHeight - rect.height) / 2;
    let left = x + rect.width + margin > window.innerWidth ? x - rect.width : x;
    let top = y + rect.height + margin > window.innerHeight ? y - rect.height : y;
    left = Math.min(Math.max(margin, left), window.innerWidth - rect.width - margin);
    top = Math.min(Math.max(margin, top), window.innerHeight - rect.height - margin);
    panel.style.left = `${Math.max(margin, left)}px`;
    panel.style.top = `${Math.max(margin, top)}px`;

    root.querySelector("button.folder")?.focus();
  });
}

/** "Already exists" dialog: rename (proposed dated name), overwrite, or cancel. */
function showHoardRenameDialog(result, errorText = "") {
  const toast = document.getElementById(HOARD_TOAST_ID);
  if (toast) toast.style.display = "none";
  const popup = mountHoardPopup(
    HOARD_RENAME_ID,
    `<div class="catcher dim">
      <div class="panel" role="dialog" aria-label="File already exists" style="width: min(420px, calc(100vw - 32px))">
        <div class="body">
          <div style="font-weight:600;font-size:14px">File already exists</div>
          <p class="message"></p>
          <input type="text" class="filename" spellcheck="false" autocomplete="off" aria-label="Save as">
          <div class="error" hidden></div>
          <div class="actions">
            <button type="button" class="cancel">Cancel</button>
            <button type="button" class="overwrite">Overwrite</button>
            <button type="button" class="primary save">Rename</button>
          </div>
        </div>
      </div>
    </div>`,
    (e) => {
      if (e.key === "Escape") {
        cancel();
        return true;
      }
      // Enter renames only from the name field; on a focused button it activates that button.
      if (e.key === "Enter" && popup.root.activeElement === input) {
        submit();
        return true;
      }
      return false;
    }
  );
  const { root } = popup;
  const input = root.querySelector(".filename");
  const error = root.querySelector(".error");
  root.querySelector(".message").textContent =
    `${result.filename} is already in ${result.folderName || result.folder || "this folder"}. Rename it, or overwrite the existing file:`;
  input.value = result.suggested || result.filename || "";
  if (errorText) {
    error.textContent = errorText;
    error.hidden = false;
  }

  let busy = false;

  function cancel() {
    if (busy) return;
    popup.close();
    showHoardToast("Hoard", "Save cancelled.", false);
  }

  function submit(overwrite = false) {
    if (busy) return;
    const filename = overwrite ? result.filename : input.value.trim();
    if (!filename) {
      error.textContent = "Enter a file name.";
      error.hidden = false;
      return;
    }
    busy = true;
    showHoardToast("Hoard", overwrite ? "Overwriting..." : "Saving...", false);
    chrome.runtime.sendMessage(
      { action: "hoardSaveAs", saveId: result.saveId, filename, overwrite },
      (res) => {
        busy = false;
        popup.close();
        if (chrome.runtime.lastError) {
          showHoardToast("Hoard save failed", chrome.runtime.lastError.message, true);
          return;
        }
        if (res?.exists) {
          showHoardRenameDialog(res, `${res.filename} also exists.`);
          return;
        }
        reportSaveResult(res);
      }
    );
  }

  root.querySelector(".cancel").addEventListener("click", cancel);
  root.querySelector(".overwrite").addEventListener("click", () => submit(true));
  root.querySelector(".save").addEventListener("click", () => submit());

  input.focus();
  // Select the name part so typing replaces it but keeps the extension.
  const dot = input.value.lastIndexOf(".");
  input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
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
        resolve({
          ok: false,
          error:
            chrome.runtime.lastError.message +
            " Reload the page after updating the extension.",
        });
        return;
      }
      resolve(result || { ok: false, error: "No response from background save." });
    });
  });
}

function isRemoteUrl(url) {
  return /^https?:\/\//i.test(url || "");
}

function isInlineUrl(url) {
  return /^(blob|data):/i.test(url || "");
}

/**
 * Read an image from inside the page so the background can save it: blob:/data: images,
 * and same-site or CORS-enabled images when Hoard has no access to the image's server.
 */
async function readImageInPage(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to read image (${response.status})`);
  }
  const blob = await response.blob();
  if (!blob.type.startsWith("image/") || blob.type.includes("svg")) {
    throw new Error("URL did not return a supported image");
  }
  return { data: await blobToBase64(blob), contentType: blob.type };
}

async function readFirstImageInPage(urls) {
  for (const url of urls) {
    try {
      return await readImageInPage(url);
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function sanitizePart(text) {
  if (!text) return "";
  return text
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 150);
}

function urlsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  try {
    const pa = new URL(a, location.href);
    const pb = new URL(b, location.href);
    return pa.origin === pb.origin && pa.pathname === pb.pathname;
  } catch {
    return false;
  }
}

/** Find the page <img> whose source matches the URL Chrome passed from the context menu. */
function findImageForUrl(srcUrl) {
  if (!srcUrl) return null;
  for (const img of document.querySelectorAll("img")) {
    const sources = [img.currentSrc, img.src, img.getAttribute("data-src")].filter(Boolean);
    if (sources.some((source) => urlsMatch(source, srcUrl))) {
      return img;
    }
  }
  return null;
}

/** The <img> under the pointer, even when the site covers it with an overlay. */
function imageAtPoint(event) {
  const direct = event.target?.closest?.("img");
  if (direct) return direct;
  const stack = document.elementsFromPoint?.(event.clientX, event.clientY) || [];
  return stack.find((el) => el.tagName === "IMG") || null;
}

/** Largest srcset entry (by width or density descriptor). */
function largestSrcsetUrl(img) {
  const srcset = img?.getAttribute("srcset");
  if (!srcset) return null;
  const best = srcset
    .split(",")
    .map((part) => part.trim().split(/\s+/))
    .filter((parts) => parts[0])
    .map(([url, descriptor]) => [url, parseFloat(descriptor || "0") || 0])
    .sort((a, b) => b[1] - a[1])[0];
  if (!best) return null;
  try {
    return new URL(best[0], location.href).href;
  } catch {
    return null;
  }
}

/** Candidate URLs to try for a generic site, highest resolution first. */
function genericImageCandidates(srcUrl, img) {
  const candidates = [];
  for (const url of [
    largestSrcsetUrl(img),
    img?.currentSrc,
    srcUrl,
    img?.src,
    img?.getAttribute("data-src"),
  ]) {
    if (url && !candidates.includes(url)) {
      candidates.push(url);
    }
  }
  return candidates;
}

const GENERIC_NAME = /^(image|img|photo|picture|original|orig|download|file|media|default|index|full|large|medium|small|thumb|[0-9]{1,6})$/i;

/** File base name from image URL path, e.g. .../my-piece.jpg → my-piece (extension added on save). */
function filenameFromImageUrl(url) {
  const host = sanitizePart(location.hostname.replace(/^www\./, ""));
  let base = "";
  try {
    const parsed = new URL(url, location.href);
    if (isRemoteUrl(parsed.href)) {
      const last = parsed.pathname.split("/").filter(Boolean).pop() || "";
      base = sanitizePart(decodeURIComponent(last).replace(/\.[^.]+$/, ""));
    }
  } catch {
    base = "";
  }
  if (!base) {
    base = `${host || "hoard"}_${Date.now()}`;
  } else if (GENERIC_NAME.test(base)) {
    base = `${host}_${base}`;
  }
  return base;
}

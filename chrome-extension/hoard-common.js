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
    let msg = `Saved to ${result.folderName || "folder"}: ${result.filename || "image"}`;
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
          let msg2 = `Saved to ${res.folderName || result.folderName || "folder"}: ${res.filename || result.filename}`;
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

const HOARD_PICKER_ID = "hoard-folder-picker";

function hoardPickerIsOpen() {
  return Boolean(document.getElementById(HOARD_PICKER_ID));
}

/**
 * Overlay listing the save folders with their shortcut keys.
 * Resolves with the chosen folder, or null if cancelled (Esc, click outside).
 */
function showHoardFolderPicker(folders) {
  document.getElementById(HOARD_PICKER_ID)?.remove();

  return new Promise((resolve) => {
    const host = document.createElement("div");
    host.id = HOARD_PICKER_ID;
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        .overlay {
          position: fixed; inset: 0; z-index: 2147483647;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0, 0, 0, 0.45);
          font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
        }
        .panel {
          background: #1e1e1e; color: #ececec; border-radius: 10px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
          width: min(340px, calc(100vw - 32px)); max-height: calc(100vh - 64px);
          display: flex; flex-direction: column; overflow: hidden;
        }
        .title { padding: 14px 16px 8px; font-weight: 600; font-size: 14px; }
        .list { overflow-y: auto; padding: 0 6px 6px; }
        button.folder {
          all: unset; box-sizing: border-box; width: 100%; cursor: pointer;
          display: flex; align-items: center; gap: 12px;
          padding: 9px 10px; border-radius: 6px;
        }
        button.folder:hover, button.folder:focus-visible { background: #2f2f2f; }
        kbd {
          flex: none; min-width: 22px; height: 22px; padding: 0 5px; box-sizing: border-box;
          display: inline-flex; align-items: center; justify-content: center;
          border-radius: 5px; background: #3a3a3a; border: 1px solid #555;
          font: 600 12px/1 ui-monospace, Menlo, Consolas, monospace;
        }
        kbd.empty { visibility: hidden; }
        .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .footer {
          display: flex; justify-content: space-between; align-items: center;
          padding: 8px 16px; border-top: 1px solid #333; color: #9a9a9a; font-size: 12px;
        }
        .footer button { all: unset; cursor: pointer; color: #8ab4f8; }
        .footer button:hover { text-decoration: underline; }
      </style>
      <div class="overlay">
        <div class="panel" role="dialog" aria-label="Save image to">
          <div class="title">Save image to</div>
          <div class="list"></div>
          <div class="footer"><span>Esc to cancel</span><button type="button" class="settings">Settings</button></div>
        </div>
      </div>`;

    const list = root.querySelector(".list");
    for (const folder of folders) {
      const btn = document.createElement("button");
      btn.className = "folder";
      btn.type = "button";
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

    const NAV_KEYS = ["Tab", "Enter", " "];

    function onKey(e) {
      const key = (e.key || "").toLowerCase();
      const folder =
        !e.ctrlKey && !e.altKey && !e.metaKey && key.length === 1
          ? folders.find((f) => f.key && f.key === key)
          : null;
      if (e.key === "Escape" || folder) {
        e.preventDefault();
        e.stopPropagation();
        finish(folder || null);
        return;
      }
      swallow(e);
    }

    function swallow(e) {
      // Keep the page's own keyboard shortcuts from firing while the picker is open;
      // Tab/Enter/Space still move between and activate the folder buttons.
      if (!NAV_KEYS.includes(e.key)) e.stopPropagation();
    }

    function finish(folder) {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", swallow, true);
      window.removeEventListener("keypress", swallow, true);
      host.remove();
      resolve(folder);
    }

    root.querySelector(".overlay").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) finish(null);
    });
    root.querySelector(".settings").addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "openSettings" }, () => void chrome.runtime.lastError);
      finish(null);
    });

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", swallow, true);
    window.addEventListener("keypress", swallow, true);
    document.documentElement.appendChild(host);
    root.querySelector("button.folder")?.focus();
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

/** Read a blob: or data: image URL in the page so the background can save it. */
async function readInlineImage(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to read image (${response.status})`);
  }
  const blob = await response.blob();
  return { data: await blobToBase64(blob), contentType: blob.type };
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

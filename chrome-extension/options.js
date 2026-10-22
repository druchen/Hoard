/** Hoard settings page: save folders with shortcut keys, image format, quality, notifications. */

const ABSOLUTE_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\|\/|~[\\/]?)/;
const SAVE_DELAY_MS = 300;

let settings = { folders: [], format: HOARD_DEFAULT_FORMAT, quality: HOARD_DEFAULT_QUALITY };
let saveTimer = null;
let savedTimer = null;

const $ = (id) => document.getElementById(id);

function sendBridge(request) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "bridge", request }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: false, error: "No response." });
    });
  });
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, SAVE_DELAY_MS);
}

async function save() {
  clearTimeout(saveTimer);
  await chrome.storage.local.set({
    folders: settings.folders.map(normalizeHoardFolder),
    format: settings.format,
    quality: settings.quality,
    pageNotifications: settings.pageNotifications,
    systemNotifications: settings.systemNotifications,
  });
  const saved = $("saved");
  saved.textContent = "Saved";
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => (saved.textContent = ""), 1500);
}

function nextFreeKey() {
  const used = new Set(settings.folders.map((f) => f.key));
  for (const key of "123456789abcdefgijklmnopqrstuvwxyz0") {
    if (!used.has(key)) return key;
  }
  return "";
}

function basename(path) {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "";
}

/** Error text per folder id (missing path, relative path, duplicate key). */
function validate() {
  const errors = new Map();
  const keyCounts = new Map();
  for (const folder of settings.folders) {
    if (folder.key) keyCounts.set(folder.key, (keyCounts.get(folder.key) || 0) + 1);
  }
  for (const folder of settings.folders) {
    const problems = [];
    if (!folder.path) {
      problems.push("Add a folder path.");
    } else if (!ABSOLUTE_PATH.test(folder.path)) {
      problems.push("Use a full path, e.g. C:\\Users\\you\\Pictures\\Refs or /Users/you/Pictures/Refs.");
    }
    if (folder.key && keyCounts.get(folder.key) > 1) {
      problems.push(`Shortcut ${hoardShortcutLabel(folder.key)} is used by more than one folder.`);
    }
    if (problems.length) errors.set(folder.id, problems.join(" "));
  }
  return errors;
}

function showValidation() {
  const errors = validate();
  for (const row of $("folders").children) {
    const message = errors.get(row.dataset.id) || "";
    const error = row.querySelector(".error");
    error.textContent = message;
    error.hidden = !message;
    const folder = settings.folders.find((f) => f.id === row.dataset.id);
    row.querySelector(".path").classList.toggle("invalid", Boolean(folder && message && /path/i.test(message)));
    row.querySelector(".key").classList.toggle("invalid", Boolean(folder && /Shortcut/.test(message)));
  }
}

function renderFolders(focusId, focusField = "name") {
  const list = $("folders");
  list.textContent = "";
  const template = $("folder-row");

  settings.folders.forEach((folder, index) => {
    const row = template.content.firstElementChild.cloneNode(true);
    row.dataset.id = folder.id;
    const keyInput = row.querySelector(".key");
    const nameInput = row.querySelector(".name");
    const pathInput = row.querySelector(".path");
    keyInput.value = hoardShortcutLabel(folder.key);
    nameInput.value = folder.name;
    pathInput.value = folder.path;

    keyInput.addEventListener("keydown", (e) => {
      if (e.key === "Tab" || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      if (e.key === "Backspace" || e.key === "Delete") {
        folder.key = "";
      } else if (e.key.length === 1 && e.key !== " ") {
        folder.key = e.key.toLowerCase();
      } else {
        return;
      }
      keyInput.value = hoardShortcutLabel(folder.key);
      showValidation();
      scheduleSave();
    });
    // Pasted or IME input: keep the last character only.
    keyInput.addEventListener("input", () => {
      const value = keyInput.value.trim().slice(-1);
      folder.key = value && value !== " " ? value.toLowerCase() : "";
      keyInput.value = hoardShortcutLabel(folder.key);
      showValidation();
      scheduleSave();
    });

    nameInput.addEventListener("input", () => {
      folder.name = nameInput.value;
      scheduleSave();
    });

    pathInput.addEventListener("input", () => {
      folder.path = pathInput.value.trim();
      showValidation();
      scheduleSave();
    });

    row.querySelector(".browse").addEventListener("click", async (e) => {
      const button = e.currentTarget;
      button.disabled = true;
      const response = await sendBridge({ action: "pickFolder", initial: folder.path });
      button.disabled = false;
      if (response.ok && response.path) {
        folder.path = response.path;
        pathInput.value = folder.path;
        if (!folder.name.trim()) {
          folder.name = basename(folder.path);
          nameInput.value = folder.name;
        }
        showValidation();
        await save();
      } else if (!response.cancelled) {
        const error = row.querySelector(".error");
        error.textContent = response.error || "Could not open the folder picker. Type the path instead.";
        error.hidden = false;
      }
    });

    const handle = row.querySelector(".handle");
    // Rows are only draggable while the handle is held, so text in the inputs stays selectable.
    handle.addEventListener("pointerdown", () => (row.draggable = true));
    handle.addEventListener("pointerup", () => (row.draggable = false));
    handle.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        moveFolder(index, e.key === "ArrowUp" ? -1 : 1);
      }
    });
    row.addEventListener("dragstart", (e) => {
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", folder.id);
    });
    row.addEventListener("dragend", () => {
      row.draggable = false;
      row.classList.remove("dragging");
      applyDomOrder();
    });
    row.querySelector(".remove").addEventListener("click", () => {
      settings.folders.splice(index, 1);
      renderFolders();
      void save();
    });

    list.appendChild(row);
    if (folder.id === focusId) {
      requestAnimationFrame(() => row.querySelector(`.${focusField}`)?.focus());
    }
  });

  showValidation();
}

/** While dragging, move the dragged row before/after the row under the cursor. */
function onFolderDragOver(e) {
  const list = $("folders");
  const dragging = list.querySelector(".folder.dragging");
  if (!dragging) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const over = e.target.closest?.(".folder");
  if (!over || over === dragging) return;
  const rect = over.getBoundingClientRect();
  const after = e.clientY > rect.top + rect.height / 2;
  list.insertBefore(dragging, after ? over.nextSibling : over);
}

function applyDomOrder() {
  const order = [...$("folders").children].map((row) => row.dataset.id);
  const changed = order.some((id, i) => settings.folders[i]?.id !== id);
  if (!changed) return;
  const byId = new Map(settings.folders.map((f) => [f.id, f]));
  settings.folders = order.map((id) => byId.get(id)).filter(Boolean);
  renderFolders();
  void save();
}

function moveFolder(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= settings.folders.length) return;
  const [folder] = settings.folders.splice(index, 1);
  settings.folders.splice(target, 0, folder);
  renderFolders(folder.id, "handle");
  void save();
}

function renderFormats() {
  const container = $("formats");
  container.textContent = "";
  for (const [value, format] of Object.entries(HOARD_FORMATS)) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "format";
    input.value = value;
    input.checked = settings.format === value;
    input.addEventListener("change", () => {
      settings.format = value;
      updateQualityState();
      void save();
    });
    label.append(input, document.createTextNode(format.label));
    container.appendChild(label);
  }
  updateQualityState();
}

function updateQualityState() {
  const format = HOARD_FORMATS[settings.format];
  const slider = $("quality");
  slider.disabled = !format.lossy;
  $("quality-row").classList.toggle("disabled", !format.lossy);
  $("quality-value").textContent = String(settings.quality);
}

const HELPER_RELEASES = "https://github.com/druchen/Hoard/releases/latest";
const HELPER_DOWNLOADS = {
  mac: `${HELPER_RELEASES}/download/Hoard-Helper-macOS.pkg`,
  win: `${HELPER_RELEASES}/download/Hoard-Helper-Windows.exe`,
};
const HELPER_POLL_MS = 4000;
let helperPollTimer = null;

async function checkBridge({ quiet = false } = {}) {
  const dot = $("bridge-dot");
  const text = $("bridge-text");
  const download = $("helper-download");
  if (!quiet) {
    dot.className = "dot";
    text.textContent = "Checking Hoard Helper…";
  }
  const response = await sendBridge({ action: "ping" });
  dot.className = "dot";
  clearTimeout(helperPollTimer);
  if (response.ok) {
    dot.classList.add("ok");
    text.textContent = `Hoard Helper connected (v${response.version}).`;
    download.hidden = true;
    await addStarterFolders();
    return;
  }

  dot.classList.add("error");
  if (response.helperMissing) {
    const { os } = await chrome.runtime.getPlatformInfo();
    text.textContent = "Hoard Helper isn't installed.";
    download.href = HELPER_DOWNLOADS[os] || HELPER_RELEASES;
    download.hidden = false;
  } else {
    text.textContent = response.error || "Hoard Helper not reachable.";
    download.hidden = true;
  }
  // Notice the helper as soon as it's installed.
  helperPollTimer = setTimeout(() => checkBridge({ quiet: true }), HELPER_POLL_MS);
}

/** Once the helper is connected, give a fresh install its starting folder(s). */
async function addStarterFolders() {
  if (settings.folders.length > 0) return;
  const response = await sendBridge({ action: "defaults" });
  if (!response.ok || !Array.isArray(response.folders) || response.folders.length === 0) return;
  settings.folders = response.folders.map((folder, i) => ({
    id: crypto.randomUUID(),
    name: folder.name || "",
    path: folder.path || "",
    key: i < 9 ? String(i + 1) : "",
  }));
  renderFolders();
  await save();
}

const ALL_SITES = { origins: ["<all_urls>"] };

/** "Allow on all sites" switch: the optional <all_urls> host permission. */
async function initSiteAccess() {
  const box = $("all-sites");
  const refresh = async () => {
    box.checked = await chrome.permissions.contains(ALL_SITES);
  };
  await refresh();
  box.addEventListener("change", async () => {
    try {
      if (box.checked) {
        await chrome.permissions.request(ALL_SITES);
      } else {
        await chrome.permissions.remove(ALL_SITES);
      }
    } finally {
      await refresh();
    }
  });
  chrome.permissions.onAdded.addListener(refresh);
  chrome.permissions.onRemoved.addListener(refresh);
}

async function init() {
  settings = await loadHoardSettings();
  $("quality").value = String(settings.quality);
  $("quality").addEventListener("input", (e) => {
    settings.quality = clampHoardQuality(e.target.value);
    $("quality-value").textContent = String(settings.quality);
    scheduleSave();
  });
  $("add-folder").addEventListener("click", () => {
    const folder = { id: crypto.randomUUID(), name: "", path: "", key: nextFreeKey() };
    settings.folders.push(folder);
    renderFolders(folder.id);
    void save();
  });
  $("bridge-check").addEventListener("click", () => checkBridge());
  void initSiteAccess();
  $("folders").addEventListener("dragover", onFolderDragOver);
  $("folders").addEventListener("drop", (e) => e.preventDefault());
  for (const [id, key] of [
    ["page-notifications", "pageNotifications"],
    ["system-notifications", "systemNotifications"],
  ]) {
    const box = $(id);
    box.checked = settings[key];
    box.addEventListener("change", () => {
      settings[key] = box.checked;
      void save();
    });
  }
  window.addEventListener("beforeunload", () => {
    if (saveTimer) void save();
  });

  renderFolders();
  renderFormats();
  void checkBridge();
}

void init();

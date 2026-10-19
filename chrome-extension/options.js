/** Hoard settings page: save folders with shortcut keys, image format and quality. */

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

    const up = row.querySelector(".up");
    const down = row.querySelector(".down");
    up.disabled = index === 0;
    down.disabled = index === settings.folders.length - 1;
    up.addEventListener("click", () => moveFolder(index, -1));
    down.addEventListener("click", () => moveFolder(index, 1));
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

  $("folders-empty").hidden = settings.folders.length > 0;
  showValidation();
}

function moveFolder(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= settings.folders.length) return;
  const [folder] = settings.folders.splice(index, 1);
  settings.folders.splice(target, 0, folder);
  renderFolders(folder.id, delta < 0 ? "up" : "down");
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
    label.append(input, document.createTextNode(format.label + (value === HOARD_DEFAULT_FORMAT ? " (default)" : "")));
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
  const notes = {
    webp: "Small files with good quality. Images that are already WebP are saved unchanged.",
    jpeg: "Widely compatible. Transparent areas become white. Images that are already JPEG are saved unchanged.",
    png: "Lossless and larger. Quality does not apply.",
    original: "Saves the downloaded file exactly as the site serves it. Quality does not apply.",
  };
  $("format-note").textContent = notes[settings.format] || "";
}

async function checkBridge() {
  const dot = $("bridge-dot");
  const text = $("bridge-text");
  dot.className = "dot";
  text.textContent = "Checking native bridge…";
  const response = await sendBridge({ action: "ping" });
  if (response.ok) {
    dot.classList.add("ok");
    text.textContent = `Native bridge connected (v${response.version}).`;
  } else {
    dot.classList.add("error");
    text.textContent = response.error || "Native bridge not reachable.";
  }
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
  $("bridge-check").addEventListener("click", checkBridge);
  window.addEventListener("beforeunload", () => {
    if (saveTimer) void save();
  });

  renderFolders();
  renderFormats();
  void checkBridge();
}

void init();

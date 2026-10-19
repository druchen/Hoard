/** Settings shared by the background worker, content scripts and the settings page. */

const HOARD_FORMATS = {
  webp: { label: "WebP", mime: "image/webp", ext: "webp", lossy: true },
  jpeg: { label: "JPEG", mime: "image/jpeg", ext: "jpg", lossy: true },
  png: { label: "PNG", mime: "image/png", ext: "png", lossy: false },
  original: { label: "Original (no conversion)", mime: null, ext: null, lossy: false },
};
const HOARD_DEFAULT_FORMAT = "webp";
const HOARD_DEFAULT_QUALITY = 85;

function clampHoardQuality(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return HOARD_DEFAULT_QUALITY;
  return Math.min(100, Math.max(1, Math.round(n)));
}

function normalizeHoardFolder(folder) {
  return {
    id: String(folder?.id || ""),
    name: String(folder?.name || "").trim(),
    path: String(folder?.path || "").trim(),
    key: String(folder?.key || "").slice(0, 1).toLowerCase(),
  };
}

/** { folders: [{ id, name, path, key }], format, quality } */
async function loadHoardSettings() {
  let stored = {};
  try {
    stored = await chrome.storage.local.get(["folders", "format", "quality"]);
  } catch {
    stored = {};
  }
  return {
    folders: (Array.isArray(stored.folders) ? stored.folders : [])
      .map(normalizeHoardFolder)
      .filter((folder) => folder.id),
    format: HOARD_FORMATS[stored.format] ? stored.format : HOARD_DEFAULT_FORMAT,
    quality: clampHoardQuality(stored.quality ?? HOARD_DEFAULT_QUALITY),
  };
}

function hoardFolderLabel(folder) {
  return folder.name || folder.path || "Untitled folder";
}

function hoardShortcutLabel(key) {
  return key ? key.toUpperCase() : "";
}

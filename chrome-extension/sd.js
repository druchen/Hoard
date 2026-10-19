/** SD site URL parsing and filename helpers (content script). */

/** Hostname of the SD website (unchanged — required for fetch/match). */
const SD_SITE_HOST = "shotdeck.com";

const PREVIEW_PATTERN = /shotdeck\.com\/browse\/recordviewajax\/image\/([^/]+)\//i;
const THUMB_PATTERN = /shotdeck\.com\/assets\/images\/stills\/thumb\/(?:small_)?([^/.?#]+)\.jpg/i;
const FULL_JPG_PATTERN = /shotdeck\.com\/assets\/images\/stills\/([^/.?#]+)\.jpg/i;

function isSdPage() {
  return location.hostname === SD_SITE_HOST || location.hostname.endsWith("." + SD_SITE_HOST);
}

function parseStillId(url) {
  if (!url) return null;
  let m = url.match(PREVIEW_PATTERN);
  if (m) return m[1];
  m = url.match(THUMB_PATTERN);
  if (m) return m[1];
  m = url.match(FULL_JPG_PATTERN);
  if (m) {
    const id = m[1];
    if (id.toLowerCase() === "thumb") return null;
    return id;
  }
  return null;
}

function fullSizeUrl(stillId) {
  return `https://${SD_SITE_HOST}/assets/images/stills/${stillId}.jpg`;
}

/** Remove trailing "(2015)" / "[2015]" so year is not duplicated in the filename. */
function stripYearFromTitle(title) {
  return title
    .replace(/\s*[\(\[]\s*\d{4}\s*[\)\]]\s*$/u, "")
    .replace(/\s*,\s*\d{4}\s*$/u, "")
    .trim();
}

function readMetadata() {
  const titleEl =
    document.getElementById("modal-title") ||
    document.querySelector(".modal-title");
  const yearEl = document.getElementById("shotModalTitleYear");
  let title = titleEl ? titleEl.textContent.trim() : "";
  let year = yearEl ? yearEl.textContent.replace(/\D/g, "") : "";

  const bracketYear = title.match(/[\(\[]\s*(\d{4})\s*[\)\]]\s*$/);
  if (bracketYear && !year) {
    year = bracketYear[1];
  }
  title = stripYearFromTitle(title);
  return { title, year };
}

function buildFilename(title, year, stillId) {
  const titlePart = sanitizePart(title);
  const yearPart = (year || "").replace(/\D/g, "");
  const idPart = sanitizePart(stillId);
  if (titlePart && yearPart && idPart) {
    return `${titlePart}_${yearPart}_${idPart}`;
  }
  return idPart || stillId;
}

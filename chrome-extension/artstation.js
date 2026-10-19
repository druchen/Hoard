/** ArtStation URL and filename helpers. */

const ARTSTATION_CDN = /artstation\.com\/p\/assets\/images/i;
const ARTSTATION_IMAGE_HOST = /\.artstation\.com$/i;
const ARTSTATION_SIZE_SEGMENT = /\/(small|medium|large|4k)\//i;

function isArtStationImageUrl(url) {
  if (!url) return false;
  if (url.startsWith("blob:") || url.startsWith("data:image/")) {
    return true;
  }
  try {
    const host = new URL(url).hostname;
    if (ARTSTATION_IMAGE_HOST.test(host)) {
      return true;
    }
  } catch {
    return false;
  }
  return ARTSTATION_CDN.test(url) || /\.artstation\.com\//i.test(url);
}

/** Prefer 4k asset when URL uses small/medium/large. */
function bestArtStationImageUrl(url) {
  if (!url || url.startsWith("blob:") || url.startsWith("data:")) {
    return url;
  }
  if (ARTSTATION_SIZE_SEGMENT.test(url)) {
    return url.replace(ARTSTATION_SIZE_SEGMENT, "/4k/");
  }
  return url;
}

/** Candidate URLs to try, highest resolution first. */
function artStationDownloadCandidates(url) {
  if (!url) return [];
  if (url.startsWith("blob:") || url.startsWith("data:")) {
    return [url];
  }

  const candidates = [];
  const push = (value) => {
    if (value && !candidates.includes(value)) {
      candidates.push(value);
    }
  };

  push(bestArtStationImageUrl(url));
  push(url);
  if (ARTSTATION_SIZE_SEGMENT.test(url)) {
    push(url.replace(ARTSTATION_SIZE_SEGMENT, "/large/"));
  }
  return candidates;
}

function normalizeArtStationUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url || "";
  }
}

function artStationUrlsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return normalizeArtStationUrl(a) === normalizeArtStationUrl(b);
}

/** Match a page <img> to the URL Chrome passed from the context menu. */
function findArtStationImageForUrl(srcUrl) {
  if (!srcUrl) return null;
  const normalized = normalizeArtStationUrl(srcUrl);
  const images = document.querySelectorAll("img");
  for (const img of images) {
    const sources = [img.currentSrc, img.src, img.getAttribute("data-src")].filter(Boolean);
    for (const source of sources) {
      if (artStationUrlsMatch(source, srcUrl) || normalizeArtStationUrl(source) === normalized) {
        return img;
      }
    }
  }
  return null;
}

function bestUrlFromArtStationImage(img) {
  if (!img) return null;
  const sources = [];

  const srcset = img.getAttribute("srcset");
  if (srcset) {
    const best = srcset
      .split(",")
      .map((part) => part.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .sort((a, b) => parseInt(b[1] || "0", 10) - parseInt(a[1] || "0", 10))[0];
    if (best?.[0]) {
      sources.push(best[0]);
    }
  }

  sources.push(img.currentSrc, img.src, img.getAttribute("data-src"));
  return sources.find((source) => isArtStationImageUrl(source)) || sources.find(Boolean) || null;
}

function resolveArtStationImageUrl(srcUrl) {
  if (isArtStationImageUrl(srcUrl)) {
    if (srcUrl.startsWith("blob:") || srcUrl.startsWith("data:")) {
      const img = findArtStationImageForUrl(srcUrl);
      const upgraded = bestUrlFromArtStationImage(img);
      if (upgraded && !upgraded.startsWith("blob:") && !upgraded.startsWith("data:")) {
        return upgraded;
      }
    }
    return srcUrl;
  }

  const img = findArtStationImageForUrl(srcUrl);
  const resolved = bestUrlFromArtStationImage(img);
  if (resolved && isArtStationImageUrl(resolved)) {
    return resolved;
  }

  return srcUrl;
}

/** Filename from image URL path, e.g. .../large/my-piece.jpg → my-piece.webp */
function filenameFromArtStationUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const base = pathname.split("/").pop() || "artstation";
    const nameOnly = base.replace(/\.[^.]+$/i, "");
    const safe = sanitizePart(decodeURIComponent(nameOnly));
    return `${safe || "artstation"}.webp`;
  } catch {
    return "artstation.webp";
  }
}

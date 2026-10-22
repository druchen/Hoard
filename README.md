# Hoard (Chrome Extension)

Save images from any website as WebP via the native bridge.

Sibling project to **[Hoard](../Hoard)** (desktop drag-and-drop app).

## Usage

1. Right-click an **image** on any website
2. Click **Hoard** (or press **H**) — the right-click menu closes and a folder menu opens at the cursor
3. Click a folder, or press its shortcut key

If the file already exists, choose **Rename** (a free name is proposed: `image_20261019.webp`, then `image_20261019_01.webp`, `_02`, …), **Overwrite**, or **Cancel**.

Folders, shortcut keys, image format, quality and notifications are set on the **Hoard settings** page (click the Hoard toolbar icon, or **Settings** in the folder menu). Add as many folders as you like, drag the handle at the left of a row to reorder them, and use **Browse…** to open your system folder picker through the native bridge. Page notifications (bottom-right of the page) and system notifications can each be turned off.

**Site access:** Hoard installs with no site access and uses `activeTab`, so the **Hoard** right-click item works on any page. Turn on **Allow on all sites** in settings to also save images hosted on other servers (CDNs) and to press **H** right after a right-click without opening the menu.

| Format | Notes |
|--------|-------|
| WebP (default) | Quality slider, default 85 |
| JPEG | Quality slider; transparency becomes white |
| PNG | Lossless |
| Original | Saves the file exactly as the site serves it |

Icons live in [`chrome-extension/icons/`](chrome-extension/icons/) (16/32/48 px are resized from the 512 px source).

Images already in the chosen format are saved unchanged (no double compression). Images are fetched at the largest size available (ShotDeck full stills, ArtStation 4k, the biggest `srcset` entry elsewhere).

On first run, the folders in [`hoard/config.py`](hoard/config.py) are offered as starting folders (keys 1, 2, …); after that, settings are the source of truth.

## Setup

Hoard needs **Hoard Helper**, a small program that writes the files (the native bridge, with Python bundled). Hoard settings shows a **Download Hoard Helper** button until it's installed:

- **Mac:** `Hoard-Helper-macOS.pkg`. Installs to `/Library/Application Support/Hoard` for Chrome, Chromium and Edge. Uninstall: `sudo "/Library/Application Support/Hoard/uninstall.sh"`.
- **Windows:** `Hoard-Helper-Windows.exe`. Per-user install (no admin) for Chrome, Edge, Brave and Chromium; uninstall from Settings → Apps.

The installers are unsigned, so macOS (System Settings → Privacy & Security → **Open Anyway**) and Windows SmartScreen (**More info** → **Run anyway**) ask once.

### Releasing Hoard Helper

The [Hoard Helper workflow](.github/workflows/hoard-helper.yml) builds both installers on every change to `hoard/` or `installer/`, installs them on macOS and Windows runners, and pings the result. To publish a release (what the download button links to), bump `hoard/__init__.py` and push a tag:

```bash
git tag helper-v1.6.0 && git push origin helper-v1.6.0
```

Allowed extension IDs (Web Store + unpacked dev) come from `scripts/hoard_native_host.json`.

### Developing without the installer

Run the bridge from this repo instead (needs Python 3):

```powershell
cd scripts
.\install_native_host.ps1 -ExtensionId YOUR_EXTENSION_ID
```

Mac: `./scripts/install_native_host.sh YOUR_EXTENSION_ID`

## Store update

```powershell
.\pack_extension.ps1
```

Upload `dist\hoard.zip`. Listing copy: **[chrome-extension/STORE_PRIVACY_ANSWERS.md](chrome-extension/STORE_PRIVACY_ANSWERS.md)**.

## Privacy

Hoard does not collect or transmit personal data to the developer. Saves are processed in the browser and written locally via a native bridge the user installs. No analytics or accounts. Full policy: [PRIVACY.md](PRIVACY.md).

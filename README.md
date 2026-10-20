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

```powershell
cd scripts
.\install_native_host.ps1 -ExtensionId YOUR_STORE_EXTENSION_ID
```

Mac: `./install_native_host.sh YOUR_STORE_EXTENSION_ID`

Re-run the installer after pulling changes to the bridge (the Python package is `hoard`, previously `hoard_sd`).

## Store update

```powershell
.\pack_extension.ps1
```

Upload `dist\hoard.zip`. Listing copy: **[chrome-extension/STORE_PRIVACY_ANSWERS.md](chrome-extension/STORE_PRIVACY_ANSWERS.md)**.

## Privacy

Hoard does not collect or transmit personal data to the developer. Saves are processed in the browser and written locally via a native bridge the user installs. No analytics or accounts. Full policy: [PRIVACY.md](PRIVACY.md).

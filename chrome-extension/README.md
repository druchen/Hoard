# Hoard (Chrome Extension)

## Usage

Works on any website. Right-click an image → **Hoard** → pick a folder, or right-click and press **H** to open the folder picker, then press the folder's shortcut key (or click it).

Folders (any number), shortcut keys, format (WebP default, JPEG, PNG, Original) and quality (default 85) live on the settings page: `options.html`, opened from the toolbar icon or the menu.

Files are written via the native bridge (`hoard/native_bridge.py`), which also powers the settings page's **Browse…** folder picker.

## Publish

See [PUBLISHING.md](PUBLISHING.md). Build with `..\scripts\pack_extension.ps1`.

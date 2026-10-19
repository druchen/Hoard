# Hoard (Chrome Extension)

## Usage

Works on any website. Right-click an image → **Hoard** (or press **H**) → a folder menu opens at the cursor; click a folder or press its shortcut key. If the file exists: Rename (proposes `name_YYYYMMDD.ext`, then `_01`, `_02`, …), Overwrite, or Cancel.

Folders (any number), shortcut keys, format (WebP default, JPEG, PNG, Original) and quality (default 85) live on the settings page: `options.html`, opened from the toolbar icon or the menu.

Files are written via the native bridge (`hoard/native_bridge.py`), which also powers the settings page's **Browse…** folder picker.

## Publish

See [PUBLISHING.md](PUBLISHING.md). Build with `..\scripts\pack_extension.ps1`.

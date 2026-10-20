# Publish Hoard to the Chrome Web Store

Hoard uses **Native Messaging** to save files on your PC. Users still need the local Hoard bridge (`install_native_host.ps1`).

## 1. Build the upload ZIP

```powershell
cd C:\Users\drew\Documents\DIY_Apps\Hoard_ChromeExtension\scripts
.\pack_extension.ps1
```

Upload `dist\hoard.zip`. Never include `key.pem`.

The pack script **removes the `"key"` field** from `manifest.json` automatically. Chrome Web Store does not allow `key` in uploaded packages (Google signs the extension and assigns the ID). Your local `manifest.json` may still have `key` for unpacked development — that is fine; do not upload that file directly.

**Unpacked dev:** Keep the private key at `scripts/key.pem` (not inside `chrome-extension/`). Chrome warns if `key.pem` is in the folder you load unpacked. The public `key` in `manifest.json` is enough for a stable dev extension ID.

## 2. Developer account

[Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) — $5 one-time registration.

**Before you can publish**, you must also:

- Enter and **verify** a publisher contact email under **Settings**
- Complete the **Privacy practices** tab (justifications for each permission)

Copy-paste answers for every field: **[STORE_PRIVACY_ANSWERS.md](STORE_PRIVACY_ANSWERS.md)**

## 3. Create the listing

- **Title:** Hoard
- **Summary:** Save images from any website to your own folders. Right-click, or press H and a shortcut key.
- **Description:** See **STORE_PRIVACY_ANSWERS.md** → Store listing text (detailed description).
- **Host permissions:** Hoard requests no host permissions at install; it uses `activeTab`, and `<all_urls>` is an *optional* permission the user can grant from settings. Justify both with the copy in **STORE_PRIVACY_ANSWERS.md**.

## 4. After approval

Update `scripts\hoard_native_host.json` with the store extension ID, then run `install_native_host.ps1`.

## Links

- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish)
- [Developer Dashboard](https://chrome.google.com/webstore/devconsole)

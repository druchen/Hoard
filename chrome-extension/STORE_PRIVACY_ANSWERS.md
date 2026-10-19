# Chrome Web Store — Privacy practices (copy/paste)

Open your item → **Privacy practices** tab. Paste the text below into each field, then **Save draft**.

Also complete **Account Settings** (contact email + verification) — see bottom of this file.

---

## Single purpose description

```
Hoard saves images from web pages to folders the user chooses on their computer (WebP, JPEG, PNG or the original file). The user initiates each save by right-clicking an image, choosing Hoard (or pressing H), and picking a folder. The extension does not collect analytics and does not change page content.
```

---

## Permission justifications

### contextMenus

```
Adds a single "Hoard" item when the user right-clicks an image. Choosing it opens Hoard's folder menu on the page, which is how the user starts a save. The item appears only when right-clicking an image.
```

### host_permissions — <all_urls>

```
Hoard lets the user save any image they right-click, on whatever website they are viewing. Images are often served from CDN domains that differ from the page, so the extension needs access to all hosts to download the image file the user selected, using their browser session. The content script only listens for the user's right-click / H key and shows a small save status message; it does not read or change page content otherwise. Nothing is downloaded until the user starts a save.
```

### declarativeNetRequestWithHostAccess

```
Many image servers reject downloads that have no Referer header. While Hoard downloads an image the user chose to save, it adds a temporary session rule that sends the page's origin as the Referer for that one request (the same value the browser sends when it displays the image), then removes the rule. No other requests are modified or blocked.
```

### scripting

```
If the user chooses Hoard on a tab that was already open before the extension was installed or updated, Hoard injects its own bundled content script into that tab so its folder menu can appear. Only the extension's packaged files are injected, only after the user's click.
```

### storage

```
Stores the user's Hoard settings: their save folders (name, local path, shortcut key) and preferred image format and quality. Stored locally in the browser only; never transmitted.
```

### nativeMessaging

```
After the user saves an image, the extension sends the image bytes to a registered local program (Hoard native bridge) so the file can be written to the folder the user chose. The settings page also asks the bridge to open the system folder picker. Native messaging is required because Chrome extensions cannot write to arbitrary disk paths directly.
```

### notifications

```
Shows a brief success or error notification after each save attempt (for example, a saved filename or a message if the native bridge is not installed). Notifications are optional feedback only; no personal data is included in the notification text.
```

### Remote code use

```
This extension does not execute remote code. All JavaScript (background, content scripts) is bundled in the package and reviewed as part of the upload. The extension fetches image binary data only when the user explicitly saves an image; it does not download or eval scripts from third-party servers. Native messaging invokes a fixed local executable path registered by the user on Windows; the bridge does not load code from the internet.
```

If the form is a **yes/no** question "Does your extension use remote code?" → answer **No**.

If it asks you to justify anyway, use the paragraph above.

---

## Data usage (certification checklist)

On the Privacy practices tab, you will certify data handling. For Hoard, select:

| Question | Answer |
|----------|--------|
| Collect personal / sensitive user data? | **No** (unless Google forces you to declare image content — if asked about "photos/videos", say processing is **on-device only**, user-initiated, not transmitted to developer servers) |
| Data sold to third parties? | **No** |
| Data used for purposes unrelated to the item's single purpose? | **No** |
| Data transferred to third parties (except service providers)? | **No** |

**Privacy policy URL:** Required. Use a simple public page, for example a GitHub gist or repo page stating:

```
Hoard does not collect, store, or transmit personal data to the developer. When you save an image, data is processed in your browser and written to your computer via a local native bridge you install. No accounts or analytics are provided by this extension.
```

---

## Store listing text (if still empty)

**Summary** (short, shown in search):

```
Save images from any website to your own folders. Right-click, or press H and a shortcut key.
```

**Detailed description:**

```
Hoard saves images from any website to folders you choose, as WebP, JPEG, PNG or the original file.

How to use:
1. Install the Hoard native bridge on Windows (see project documentation).
2. Browse to any website in Chrome.
3. Add your save folders and shortcut keys in Hoard settings.
4. Right-click an image, choose Hoard (or press H), then click a folder or press its shortcut key.

Requires Windows or macOS and a one-time native bridge setup (Python 3).
```

---

## Account settings (required before Publish)

These are **not** on the Privacy tab:

1. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) → **Settings** (gear or Account menu)
2. **Publisher contact email** — enter your email
3. **Verify email** — open the link Google sends and confirm
4. Return to your item → **Privacy practices** → fill all fields → **Save draft**
5. **Publish** → Submit for review

---

## After approval

1. Copy the **extension ID** from the developer item page
2. Update `scripts/hoard_native_host.json` → `allowed_origins`
3. Run `scripts/install_native_host.ps1`

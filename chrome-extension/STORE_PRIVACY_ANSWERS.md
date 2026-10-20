# Chrome Web Store — Privacy practices (copy/paste)

Open your item → **Privacy practices** tab. Paste the text below into each field, then **Save draft**.

Also complete **Account Settings** (contact email + verification) — see bottom of this file.

---

## Single purpose description

```
Hoard saves images from web pages to folders the user chooses on their computer (WebP, JPEG, PNG or the original file). The user initiates each save by right-clicking an image, choosing Hoard (or pressing H), and picking a folder. The extension does not collect analytics and does not alter the content of websites.
```

---

## Permission justifications

### contextMenus

```
Adds a single "Hoard" item when the user right-clicks an image. Choosing it opens Hoard's folder menu on the page, which is how the user starts a save. The item appears only when right-clicking an image.
```

### activeTab

```
When the user right-clicks an image and chooses Hoard, activeTab gives Hoard temporary access to that tab so it can show its folder menu and download the image the user chose. Hoard has no access to any site until the user makes this choice.
```

### Optional host permission — <all_urls> (not requested at install)

```
Optional. Requested only if the user turns on "Allow on all sites" in Hoard settings. Many sites serve images from separate image servers (CDNs) that activeTab does not cover; with this optional permission Hoard can download those images and lets the user press H right after a right-click instead of using the menu. Users who do not turn it on can still save images through the right-click menu.
```

### declarativeNetRequestWithHostAccess

```
Many image servers reject downloads that have no Referer header. While Hoard downloads an image the user chose to save (on a site it has access to), it adds a temporary session rule that sends the page's origin as the Referer for that one request (the same value the browser sends when it displays the image), then removes the rule. No other requests are modified or blocked.
```

### scripting

```
When the user chooses Hoard from the right-click menu, Hoard injects its own bundled content script into that tab (allowed by activeTab) to show its folder menu and save status. If the user has turned on the optional "Allow on all sites" setting, the same bundled script is registered for all pages so the H shortcut works. Only the extension's packaged files are ever injected.
```

### storage

```
Stores the user's Hoard settings: their save folders (name, local path, shortcut key), preferred image format and quality, and notification preferences. Stored locally in the browser only; never transmitted.
```

### nativeMessaging

```
After the user saves an image, the extension sends the image bytes to a registered local program (Hoard native bridge) so the file can be written to the folder the user chose. The settings page also asks the bridge to open the system folder picker. Native messaging is required because Chrome extensions cannot write to arbitrary disk paths directly.
```

### notifications

```
Shows a brief success or error notification after each save attempt (for example, a saved filename or a message if the native bridge is not installed). Users can turn system notifications off in Hoard settings. Notifications are optional feedback only; no personal data is included in the notification text.
```

### Remote code use

```
This extension does not execute remote code. All JavaScript (background, content scripts) is bundled in the package and reviewed as part of the upload. The extension fetches image binary data only when the user explicitly saves an image; it does not download or eval scripts from third-party servers. Native messaging invokes a fixed local program registered by the user on Windows or macOS; the bridge does not load code from the internet.
```

If the form is a **yes/no** question "Does your extension use remote code?" → answer **No**.

If it asks you to justify anyway, use the paragraph above.

---

## Data usage (certification checklist)

On the Privacy practices tab, you will certify data handling. For Hoard, select:

| Question | Answer |
|----------|--------|
| Collect personal / sensitive user data? | **No** — leave every data category unchecked (including "Website content" and "Web history"). Hoard reads the clicked image's address and saves the image on the user's own computer; nothing leaves the device or reaches the developer. |
| Data sold to third parties? | **No** |
| Data used for purposes unrelated to the item's single purpose? | **No** |
| Data transferred to third parties (except service providers)? | **No** |

**Privacy policy URL:** `https://github.com/druchen/Hoard/blob/main/PRIVACY.md` (works once this branch is merged into `main`). Summary of what it says:

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
1. Install the Hoard native bridge on Windows or macOS (see project documentation).
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

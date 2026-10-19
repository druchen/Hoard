# Chrome Web Store — Privacy practices (copy/paste)

Open your item → **Privacy practices** tab. Paste the text below into each field, then **Save draft**.

Also complete **Account Settings** (contact email + verification) — see bottom of this file.

---

## Single purpose description

```
Hoard saves images from web pages to local reference folders on the user's computer as WebP files. The user initiates each save by right-clicking an image or pressing H after right-click. The extension does not collect analytics or modify unrelated sites.
```

---

## Permission justifications

### contextMenus

```
Adds save menu items when the user right-clicks an image on supported pages (for example, "Hoard — Cinematography (H)" or "Hoard — Concept (H)"). This is how the user starts a save. Menus appear only on supported sites and only for image context.
```

### host_permissions — https://shotdeck.com/*

```
Required to download image files from pages where the user chooses to save an image, using their browser session. Images are converted to WebP in the browser and passed to a local save helper.
```

### host_permissions — https://*.artstation.com/*

```
Required to download image files from CDN hosts used by supported pages when the user saves an image. Uses the browser session. Images are converted to WebP and passed to a local save helper.
```

### nativeMessaging

```
After the user saves an image, the extension sends WebP bytes to a registered local program (Hoard native bridge) so the file can be written to the user's configured reference folders. Native messaging is required because Chrome extensions cannot write to arbitrary disk paths directly.
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
Save images from the web to local reference folders as WebP. Right-click or press H.
```

**Detailed description:**

```
Hoard saves images from the web to your local reference folders as WebP files.

How to use:
1. Install the Hoard native bridge on Windows (see project documentation).
2. Browse to a supported page in Chrome.
3. Right-click an image and choose a Hoard save option — or right-click and press H.

Requires Windows and a one-time native host setup.
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

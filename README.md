# Hoard (Chrome Extension)

Save images from the web as WebP via the native bridge.

Sibling project to **[Hoard](../Hoard)** (desktop drag-and-drop app).

| Save option | Folder (Windows) | Folder (Mac) |
|-------------|------------------|--------------|
| Cinematography | `...\Reference\Cinematography` | `/Users/drew/Pictures/Reference/Cinematography` |
| Concept | `...\Reference\Concept` | `/Users/drew/Pictures/Reference/Concept` |

Edit paths in [`hoard_sd/config.py`](hoard_sd/config.py).

## Usage

1. Right-click an **image** on a supported page
2. **Hoard — Cinematography (H)** or **Hoard — Concept (H)**
3. Or right-click the image, then press **H** within 5 seconds

Images are converted to WebP and saved to the matching reference folder.

## Setup

```powershell
cd scripts
.\install_native_host.ps1 -ExtensionId YOUR_STORE_EXTENSION_ID
```

Mac: `./install_native_host.sh YOUR_STORE_EXTENSION_ID`

## Store update

```powershell
.\pack_extension.ps1
```

Upload `dist\hoard.zip`. Listing copy: **[chrome-extension/STORE_PRIVACY_ANSWERS.md](chrome-extension/STORE_PRIVACY_ANSWERS.md)**.

## Privacy

Hoard SD does not collect or transmit personal data to the developer. Saves are processed in the browser and written locally via a native bridge the user installs. No analytics or accounts.

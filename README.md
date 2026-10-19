# Hoard (Chrome Extension)

Save images from any website as WebP via the native bridge.

Sibling project to **[Hoard](../Hoard)** (desktop drag-and-drop app).

| Save option | Folder (Windows) | Folder (Mac) |
|-------------|------------------|--------------|
| Cinematography | `...\Reference\Cinematography` | `/Users/drew/Pictures/Reference/Cinematography` |
| Concept | `...\Reference\Concept` | `/Users/drew/Pictures/Reference/Concept` |

Edit paths in [`hoard/config.py`](hoard/config.py).

## Usage

1. Right-click an **image** on any website
2. **Hoard — Cinematography (H)** or **Hoard — Concept (H)**
3. Or right-click the image, then press **H** within 5 seconds

**H** saves to Cinematography on ShotDeck and Concept on ArtStation. On other sites it uses the folder you last picked from the menu (Cinematography until you pick one).

Images are fetched at the largest size available (ShotDeck full stills, ArtStation 4k, the biggest `srcset` entry elsewhere), converted to WebP, and saved to the matching reference folder. Images that are already WebP are saved unchanged.

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

Hoard does not collect or transmit personal data to the developer. Saves are processed in the browser and written locally via a native bridge the user installs. No analytics or accounts.

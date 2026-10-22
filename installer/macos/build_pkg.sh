#!/bin/bash
# Builds dist/Hoard-Helper-macOS.pkg: the bridge bundled with Python (PyInstaller),
# installed to /Library/Application Support/Hoard and registered for Chrome, Chromium
# and Edge for all users. Run from anywhere on macOS with python3 + pyinstaller.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
VERSION="$(python3 -c 'import hoard; print(hoard.__version__)')"
BUILD="$ROOT/build/macos"
INSTALL_DIR="/Library/Application Support/Hoard"
BRIDGE="$INSTALL_DIR/bridge/hoard-bridge"

rm -rf "$BUILD"
pyinstaller --noconfirm --clean --onedir --name hoard-bridge \
  --paths "$ROOT" --hidden-import tkinter \
  --distpath "$BUILD/pyinstaller" --workpath "$BUILD/work" --specpath "$BUILD" \
  installer/bridge_main.py

PAYLOAD="$BUILD/payload"
mkdir -p "$PAYLOAD$INSTALL_DIR"
cp -R "$BUILD/pyinstaller/hoard-bridge" "$PAYLOAD$INSTALL_DIR/bridge"
cp installer/macos/uninstall.sh "$PAYLOAD$INSTALL_DIR/uninstall.sh"
chmod +x "$PAYLOAD$INSTALL_DIR/uninstall.sh"

for hosts_dir in \
  "/Library/Google/Chrome/NativeMessagingHosts" \
  "/Library/Application Support/Chromium/NativeMessagingHosts" \
  "/Library/Microsoft/Edge/NativeMessagingHosts"; do
  python3 installer/host_manifest.py --path "$BRIDGE" --out "$PAYLOAD$hosts_dir/com.hoard.bridge.json"
done

mkdir -p dist
pkgbuild --root "$PAYLOAD" --install-location / \
  --scripts installer/macos/scripts \
  --identifier com.hoard.helper --version "$VERSION" \
  dist/Hoard-Helper-macOS.pkg

echo "Built dist/Hoard-Helper-macOS.pkg (Hoard Helper $VERSION)"

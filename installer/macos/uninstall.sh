#!/bin/bash
# Removes Hoard Helper. Run: sudo "/Library/Application Support/Hoard/uninstall.sh"
set -e
rm -f "/Library/Google/Chrome/NativeMessagingHosts/com.hoard.bridge.json"
rm -f "/Library/Application Support/Chromium/NativeMessagingHosts/com.hoard.bridge.json"
rm -f "/Library/Microsoft/Edge/NativeMessagingHosts/com.hoard.bridge.json"
rm -rf "/Library/Application Support/Hoard"
pkgutil --forget com.hoard.helper >/dev/null 2>&1 || true
echo "Hoard Helper removed."

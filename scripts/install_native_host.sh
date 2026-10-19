#!/bin/bash
# Registers the Hoard native messaging host for Chrome on macOS.
# Usage:
#   ./install_native_host.sh
#   ./install_native_host.sh YOUR_EXTENSION_ID

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
HOST_JSON="$SCRIPT_DIR/hoard_native_host.json"
LAUNCHER="$SCRIPT_DIR/hoard_native.sh"
EXT_ID="${1:-}"

cat > "$LAUNCHER" <<EOF
#!/bin/bash
cd "$PROJECT_ROOT"
exec python3 -m hoard_sd.native_bridge
EOF
chmod +x "$LAUNCHER"

PYTHON3="$(command -v python3 || true)"
if [ -z "$PYTHON3" ]; then
  echo "ERROR: python3 not found on PATH. Install Python 3 first."
  exit 1
fi

if [ -n "$EXT_ID" ]; then
  ORIGIN="chrome-extension://${EXT_ID}/"
  python3 <<PY
import json
path = "$HOST_JSON"
with open(path, encoding="utf-8-sig") as f:
    data = json.load(f)
data["path"] = "$LAUNCHER"
data["allowed_origins"] = ["$ORIGIN"]
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
print("Set allowed_origins to", "$ORIGIN")
PY
else
  python3 <<PY
import json
path = "$HOST_JSON"
with open(path, encoding="utf-8-sig") as f:
    data = json.load(f)
data["path"] = "$LAUNCHER"
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
print("Using allowed_origins from hoard_native_host.json")
PY
fi

DEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
mkdir -p "$DEST_DIR"
DEST="$DEST_DIR/com.hoard.bridge.json"

python3 <<PY
import json, shutil
with open("$HOST_JSON", encoding="utf-8-sig") as f:
    data = json.load(f)
with open("$DEST", "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY

echo "Native host installed:"
echo "  $DEST"
echo "  Launcher: $LAUNCHER"
echo ""
echo "Next: Right-click an image on a supported page → Hoard save option (H)."

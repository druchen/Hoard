#!/bin/bash
# Registers the Hoard native messaging host for Chrome (and other Chromium browsers) on macOS.
# Usage:
#   ./install_native_host.sh                       # IDs already in hoard_native_host.json + dev ID
#   ./install_native_host.sh EXTENSION_ID [...]    # also allow these IDs (e.g. the Web Store ID)
#
# The extension's error message and Hoard settings show the ID to use.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
HOST_JSON="$SCRIPT_DIR/hoard_native_host.json"
# Launcher lives outside the repo so re-running this script never leaves local git changes.
LAUNCHER_DIR="$HOME/Library/Application Support/Hoard"
LAUNCHER="$LAUNCHER_DIR/hoard_native.sh"
MANIFEST="$PROJECT_ROOT/chrome-extension/manifest.json"
HOST_NAME="com.hoard.bridge"

# Chrome starts the bridge with a minimal PATH (no Homebrew), so pin the absolute Python path.
PYTHON3="$(command -v python3 || true)"
if [ -z "$PYTHON3" ] || ! "$PYTHON3" -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" >/dev/null 2>&1; then
  echo "ERROR: Python 3.8+ not found. Install it from https://www.python.org/downloads/ (or 'brew install python'), then re-run."
  exit 1
fi

mkdir -p "$LAUNCHER_DIR"
cat > "$LAUNCHER" <<EOF
#!/bin/bash
cd "$PROJECT_ROOT"
exec "$PYTHON3" -m hoard.native_bridge
EOF
chmod +x "$LAUNCHER"

HOST_FILE="$(mktemp)"
trap 'rm -f "$HOST_FILE"' EXIT

# Build the host manifest: existing IDs from hoard_native_host.json, the unpacked dev ID
# (from manifest.json's key), and any IDs passed on the command line.
"$PYTHON3" - "$HOST_JSON" "$MANIFEST" "$LAUNCHER" "$HOST_FILE" "$@" <<'PY'
import base64, hashlib, json, re, sys

host_json, manifest_path, launcher, out_path, *ids = sys.argv[1:]

with open(host_json, encoding="utf-8-sig") as f:
    data = json.load(f)

origins = [o for o in data.get("allowed_origins", []) if "REPLACE" not in o]

try:
    with open(manifest_path, encoding="utf-8-sig") as f:
        key = json.load(f).get("key")
    if key:
        digest = hashlib.sha256(base64.b64decode(key)).digest()
        dev_id = "".join(chr(97 + (b >> 4)) + chr(97 + (b & 0x0F)) for b in digest[:16])
        ids.append(dev_id)
except (OSError, ValueError):
    pass

for ext_id in ids:
    ext_id = ext_id.strip().strip("/").replace("chrome-extension://", "")
    if not re.fullmatch(r"[a-p]{32}", ext_id):
        sys.exit(f"ERROR: '{ext_id}' is not a Chrome extension ID (32 letters a-p).")
    origin = f"chrome-extension://{ext_id}/"
    if origin not in origins:
        origins.append(origin)

data["path"] = launcher
data["allowed_origins"] = origins
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")

print("Allowed extension IDs:")
for origin in origins:
    print("  " + origin)
PY

# Install for Google Chrome, plus any other Chromium browser present on this Mac.
SUPPORT="$HOME/Library/Application Support"
INSTALLED=()
for browser_dir in \
  "Google/Chrome" "Google/Chrome Beta" "Google/Chrome Canary" "Chromium" \
  "BraveSoftware/Brave-Browser" "Microsoft Edge" "Arc/User Data" "Vivaldi"; do
  if [ "$browser_dir" = "Google/Chrome" ] || [ -d "$SUPPORT/$browser_dir" ]; then
    dest_dir="$SUPPORT/$browser_dir/NativeMessagingHosts"
    mkdir -p "$dest_dir"
    cp "$HOST_FILE" "$dest_dir/$HOST_NAME.json"
    INSTALLED+=("$dest_dir/$HOST_NAME.json")
  fi
done

echo ""
echo "Native host installed:"
for path in "${INSTALLED[@]}"; do
  echo "  $path"
done
echo "  Launcher: $LAUNCHER (Python: $PYTHON3)"

# Self-test: send a ping the way Chrome does (4-byte length prefix + JSON).
PING_RESULT="$("$PYTHON3" - "$LAUNCHER" <<'PY'
import json, struct, subprocess, sys
msg = json.dumps({"action": "ping"}).encode()
proc = subprocess.run([sys.argv[1]], input=struct.pack("<I", len(msg)) + msg,
                      capture_output=True, timeout=20)
out = proc.stdout
if len(out) < 4:
    print("FAILED: " + (proc.stderr.decode(errors="replace").strip() or "no response"))
else:
    print(json.loads(out[4:4 + struct.unpack("<I", out[:4])[0]]))
PY
)"
echo ""
echo "Bridge self-test: $PING_RESULT"
echo ""
echo "Next: quit and reopen Chrome, then open Hoard settings — it should say 'Native bridge connected'."

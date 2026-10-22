"""Write the Chrome native messaging host manifest for a packaged Hoard Helper.

Allowed extension IDs come from scripts/hoard_native_host.json, so the Web Store ID
and the unpacked dev ID are kept in one place.

Usage: python installer/host_manifest.py --path <bridge executable> --out <file.json>
"""

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IDS_SOURCE = ROOT / "scripts" / "hoard_native_host.json"
ORIGIN = re.compile(r"^chrome-extension://[a-p]{32}/$")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", required=True, help="bridge executable (absolute on macOS)")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    source = json.loads(IDS_SOURCE.read_text(encoding="utf-8-sig"))
    origins = [o for o in source.get("allowed_origins", []) if ORIGIN.match(o)]
    if not origins:
        raise SystemExit(f"No valid allowed_origins in {IDS_SOURCE}")

    manifest = {
        "name": "com.hoard.bridge",
        "description": "Hoard Helper: saves images for the Hoard Chrome extension",
        "path": args.path,
        "type": "stdio",
        "allowed_origins": origins,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out} for {', '.join(origins)}")


if __name__ == "__main__":
    main()

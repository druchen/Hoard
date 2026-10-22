"""Ping a Hoard Helper executable the way Chrome does; exit non-zero on failure.

Usage: python installer/selftest.py <bridge executable>
"""

import json
import struct
import subprocess
import sys


def main():
    message = json.dumps({"action": "ping"}).encode()
    proc = subprocess.run(
        [sys.argv[1]],
        input=struct.pack("<I", len(message)) + message,
        capture_output=True,
        timeout=60,
    )
    out = proc.stdout
    if len(out) < 4:
        raise SystemExit(f"No response. stderr: {proc.stderr.decode(errors='replace')}")
    length = struct.unpack("<I", out[:4])[0]
    response = json.loads(out[4 : 4 + length])
    print(response)
    if not response.get("ok"):
        raise SystemExit(1)


if __name__ == "__main__":
    main()

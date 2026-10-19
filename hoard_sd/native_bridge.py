"""Chrome Native Messaging host: writes WebP bytes to Concept or Cinematography."""

import base64
import json
import os
import struct
import sys

from hoard_sd.bridge_config import resolve_save_folder


def _read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length or len(raw_length) < 4:
        return None
    length = struct.unpack("<I", raw_length)[0]
    if length <= 0:
        return None
    data = sys.stdin.buffer.read(length)
    if len(data) < length:
        return None
    return json.loads(data.decode("utf-8"))


def _write_message(message):
    encoded = json.dumps(message).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def _safe_filename(name):
    name = os.path.basename(name or "").strip()
    if not name.lower().endswith(".webp"):
        name = f"{name}.webp" if name else "hoard.webp"
    if sys.platform == "win32":
        name = "".join(c for c in name if c not in '<>:"/\\|?*')
    else:
        name = name.replace("/", "_").replace("\0", "")
    return name or "hoard.webp"


def handle_message(message):
    filename = _safe_filename(message.get("filename"))
    data_b64 = message.get("data")
    if not data_b64:
        return {"ok": False, "error": "Missing image data"}

    try:
        image_bytes = base64.b64decode(data_b64)
    except Exception as e:
        return {"ok": False, "error": f"Invalid base64 data: {e}"}

    target_dir, err = resolve_save_folder(message)
    if err:
        return {"ok": False, "error": err}

    try:
        os.makedirs(target_dir, exist_ok=True)
    except OSError as e:
        return {"ok": False, "error": f"Cannot create folder: {e}"}

    final_path = os.path.join(target_dir, filename)

    if os.path.exists(final_path) and not message.get("overwrite"):
        return {
            "ok": False,
            "exists": True,
            "filename": filename,
            "path": final_path,
            "folder": target_dir,
        }

    try:
        with open(final_path, "wb") as f:
            f.write(image_bytes)
    except OSError as e:
        return {"ok": False, "error": str(e)}

    return {"ok": True, "path": final_path, "filename": filename, "folder": target_dir}


def main():
    message = _read_message()
    if message is None:
        _write_message({"ok": False, "error": "No message received"})
        return 1

    try:
        response = handle_message(message)
    except Exception as e:
        response = {"ok": False, "error": str(e)}

    _write_message(response)
    return 0 if response.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())

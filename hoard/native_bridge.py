"""Chrome Native Messaging host: saves images to the folders chosen in Hoard settings."""

import base64
import json
import os
import struct
import sys

from hoard import __version__
from hoard.bridge_config import resolve_save_folder
from hoard.config import default_folders

ALLOWED_EXTENSIONS = (".webp", ".jpg", ".jpeg", ".png", ".gif", ".avif", ".bmp")


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
    name = os.path.basename((name or "").replace("\\", "/")).strip()
    if sys.platform == "win32":
        name = "".join(c for c in name if c not in '<>:"/\\|?*' and ord(c) >= 32)
        name = name.rstrip(". ")
    else:
        name = name.replace("/", "_").replace("\0", "")
    if name.startswith("."):
        name = name.lstrip(".")
    if not name.lower().endswith(ALLOWED_EXTENSIONS):
        name = f"{name}.webp" if name else "hoard.webp"
    stem = os.path.splitext(name)[0]
    return name if stem else "hoard" + name


def handle_save(message):
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


def handle_pick_folder(message):
    """Open the system folder picker (used by the Browse button in Hoard settings)."""
    try:
        import tkinter
        from tkinter import filedialog
    except Exception:
        return {
            "ok": False,
            "error": "Folder picker unavailable (this Python has no tkinter). Type the path instead.",
        }

    initial = message.get("initial") or ""
    if not os.path.isdir(initial):
        initial = os.path.expanduser("~")

    try:
        root = tkinter.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        root.lift()
        root.focus_force()
        path = filedialog.askdirectory(
            parent=root,
            initialdir=initial,
            title="Choose a Hoard save folder",
            mustexist=False,
        )
        root.destroy()
    except Exception as e:
        return {"ok": False, "error": f"Folder picker failed: {e}. Type the path instead."}

    if not path:
        return {"ok": False, "cancelled": True}
    return {"ok": True, "path": os.path.normpath(path)}


def handle_message(message):
    action = message.get("action") or "save"
    if action == "ping":
        return {"ok": True, "version": __version__, "platform": sys.platform}
    if action == "defaults":
        return {"ok": True, "folders": default_folders()}
    if action == "pickFolder":
        return handle_pick_folder(message)
    if action == "save":
        return handle_save(message)
    return {"ok": False, "error": f"Unknown action: {action}"}


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

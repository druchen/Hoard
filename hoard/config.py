"""Starting save folders for the Hoard native bridge.

Save folders are managed in the extension's settings page. These entries are only
offered when Hoard has no folders yet, so existing setups keep working.
Requests that name a folderKey instead of a folder path (older extension versions)
also resolve through this table.
"""

import os
import sys

FOLDERS = {
    "cinematography": {
        "name": "Cinematography",
        "win32": r"C:\Users\drew\Pictures\Reference\Cinematography",
        "darwin": "/Users/drew/Pictures/Reference/Cinematography",
    },
    "concept": {
        "name": "Concept",
        "win32": r"C:\Users\drew\Pictures\Reference\Concept",
        "darwin": "/Users/drew/Pictures/Reference/Concept",
    },
}

DEFAULT_FOLDER_KEY = "cinematography"


def _platform():
    return "darwin" if sys.platform == "darwin" else "win32"


def save_folder(folder_key=None):
    key = (folder_key or DEFAULT_FOLDER_KEY).lower()
    paths = FOLDERS.get(key) or FOLDERS[DEFAULT_FOLDER_KEY]
    return paths[_platform()]


def default_folders():
    """[{name, path}] offered when Hoard has no folders yet.

    The entries above are used only where their parent folder already exists (the
    original setup); anyone else starts with a single Pictures/Hoard folder.
    """
    if sys.platform not in ("win32", "darwin"):
        return []
    platform = _platform()
    existing = [
        {"name": entry["name"], "path": entry[platform]}
        for entry in FOLDERS.values()
        if entry.get(platform) and os.path.isdir(os.path.dirname(entry[platform]))
    ]
    if existing:
        return existing
    return [{"name": "Hoard", "path": os.path.join(os.path.expanduser("~"), "Pictures", "Hoard")}]

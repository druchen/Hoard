"""Starting save folders for the Hoard native bridge.

Save folders are managed in the extension's settings page. These entries are only
offered once, the first time the extension runs, so existing setups keep working.
Requests that name a folderKey instead of a folder path (older extension versions)
also resolve through this table.
"""

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
    """[{name, path}] for this platform, in display order."""
    if sys.platform not in ("win32", "darwin"):
        return []
    platform = _platform()
    return [
        {"name": entry["name"], "path": entry[platform]}
        for entry in FOLDERS.values()
        if entry.get(platform)
    ]

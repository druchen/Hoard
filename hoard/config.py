"""Save paths for the Hoard native bridge (per site folder)."""

import sys

FOLDERS = {
    "concept": {
        "win32": r"C:\Users\drew\Pictures\Reference\Concept",
        "darwin": "/Users/drew/Pictures/Reference/Concept",
    },
    "cinematography": {
        "win32": r"C:\Users\drew\Pictures\Reference\Cinematography",
        "darwin": "/Users/drew/Pictures/Reference/Cinematography",
    },
}

DEFAULT_FOLDER_KEY = "cinematography"


def save_folder(folder_key=None):
    key = (folder_key or DEFAULT_FOLDER_KEY).lower()
    platform = "darwin" if sys.platform == "darwin" else "win32"
    paths = FOLDERS.get(key) or FOLDERS[DEFAULT_FOLDER_KEY]
    return paths[platform]

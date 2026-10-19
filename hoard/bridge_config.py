"""Resolve save folder for the native bridge."""

import os

from hoard.config import save_folder


def resolve_save_folder(message=None):
    message = message or {}
    folder_path = (message.get("folderPath") or "").strip()
    if folder_path:
        folder = os.path.normpath(os.path.expanduser(folder_path))
    else:
        folder_key = message.get("folderKey") or message.get("folder")
        folder = os.path.normpath(save_folder(folder_key))

    if not os.path.isabs(folder):
        return None, f"Save folder must be an absolute path: {folder}"

    parent = folder
    while parent and not os.path.isdir(parent):
        next_parent = os.path.dirname(parent)
        if next_parent == parent:
            break
        parent = next_parent

    if parent and not os.access(parent, os.W_OK):
        return None, f"Cannot write to folder (permission denied): {folder}"

    return folder, None

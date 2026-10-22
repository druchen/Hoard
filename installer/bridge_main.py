"""Entry point for the packaged Hoard Helper (built with PyInstaller)."""

import sys

from hoard.native_bridge import main

if __name__ == "__main__":
    sys.exit(main())

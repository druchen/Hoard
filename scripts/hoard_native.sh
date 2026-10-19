#!/bin/bash
cd "$(dirname "$0")/.."
exec python3 -m hoard.native_bridge

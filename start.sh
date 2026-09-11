#!/usr/bin/env bash
#
# VibeDesk - one-command client launcher.
#
# Starts the Electron desktop app in development mode (Vite dev server +
# Electron window). The client window opens automatically.
#
# Usage:
#   ./start.sh          # from anywhere in the project
#   pnpm start          # equivalent npm-script alias
#
set -euo pipefail

# Resolve the project root no matter where the script is invoked from.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT/apps/desktop"

echo "Starting VibeDesk client (dev mode)..."
echo "The Electron window will open in a moment."

pnpm dev

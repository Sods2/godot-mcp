#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEST="$HOME/.claude/mcp-servers/godot-claude-mcp"

# Build first
cd "$PROJECT_DIR"
npm run build

# Install
mkdir -p "$DEST"
cp -r "$PROJECT_DIR/build" "$DEST/"
cp "$PROJECT_DIR/package.json" "$DEST/"
cd "$DEST" && npm install --omit=dev

echo "Installed to $DEST"
echo ""
echo "Add to your project's .mcp.json:"
echo '  "godot": {'
echo '    "command": "node",'
echo "    \"args\": [\"$DEST/build/index.js\"],"
echo '    "env": { "GODOT_PATH": "/path/to/godot" }'
echo '  }'

#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEST="$HOME/.claude/mcp-servers/godot-mcp"

# Build first
cd "$PROJECT_DIR"
npm run build

# Install
mkdir -p "$DEST"
cp -r "$PROJECT_DIR/build" "$DEST/"
cp -r "$PROJECT_DIR/scripts" "$DEST/"
cp "$PROJECT_DIR/package.json" "$DEST/"
cd "$DEST" && npm install --omit=dev

echo "Installed to $DEST"
echo ""

# Auto-detect Godot executable.
# Delegate to the server's own resolver so this script and the running server
# can never disagree about which Godot is used.
DETECTED_GODOT="$(cd "$DEST" && node -e "
import('./build/godot-path.js')
  .then((m) => m.findGodotPath())
  .then((p) => console.log(p))
  .catch(() => process.exit(1))
" 2>/dev/null || true)"

if [ -n "$DETECTED_GODOT" ]; then
  echo "Found Godot at: $DETECTED_GODOT"
  GODOT_PATH_VALUE="$DETECTED_GODOT"
else
  echo "WARNING: Could not find Godot automatically."
  echo "  - macOS: Godot*.app in /Applications, ~/Applications, ~/Documents,"
  echo "           ~/Downloads or ~/Desktop is detected automatically"
  echo "  - Linux: install via package manager or download from godotengine.org"
  echo "  - Set GODOT_PATH in your .mcp.json to the full path of the Godot executable"
  GODOT_PATH_VALUE="/path/to/godot"
fi

echo ""
echo "Add to your project's .mcp.json:"
echo '{'
echo '  "mcpServers": {'
echo '    "godot": {'
echo '      "command": "node",'
echo "      \"args\": [\"$DEST/build/index.js\"],"
echo "      \"env\": { \"GODOT_PATH\": \"$GODOT_PATH_VALUE\" }"
echo '    }'
echo '  }'
echo '}'

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

# Auto-detect Godot executable
DETECTED_GODOT=""
if [ -n "$GODOT_PATH" ] && [ -x "$GODOT_PATH" ]; then
  DETECTED_GODOT="$GODOT_PATH"
elif command -v godot &>/dev/null; then
  DETECTED_GODOT="$(command -v godot)"
else
  case "$(uname)" in
    Darwin)
      for p in \
        "/Applications/Godot.app/Contents/MacOS/Godot" \
        "/Applications/Godot_v4.5-stable_macos.universal.app/Contents/MacOS/Godot" \
        "/Applications/Godot_v4.4-stable_macos.universal.app/Contents/MacOS/Godot" \
        "/Applications/Godot_v4.3-stable_macos.universal.app/Contents/MacOS/Godot" \
        "$HOME/Applications/Godot.app/Contents/MacOS/Godot"; do
        [ -x "$p" ] && DETECTED_GODOT="$p" && break
      done
      ;;
    Linux)
      for p in /usr/bin/godot /usr/local/bin/godot /snap/bin/godot "$HOME/.local/bin/godot"; do
        [ -x "$p" ] && DETECTED_GODOT="$p" && break
      done
      ;;
  esac
fi

if [ -n "$DETECTED_GODOT" ]; then
  echo "Found Godot at: $DETECTED_GODOT"
  GODOT_PATH_VALUE="$DETECTED_GODOT"
else
  echo "WARNING: Could not find Godot automatically."
  echo "  - macOS: look for Godot.app in /Applications/ or ~/Applications/"
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

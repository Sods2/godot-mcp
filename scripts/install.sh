#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEST="$HOME/.claude/mcp-servers/godot-mcp"

# Preflight: make sure node and npm are present and new enough. An old npm
# (<10) can crash while resolving this dependency tree with a cryptic
# "Cannot read properties of null (reading 'edgesOut')" and leave a
# half-installed server, so fail early with a clear fix instead.
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is not on PATH. Install Node.js 18 or later from https://nodejs.org" >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm is not on PATH. Install Node.js 18 or later from https://nodejs.org" >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "ERROR: Node.js 18 or later is required (found $(node --version))." >&2
  exit 1
fi
NPM_MAJOR="$(npm --version 2>/dev/null | cut -d. -f1)"
if [ -n "$NPM_MAJOR" ] && [ "$NPM_MAJOR" -lt 10 ]; then
  echo "WARNING: npm $(npm --version) is old and can crash while installing." >&2
  echo "         If this run fails, upgrade with: npm install -g npm@latest" >&2
fi

# Build first
cd "$PROJECT_DIR"
npm run build

# Install
mkdir -p "$DEST"
cp -r "$PROJECT_DIR/build" "$DEST/"
cp -r "$PROJECT_DIR/scripts" "$DEST/"
cp "$PROJECT_DIR/package.json" "$DEST/"
# Don't let `set -e` abort on an npm failure here — we want the verification
# below to run and print an actionable message instead of a raw crash.
cd "$DEST" && npm install --omit=dev || true

# Verify the dependency install actually landed. If npm failed or was
# interrupted, the copy above still leaves build/ and package.json in place,
# which looks installed but has no node_modules — the server would fail at
# startup with "Cannot find module '@modelcontextprotocol/sdk'". Fail loudly.
if [ ! -d "$DEST/node_modules/@modelcontextprotocol/sdk" ]; then
  echo "" >&2
  echo "ERROR: dependency install failed — $DEST/node_modules is incomplete." >&2
  echo "  Re-run with a current npm (>=10):" >&2
  echo "    cd \"$DEST\" && npm install --omit=dev" >&2
  echo "  If npm crashes with an 'edgesOut' error, first: npm install -g npm@latest" >&2
  exit 1
fi

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

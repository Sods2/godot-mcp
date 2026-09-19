#!/bin/bash
# Run the headless GDScript tests in tests/gdscript/ against a throwaway project
# that has the godot_mcp_bridge addon installed.
#
# Requires a Godot binary: set GODOT_PATH, or ensure `godot` is on PATH.
# These tests are separate from `npm test` (vitest) because they need Godot.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

GODOT="${GODOT_PATH:-godot}"
if ! command -v "$GODOT" >/dev/null 2>&1 && [ ! -x "$GODOT" ]; then
  echo "ERROR: Godot not found. Set GODOT_PATH or put 'godot' on PATH." >&2
  exit 1
fi

TEST_DIR="$REPO_DIR/tests/gdscript"
if [ ! -d "$TEST_DIR" ]; then
  echo "No GDScript tests found at $TEST_DIR" >&2
  exit 0
fi

# Build a temp project: addon + the test files, referenced via res://.
PROJECT_DIR="$(mktemp -d)"
trap 'rm -rf "$PROJECT_DIR"' EXIT

cp -r "$REPO_DIR/plugin/addons" "$PROJECT_DIR/addons"
mkdir -p "$PROJECT_DIR/tests/gdscript"
cp "$TEST_DIR"/*.gd "$PROJECT_DIR/tests/gdscript/"
cat > "$PROJECT_DIR/project.godot" <<'EOF'
config_version=5

[application]

config/name="godot-mcp gdscript tests"
config/features=PackedStringArray("4.3")
EOF

failed=0
for test_file in "$PROJECT_DIR"/tests/gdscript/*.gd; do
  name="$(basename "$test_file")"
  echo "--- $name ---"
  if ! "$GODOT" --headless --path "$PROJECT_DIR" --script "res://tests/gdscript/$name"; then
    echo "  ^ FAILED ($name)" >&2
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then
  echo "GDScript tests FAILED" >&2
  exit 1
fi
echo "GDScript tests passed"

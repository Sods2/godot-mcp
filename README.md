# godot-claude-mcp

A Model Context Protocol (MCP) server that gives Claude full integration with the Godot game engine IDE. Interact with live editor state, parse and modify scene files, run projects, capture screenshots, and more — all from Claude.

## Features

- **Scene editing** — Parse, create, and modify `.tscn` scene files directly on disk (no editor required)
- **Live editor integration** — Add/remove nodes, set properties, open scenes, and save via the running Godot editor
- **Script tools** — Read open scripts, get selected code, and insert code at the cursor
- **Run/stop scenes** — Launch scenes in debug mode and capture stdout/stderr output
- **Screenshots** — Capture the editor viewport as a base64 PNG image
- **Project scanning** — Discover Godot projects and read project metadata
- **GDScript validation** — Validate scripts using Godot's `--check-only` flag
- **Testing** — Detect, list, create, and run GDScript tests with GUT, GdUnit4, or the built-in runner
- **Resource UIDs** — Look up and update Godot 4.4+ resource UIDs
- **Auto-detects Godot** — Finds the Godot executable automatically on macOS, Windows, and Linux (including Steam installs)

## Architecture

The integration has two components:

1. **Node.js MCP server** (`src/`) — Runs as a stdio MCP server. Handles file-based operations directly and connects to the Godot editor via TCP for live operations.
2. **Godot editor plugin** (`plugin/`) — A GDScript `@tool` plugin that runs a TCP server on `127.0.0.1:6008` inside the editor, exposing editor state over JSON-RPC.

Many tools work in a hybrid mode: they use the live editor bridge when available, and fall back to file-based parsing when the editor is not running.

## Prerequisites

- **Node.js** 18 or later
- **Godot** 4.3 or later
- **Claude Code** or another MCP-compatible client

## Installation

### 1. Build and install the MCP server

```bash
git clone https://github.com/Sods2/godot-claude-mcp.git
cd godot-claude-mcp
npm install
./scripts/install.sh
```

The install script compiles TypeScript, copies the build output to `~/.claude/mcp-servers/godot-claude-mcp/`, and installs production dependencies there.

### 2. Add the server to your project's `.mcp.json`

Create or update `.mcp.json` in your Claude project root:

```json
{
  "mcpServers": {
    "godot": {
      "command": "node",
      "args": ["~/.claude/mcp-servers/godot-claude-mcp/build/index.js"],
      "env": {
        "GODOT_PATH": "/path/to/godot"
      }
    }
  }
}
```

> **`GODOT_PATH` is optional.** If omitted, the server will search for Godot in standard locations automatically. Set it explicitly if Godot is installed somewhere non-standard.

### 3. Install the Godot editor plugin (optional, for live editor tools)

The plugin is required for tools that interact with the running Godot editor (live scene tree edits, screenshots, script insertion, etc.). File-based tools work without it.

1. Copy `plugin/addons/godot_claude_bridge/` into your Godot project's `addons/` directory
2. Open the project in the Godot editor
3. Go to **Project > Project Settings > Plugins**
4. Enable **Claude Bridge**

The plugin starts a TCP server on `127.0.0.1:6008` when enabled.

## Tool Reference

### Project & Version

| Tool | Description |
|------|-------------|
| `godot_get_version` | Get the installed Godot version |
| `godot_list_projects` | Scan a directory for Godot projects |
| `godot_get_project_info` | Get project name, version, and file counts |

### Editor Control

| Tool | Description |
|------|-------------|
| `godot_launch_editor` | Launch the Godot editor for a project |
| `godot_editor_status` | Get editor connection status and open scenes |
| `godot_open_scene` | Open a scene file in the editor |

### Scene Editing (file-based, no editor required)

| Tool | Description |
|------|-------------|
| `godot_parse_scene` | Parse a `.tscn` file to JSON |
| `godot_create_scene` | Create a new `.tscn` file with a root node |
| `godot_add_node_to_file` | Add a node to a `.tscn` file |
| `godot_set_property_in_file` | Set a node property in a `.tscn` file |
| `godot_load_sprite_in_file` | Set a Sprite2D texture resource |

### Scene Editing (live editor, requires plugin)

| Tool | Description |
|------|-------------|
| `godot_get_scene_tree` | Get the full scene tree of the current scene |
| `godot_get_selected_nodes` | Get the currently selected nodes |
| `godot_get_node_properties` | Get all properties of a node by path |
| `godot_add_node` | Add a node via the live editor |
| `godot_remove_node` | Remove a node via the live editor |
| `godot_reparent_node` | Move a node to a new parent |
| `godot_set_property` | Set a node property via the live editor |
| `godot_save_scene` | Save the current scene |

### Scripts

| Tool | Description |
|------|-------------|
| `godot_validate_script` | Validate a GDScript file using `--check-only` |
| `godot_get_current_script` | Get the open script, source, and cursor position |
| `godot_get_open_scripts` | List all open scripts |
| `godot_get_selected_code` | Get selected text in the script editor |
| `godot_insert_code` | Insert code at the cursor position |

### Run & Debug

| Tool | Description |
|------|-------------|
| `godot_run_project` | Run the project in debug mode |
| `godot_stop_project` | Stop the running project |
| `godot_get_debug_output` | Get stdout/stderr from the running project |
| `godot_run_scene` | Run a specific scene |
| `godot_stop_scene` | Stop the running scene |
| `godot_get_output` | Get scene output |
| `godot_is_running` | Check if a scene is running |

### Testing

GDScript does not support custom annotations for tests. All frameworks use the `test_` method naming convention. Tests can be run headlessly without opening the editor.

| Tool | Description |
|------|-------------|
| `godot_detect_test_framework` | Detect which test framework is installed (GUT, GdUnit4, or built-in) |
| `godot_list_tests` | List all test files and their `test_` methods |
| `godot_create_test` | Generate a test file skeleton for a source script |
| `godot_run_tests` | Run tests headlessly and return pass/fail results |

**Supported frameworks:**
- **[GUT](https://github.com/bitwes/Gut)** — auto-detected via `addons/gut/`; tests extend `GutTest`
- **[GdUnit4](https://github.com/MikeSchulze/gdUnit4)** — auto-detected via `addons/gdUnit4/`; tests extend `GdUnitTestSuite`
- **Built-in** — no addon needed; a minimal test runner is bundled with this MCP server

**Example test (GUT):**
```gdscript
extends GutTest

func before_each() -> void:
    pass

func test_player_starts_with_full_health() -> void:
    var player = Player.new()
    assert_eq(player.health, 100)
    player.free()
```

### Visuals & Resources

| Tool | Description |
|------|-------------|
| `godot_take_screenshot` | Capture the editor viewport as a base64 PNG |
| `godot_get_uid` | Get the UID for a resource file (Godot 4.4+) |
| `godot_update_uids` | Update all resource UIDs in the project |

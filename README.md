# godot-mcp

[![CI](https://github.com/Sods2/godot-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Sods2/godot-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A Model Context Protocol (MCP) server that gives AI assistants full integration with the Godot game engine IDE. Interact with live editor state, parse and modify scene files, run projects, capture screenshots, debug with breakpoints, profile performance, and more.

**77 tools** across 15 categories, covering the full Godot development workflow.

## Features

- **Scene editing** — Parse, create, and modify `.tscn` scene files directly on disk (no editor required)
- **Live editor integration** — Add/remove/rename/duplicate/move/reparent nodes, set properties, open scenes, and save via the running Godot editor
- **Script tools** — Read open scripts, get selected code, insert code at the cursor, create and attach scripts, detach scripts
- **Signals** — List, connect, and disconnect signals on nodes
- **Animation** — List, inspect, and create animations in AnimationPlayer nodes
- **Run/stop scenes** — Launch scenes in debug mode and capture stdout/stderr output with incremental polling
- **Screenshots** — Capture the editor viewport or the running game window as base64 PNG images
- **Debugger** — Set/remove breakpoints, inspect stack traces and local variables, step over/into/out, continue execution
- **Profiler** — Start/stop profiling and retrieve performance frame data
- **File & resource management** — Create folders, list directories, delete/rename files, list/import/read/write resources
- **Export** — List export presets, export projects, export MeshLibrary resources
- **Project scanning** — Discover Godot projects (with sort and version filter) and read project metadata
- **GDScript validation** — Validate scripts using Godot's `--check-only` flag
- **Testing** — Detect, list, create, and run GDScript tests with GUT, GdUnit4, or the built-in runner
- **Resource UIDs** — Look up and update Godot 4.4+ resource UIDs
- **Autoloads** — List and add autoload singletons
- **Auto-detects Godot** — Finds the Godot executable automatically on macOS, Windows, and Linux (including Steam installs)

## Architecture

The integration has two components:

1. **Node.js MCP server** (`src/`) — Runs as a stdio MCP server. Handles file-based operations directly and connects to the Godot editor via TCP for live operations.
2. **Godot editor plugin** (`plugin/`) — A GDScript `@tool` plugin that runs a TCP server on `127.0.0.1:6008` inside the editor, exposing editor state over JSON-RPC.

Many tools work in a hybrid mode: they use the live editor bridge when available, and fall back to file-based parsing when the editor is not running.

### Development

```bash
npm run build      # compile TypeScript to build/
npm test           # run the vitest suite (Node side, no Godot needed)
npm run test:gd    # headless GDScript tests (requires Godot; set GODOT_PATH)
npm run test:bridge # editor-bridge end-to-end (boots the editor; set GODOT_PATH)
```

`npm run test:gd` builds a throwaway project with the editor plugin installed and runs every test in `tests/gdscript/` headlessly, exiting non-zero on any failure.

`npm run test:bridge` boots a real Godot editor with the addon, drives the bridge tools through the MCP server over the 6008 socket, and asserts the editor changed — the only automated check of the full MCP → bridge → editor path. On a headless host (CI) run it under `xvfb-run` with a software renderer (`GODOT_EDITOR_ARGS="--rendering-driver opengl3"`).

## Prerequisites

- **Node.js** 18 or later, with **npm 10 or later** (older npm can crash while installing dependencies — upgrade with `npm install -g npm@latest`)
- **Godot** 4.3 through 4.7 — verified against 4.6.3 and 4.7.2. Scene files round-trip byte-identically: node identity (`unique_id`), groups, instance links, editable instances and signal binds are all preserved
- **Claude Code** or another MCP-compatible client

## Installation

### 1. Build and install the MCP server

```bash
git clone https://github.com/Sods2/godot-mcp.git
cd godot-mcp
npm install
```

Then run the installer for your platform:

**macOS / Linux:**
```bash
./scripts/install.sh
```

**Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

> Windows users: run the PowerShell installer rather than the bash script under Git Bash — Git Bash often ships an old, crash-prone npm.

The installer compiles TypeScript, copies the build output to `~/.claude/mcp-servers/godot-mcp/` (`%USERPROFILE%\.claude\mcp-servers\godot-mcp\` on Windows), installs production dependencies there, and prints a ready-to-paste `.mcp.json` snippet with your Godot path pre-filled.

### 2. Add the server to your project's `.mcp.json`

Create or update `.mcp.json` in your Claude project root:

```json
{
  "mcpServers": {
    "godot": {
      "command": "node",
      "args": ["~/.claude/mcp-servers/godot-mcp/build/index.js"],
      "env": {
        "GODOT_PATH": "/path/to/godot"
      }
    }
  }
}
```

> **Setting `GODOT_PATH`:** The install script auto-detects Godot and pre-fills this value. If it can't find Godot, or if you install to a custom location, set the path explicitly. The server checks `GODOT_PATH`, then `godot` on `$PATH`, then these standard locations:
>
> | Platform | Typical paths |
> |----------|--------------|
> | macOS | `/Applications/Godot.app/Contents/MacOS/Godot` |
> | Linux | `/usr/bin/godot`, `~/.local/bin/godot` |
> | Windows | `C:\Program Files\Godot\Godot.exe` |
>
> On macOS the executable is inside the `.app` bundle at `Godot.app/Contents/MacOS/Godot`.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `GODOT_PATH` | Path to the Godot executable. Auto-detected if omitted (see above). |
| `GODOT_PROJECT_PATH` | Default Godot project directory. When set, tools that require `project_path` will use this value if no explicit path is passed. The server also auto-detects by walking up from the current working directory looking for `project.godot`. |

### 3. Install the Godot editor plugin (optional, for live editor tools)

The plugin is required for tools that interact with the running Godot editor (live scene tree edits, screenshots, script insertion, etc.). File-based tools work without it.

1. Copy `plugin/addons/godot_mcp_bridge/` into your Godot project's `addons/` directory
2. Open the project in the Godot editor
3. Go to **Project > Project Settings > Plugins**
4. Enable **Claude Bridge**

To screenshot the *running game*, the plugin registers an autoload
(`ClaudeBridgeGameCapture`) in your project. The editor cannot read the game's
pixels — Godot runs the game as a separate process — so the capture has to
happen inside the game and travel back over the debugger connection. The
autoload does nothing unless a debugger is attached, so exported builds are
unaffected. To opt out, set `claude_bridge/enable_game_capture` to `false` in
the editor settings; the autoload is removed on the next editor start.

The plugin starts a TCP server on `127.0.0.1:6008` when enabled.

## Tool Reference

### Project & Version

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `godot_get_version` | Get the installed Godot version | — |
| `godot_list_projects` | Scan a directory for Godot projects | `sort_by` (name/path/modified), `godot_version` filter |
| `godot_get_project_info` | Get project name, version, and file counts | `project_path` |

### Autoloads

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `godot_get_autoloads` | List all autoload singletons configured in the project | `project_path` |
| `godot_add_autoload` | Add an autoload singleton to the project | `name`, `script_path` |

### Editor Control

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `godot_launch_editor` | Launch the Godot editor for a project | `project_path` |
| `godot_editor_status` | Get editor connection status, open scenes, playing state | — |
| `godot_open_scene` | Open a scene file in the editor | `scene_path` |

### Scene Editing (file-based, no editor required)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `godot_parse_scene` | Parse a `.tscn` file to JSON | `scene_path` |
| `godot_create_scene` | Create a new `.tscn` file with a root node | `root_node_type`, `root_node_name` |
| `godot_add_node_to_file` | Add a node to a `.tscn` file | `node_type`, `node_name`, `parent_path`, `properties` |
| `godot_set_property_in_file` | Set a node property in a `.tscn` file | `node_path`, `property`, `value` |
| `godot_load_sprite_in_file` | Set a Sprite2D texture resource | `node_path`, `texture_path` |

### Scene Editing (live editor, requires plugin)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `godot_get_scene_tree` | Get the scene tree of the current scene | `max_depth`, `type_filter` (e.g. `"Sprite2D"`) |
| `godot_get_selected_nodes` | Get the currently selected nodes | — |
| `godot_get_node_properties` | Get all properties of a node by path | `path` |
| `godot_add_node` | Add a node via the live editor | `node_type`, `node_name`, `parent_path`, `properties` (JSON) |
| `godot_remove_node` | Remove a node via the live editor | `path` |
| `godot_reparent_node` | Move a node to a new parent | `path`, `new_parent` |
| `godot_rename_node` | Rename a node in the current scene | `path`, `new_name` |
| `godot_duplicate_node` | Duplicate a node in the current scene | `path`, `new_name` (optional) |
| `godot_move_node` | Reorder a node within its parent | `path`, `index` (0 = first child) |
| `godot_set_property` | Set a node property via the live editor | `path`, `property`, `value` |
| `godot_save_scene` | Save the current scene | — |

### Scripts

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `godot_validate_script` | Validate a GDScript file using `--check-only` | `script_path`, `include_warnings` |
| `godot_get_current_script` | Get the open script, source, and cursor position | — |
| `godot_get_open_scripts` | List all open scripts | — |
| `godot_get_selected_code` | Get selected text in the script editor | — |
| `godot_insert_code` | Insert code at the cursor position | `text` |
| `godot_create_script` | Create a new GDScript and attach it to a node | `node_path`, `script_path`, `template` |
| `godot_detach_script` | Remove the script attached to a node | `node_path` |
| `godot_get_script_for_node` | Get the script path attached to a node | `path` |

### Signals

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `godot_list_signals` | List all signals exposed by a node | `path` |
| `godot_connect_signal` | Connect a signal to a method on another node | `from_path`, `signal_name`, `to_path`, `method`, `flags` |
| `godot_disconnect_signal` | Disconnect a signal connection | `from_path`, `signal_name`, `to_path`, `method` |
| `godot_list_connections` | List all signal connections on a node | `path` |

### Animation

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `godot_list_animations` | List all animations in an AnimationPlayer | `path` |
| `godot_get_animation` | Get detailed track and keyframe data | `path`, `animation_name` |
| `godot_create_animation` | Create a new animation with tracks | `path`, `animation_name`, `length`, `loop_mode`, `tracks` (JSON) |

### Files & Resources

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `godot_create_folder` | Create a new folder in the project | `folder_path` |
| `godot_list_directory` | List files and folders in a directory | `directory` |
| `godot_delete_file` | Delete a file from the project | `path` |
| `godot_rename_file` | Rename or move a file | `path`, `new_path` |
| `godot_list_resources` | List resource files, optionally filtered by extension | `path`, `extensions` |
| `godot_import_asset` | Reimport assets in the editor | `paths` (array) |
| `godot_read_resource` | Read a resource's properties via the editor | `path` |
| `godot_write_resource` | Write properties to a resource via the editor | `path`, `properties` |
| `godot_get_uid` | Get the UID for a resource file (Godot 4.4+) | `file_path` |
| `godot_update_uids` | Update all resource UIDs in the project | `project_path` |

### Export

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `godot_list_export_presets` | List all export presets in the project | `project_path` |
| `godot_export_project` | Export using a configured preset | `preset`, `output_path`, `debug` |
| `godot_export_mesh_library` | Export a scene as a MeshLibrary resource | `scene_path`, `output_path` |

### Run & Debug

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `godot_run_project` | Run the project in debug mode | `project_path`, `scene` |
| `godot_stop_project` | Stop the running project | — |
| `godot_get_debug_output` | Get stdout/stderr from the running project | — |
| `godot_run_scene` | Run a scene (via editor bridge or process spawn) | `project_path`, `scene` |
| `godot_stop_scene` | Stop the running scene | — |
| `godot_get_output` | Get scene output with incremental polling | `since_line` (return lines after this index) |
| `godot_is_running` | Check if a scene/project is running | — |

### Testing

GDScript does not support custom annotations for tests. All frameworks use the `test_` method naming convention. Tests can be run headlessly without opening the editor.

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `godot_detect_test_framework` | Detect which test framework is installed (GUT, GdUnit4, or built-in) | `project_path` |
| `godot_list_tests` | List all test files and their `test_` methods | `directory` |
| `godot_create_test` | Generate a test file skeleton for a source script | `source_script`, `test_path`, `framework` |
| `godot_run_tests` | Run tests headlessly and return pass/fail results | `path_filter`, `test_filter`, `test_method` (exact name match), `framework`, `timeout` |

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

### Screenshots

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `godot_take_screenshot` | Capture the editor viewport as a base64 PNG | — |
| `godot_take_game_screenshot` | Capture the running game window as a base64 PNG | — |

### Debugger

All debugger tools require the editor plugin and a running game paused at a breakpoint (except set/remove/list breakpoints).

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `godot_set_breakpoint` | Set a breakpoint at a file and line | `file`, `line` |
| `godot_remove_breakpoint` | Remove a breakpoint at a file and line | `file`, `line` |
| `godot_list_breakpoints` | List all active breakpoints | — |
| `godot_get_stack_trace` | Get the current stack trace when paused | — |
| `godot_get_locals` | Get local variables when paused | — |
| `godot_step_over` | Step over the current line | — |
| `godot_step_into` | Step into the current function call | — |
| `godot_step_out` | Step out of the current function | — |
| `godot_continue` | Continue execution after a breakpoint pause | — |

### Profiler

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `godot_start_profiler` | Start capturing performance profiling data | — |
| `godot_stop_profiler` | Stop profiling and return collected data | — |
| `godot_get_profiler_data` | Get collected profiler frames without stopping | — |

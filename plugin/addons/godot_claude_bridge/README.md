# Claude Bridge - Godot EditorPlugin

A Godot 4.x editor plugin that exposes editor capabilities to Claude via a local TCP bridge using JSON-RPC over Content-Length framing.

## Installation

1. Copy the `addons/godot_claude_bridge/` folder into your Godot project's `addons/` directory
2. Open your project in the Godot editor
3. Go to **Project > Project Settings > Plugins**
4. Enable **Claude Bridge**

The plugin starts a TCP server on `127.0.0.1:6008` when enabled.

## How it works

The plugin runs a TCP server inside the Godot editor process. The external MCP server (Node.js) connects to it and sends JSON-RPC commands to read and modify editor state in real time.

### Supported methods

| Method | Description |
|--------|-------------|
| `editor.status` | Get editor connection status and open scenes |
| `scene.get_tree` | Get the full scene tree structure |
| `scene.get_selected` | Get currently selected nodes |
| `scene.add_node` | Add a new node to the scene |
| `scene.remove_node` | Remove a node from the scene |
| `scene.reparent_node` | Move a node to a new parent |
| `scene.open` | Open a scene file |
| `scene.save` | Save the current scene |
| `inspector.get_properties` | Get all editor-visible properties of a node |
| `inspector.set_property` | Set a property on a node |
| `script.get_current` | Get the currently open script and cursor position |
| `script.get_open` | List all open scripts |
| `script.get_selected_code` | Get the selected text in the script editor |
| `script.insert_at_cursor` | Insert text at the cursor position |
| `run.play` | Play the current or a specific scene |
| `run.stop` | Stop the running scene |
| `run.is_running` | Check if a scene is running |
| `run.get_output` | Get captured output lines |
| `screenshot.viewport` | Capture the editor viewport as base64 PNG |

## Requirements

- Godot 4.3 or later

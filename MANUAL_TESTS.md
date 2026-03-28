# Manual Test Plan: Godot Claude MCP

## Prerequisites
- Godot 4.x installed
- A test Godot project open in the editor
- The editor plugin installed and active (`./scripts/install.sh`)

---

## 1. Project Discovery (no editor needed)
```
godot_get_version
godot_list_projects {path: "~/Documents"}
godot_get_project_info {project_path: "/path/to/project"}
godot_get_autoloads {project_path: "/path/to/project"}
```

## 2. Editor Connection
```
godot_editor_status
godot_get_scene_tree
godot_get_selected_nodes
```
- Verify: reports connected, returns open scene tree

## 3. Scene Manipulation (editor open, scene loaded)
```
godot_get_node_properties {node_path: "Node2D"}
godot_add_node {type: "Sprite2D", name: "TestSprite", parent_path: "."}
godot_rename_node {node_path: "TestSprite", new_name: "RenamedSprite"}
godot_duplicate_node {node_path: "RenamedSprite"}
godot_move_node {node_path: "RenamedSprite2", new_index: 0}
godot_reparent_node {node_path: "RenamedSprite2", new_parent_path: "RenamedSprite"}
godot_remove_node {node_path: "RenamedSprite/RenamedSprite2"}
godot_save_scene
```

## 4. Script Tools (select a node with a script)
```
godot_get_open_scripts
godot_get_current_script
godot_get_script_for_node {node_path: "YourNode"}
godot_create_script {node_path: "RenamedSprite", script_path: "res://test_sprite.gd"}
godot_detach_script {node_path: "RenamedSprite"}
```

## 5. File-based Scene Editing (no editor)
```
godot_list_directory {project_path: "/path/to/project", directory: "res://"}
godot_list_resources {project_path: "/path/to/project", extensions: [".tscn"]}
godot_parse_scene {scene_path: "/path/to/project/scenes/main.tscn"}
godot_create_scene {project_path: "/path/to/project", scene_path: "res://test_scene.tscn", root_node_type: "Node2D", root_node_name: "TestRoot"}
godot_add_node_to_file {scene_path: "...", node_type: "Label", node_name: "Label1", parent_path: "."}
godot_set_property_in_file {scene_path: "...", node_path: "Label1", property: "text", value: "Hello"}
```

## 6. File Management
```
godot_create_folder {project_path: "/path/to/project", folder_path: "res://test_folder"}
godot_rename_file {project_path: "...", old_path: "res://test_folder", new_path: "res://renamed_folder"}
godot_delete_file {project_path: "...", file_path: "res://renamed_folder"}
```

## 7. Script Validation
```
godot_validate_script {script_path: "/path/to/project/script.gd", project_path: "/path/to/project"}
```
- Also test with a script containing a syntax error — should return error info

## 8. Run / Debug
```
godot_run_project {project_path: "/path/to/project"}
godot_is_running {project_path: "/path/to/project"}
godot_get_debug_output {project_path: "/path/to/project"}
godot_take_screenshot
godot_take_game_screenshot
godot_stop_project {project_path: "/path/to/project"}
```

## 9. Signals (select a node that has signals, e.g. Button)
```
godot_list_signals {node_path: "Button"}
godot_connect_signal {source_node: "Button", signal_name: "pressed", target_node: ".", method_name: "_on_button_pressed"}
godot_list_connections {node_path: "Button"}
godot_disconnect_signal {source_node: "Button", signal_name: "pressed", target_node: ".", method_name: "_on_button_pressed"}
```

## 10. Animations (need an AnimationPlayer node in scene)
```
godot_list_animations {node_path: "AnimationPlayer"}
godot_create_animation {node_path: "AnimationPlayer", animation_name: "test_anim", length: 1.0}
godot_get_animation {node_path: "AnimationPlayer", animation_name: "test_anim"}
```

## 11. Debugger (requires a breakpoint hit)
```
godot_set_breakpoint {file: "res://script.gd", line: 10}
godot_list_breakpoints
# Run the project and trigger the breakpoint, then:
godot_get_stack_trace
godot_get_locals
godot_step_over
godot_continue
godot_remove_breakpoint {file: "res://script.gd", line: 10}
```

## 12. Profiler
```
godot_start_profiler   # while game is running
godot_get_profiler_data
godot_stop_profiler
```

## 13. Export
```
godot_list_export_presets {project_path: "/path/to/project"}
# If presets configured:
godot_export_project {project_path: "...", preset_name: "Windows Desktop", output_path: "/tmp/export/game.exe"}
```

## 14. Test Framework
```
godot_detect_test_framework {project_path: "/path/to/project"}
godot_list_tests {project_path: "/path/to/project"}
godot_run_tests {project_path: "/path/to/project"}
```

## 15. UIDs (Godot 4.4+)
```
godot_get_uid {file_path: "/path/to/project/scenes/main.tscn"}
godot_update_uids {project_path: "/path/to/project"}
```

---

## Tips
- Tools marked "requires editor plugin" will fail with a connection error if the plugin isn't loaded — that's expected
- Start with `godot_editor_status` to confirm the plugin bridge is working before testing editor-dependent tools
- The file-based tools (sections 5–6) work without the editor and are good for smoke testing the basics

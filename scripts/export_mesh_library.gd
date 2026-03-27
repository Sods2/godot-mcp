#!/usr/bin/env -S godot --headless --script
## MCP export mesh library runner
## Usage: godot --headless --path <project> -s <path_to_this_file> [-- --scene=res://... --output=res://...]
extends SceneTree

func _init() -> void:
	var scene_path := ""
	var output_path := ""

	var args := OS.get_cmdline_user_args()
	for arg in args:
		if arg.begins_with("--scene="):
			scene_path = arg.substr("--scene=".length())
		elif arg.begins_with("--output="):
			output_path = arg.substr("--output=".length())

	if scene_path.is_empty() or output_path.is_empty():
		print(JSON.stringify({"success": false, "error": "Required: --scene=res://... --output=res://..."}))
		quit(1)
		return

	if not ResourceLoader.exists(scene_path):
		print(JSON.stringify({"success": false, "error": "Scene not found: " + scene_path}))
		quit(1)
		return

	var packed_scene: PackedScene = ResourceLoader.load(scene_path)
	if not packed_scene:
		print(JSON.stringify({"success": false, "error": "Could not load scene: " + scene_path}))
		quit(1)
		return

	var instance = packed_scene.instantiate()
	var lib = MeshLibrary.new()
	var idx := 0

	for child in instance.get_children():
		if child is MeshInstance3D:
			lib.create_item(idx)
			lib.set_item_name(idx, child.name)
			lib.set_item_mesh(idx, child.mesh)
			if child.get_child_count() > 0:
				for sub in child.get_children():
					if sub is CollisionShape3D:
						lib.set_item_shapes(idx, [{"shape": sub.shape, "local_transform": sub.transform}])
						break
			idx += 1

	instance.queue_free()

	var err = ResourceSaver.save(lib, output_path)
	if err != OK:
		print(JSON.stringify({"success": false, "error": "ResourceSaver failed with error: " + str(err)}))
		quit(1)
		return

	print(JSON.stringify({"success": true, "items": idx, "output": output_path}))
	quit(0)

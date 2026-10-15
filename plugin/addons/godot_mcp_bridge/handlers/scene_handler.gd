@tool
class_name SceneHandler
extends RefCounted

const _Coerce = preload("res://addons/godot_mcp_bridge/handlers/value_coerce.gd")

func get_tree(editor_interface: EditorInterface, params: Dictionary) -> Dictionary:
	var root := editor_interface.get_edited_scene_root()
	if root == null:
		return {"error": "No scene open"}
	var max_depth: int = params.get("max_depth", 10)
	var type_filter: String = params.get("type_filter", "")
	return {
		"scene_path": root.scene_file_path,
		"root": _describe_node(root, 0, max_depth, type_filter, root)
	}

func _describe_node(node: Node, depth: int, max_depth: int, type_filter: String = "", scene_root: Node = null) -> Dictionary:
	var node_path: String
	if scene_root == null or node == scene_root:
		node_path = "."
	else:
		node_path = str(scene_root.get_path_to(node))
	var result := {
		"name": node.name,
		"type": node.get_class(),
		"path": node_path,
		"children": []
	}
	if depth < max_depth:
		for child in node.get_children():
			var child_result := _describe_node(child, depth + 1, max_depth, type_filter, scene_root)
			if type_filter == "" or child.is_class(type_filter) or child_result["children"].size() > 0:
				result["children"].append(child_result)
	return result

func get_selected(editor_interface: EditorInterface) -> Dictionary:
	var root := editor_interface.get_edited_scene_root()
	var selection := editor_interface.get_selection()
	var selected := selection.get_selected_nodes()
	var nodes: Array[Dictionary] = []
	for node in selected:
		var node_path: String
		if root != null and node != root:
			node_path = str(root.get_path_to(node))
		else:
			node_path = "."
		nodes.append({
			"name": node.name,
			"type": node.get_class(),
			"path": node_path
		})
	return {"selected": nodes}

func add_node(editor_interface: EditorInterface, params: Dictionary) -> Dictionary:
	var root := editor_interface.get_edited_scene_root()
	if root == null:
		return {"error": "No scene open"}

	var node_type: String = params.get("type", "Node")
	var node_name: String = params.get("name", node_type)
	var parent_path: String = params.get("parent", ".")

	var parent: Node
	if parent_path == "." or parent_path == "":
		parent = root
	else:
		parent = root.get_node_or_null(parent_path)

	if parent == null:
		return {"error": "Parent node not found: " + parent_path}

	var new_node: Node
	if ClassDB.class_exists(node_type):
		new_node = ClassDB.instantiate(node_type)
	else:
		return {"error": "Unknown node type: " + node_type}

	new_node.name = node_name

	# Apply any initial properties. Values arrive as JSON, so coerce each to the
	# property's real Variant type (Vector2, Color, …) before assigning. The node
	# is not in the tree yet, so a direct set is fine and needs no undo entry.
	var applied_properties: Array = []
	var properties = params.get("properties", null)
	if properties is Dictionary:
		for key in properties:
			var target_type := typeof(new_node.get(key))
			for prop in new_node.get_property_list():
				if prop["name"] == key:
					target_type = int(prop["type"])
					break
			new_node.set(key, _Coerce.coerce(properties[key], target_type))
			applied_properties.append(key)

	var undo_redo := editor_interface.get_editor_undo_redo()
	undo_redo.create_action("Add Node: " + node_name)
	undo_redo.add_do_method(parent, "add_child", new_node)
	undo_redo.add_do_method(new_node, "set_owner", root)
	undo_redo.add_undo_method(parent, "remove_child", new_node)
	undo_redo.commit_action()

	var rel_path: String = str(root.get_path_to(new_node))
	return {"success": true, "path": rel_path, "properties_applied": applied_properties}

func remove_node(editor_interface: EditorInterface, params: Dictionary) -> Dictionary:
	var root := editor_interface.get_edited_scene_root()
	if root == null:
		return {"error": "No scene open"}

	var node_path: String = params.get("path", "")
	var node := root.get_node_or_null(node_path)
	if node == null:
		return {"error": "Node not found: " + node_path}

	var parent := node.get_parent()
	var undo_redo := editor_interface.get_editor_undo_redo()
	undo_redo.create_action("Remove Node: " + node.name)
	undo_redo.add_do_method(parent, "remove_child", node)
	undo_redo.add_undo_method(parent, "add_child", node)
	undo_redo.add_undo_method(node, "set_owner", root)
	undo_redo.commit_action()

	return {"success": true}

func reparent_node(editor_interface: EditorInterface, params: Dictionary) -> Dictionary:
	var root := editor_interface.get_edited_scene_root()
	if root == null:
		return {"error": "No scene open"}

	var node_path: String = params.get("path", "")
	var new_parent_path: String = params.get("new_parent", ".")

	var node := root.get_node_or_null(node_path)
	if node == null:
		return {"error": "Node not found: " + node_path}

	var new_parent: Node
	if new_parent_path == "." or new_parent_path == "":
		new_parent = root
	else:
		new_parent = root.get_node_or_null(new_parent_path)

	if new_parent == null:
		return {"error": "New parent not found: " + new_parent_path}

	node.reparent(new_parent)
	var rel_path: String = str(root.get_path_to(node))
	return {"success": true, "new_path": rel_path}

func open_scene(editor_interface: EditorInterface, params: Dictionary) -> Dictionary:
	var scene_path: String = params.get("path", "")
	if scene_path == "":
		return {"error": "path is required"}
	if not FileAccess.file_exists(scene_path):
		return {"error": "Scene file not found: " + scene_path}
	editor_interface.open_scene_from_path(scene_path)
	var open_scenes := editor_interface.get_open_scenes()
	if scene_path not in open_scenes:
		return {"error": "Failed to open scene: " + scene_path}
	return {"success": true, "open_scenes": Array(open_scenes)}

func save_scene(editor_interface: EditorInterface) -> Dictionary:
	editor_interface.save_scene()
	return {"success": true}

func rename_node(editor_interface: EditorInterface, params: Dictionary) -> Dictionary:
	var root := editor_interface.get_edited_scene_root()
	if root == null:
		return {"error": "No scene open"}

	var node := root.get_node_or_null(params.get("path", ""))
	if node == null:
		return {"error": "Node not found: " + params.get("path", "")}

	var old_name: String = node.name
	var new_name: String = params.get("new_name", "")
	if new_name == "":
		return {"error": "new_name is required"}

	var undo_redo := editor_interface.get_editor_undo_redo()
	undo_redo.create_action("Rename Node")
	undo_redo.add_do_property(node, "name", new_name)
	undo_redo.add_undo_property(node, "name", old_name)
	undo_redo.commit_action()

	var rel_path: String = str(root.get_path_to(node))
	return {"success": true, "old_name": old_name, "new_name": new_name, "new_path": rel_path}

func duplicate_node(editor_interface: EditorInterface, params: Dictionary) -> Dictionary:
	var root := editor_interface.get_edited_scene_root()
	if root == null:
		return {"error": "No scene open"}

	var node := root.get_node_or_null(params.get("path", ""))
	if node == null:
		return {"error": "Node not found: " + params.get("path", "")}

	var parent := node.get_parent()
	if parent == null:
		return {"error": "Cannot duplicate root node"}

	var dup := node.duplicate()
	if params.has("new_name"):
		dup.name = params.get("new_name")

	var undo_redo := editor_interface.get_editor_undo_redo()
	undo_redo.create_action("Duplicate Node")
	undo_redo.add_do_method(parent, "add_child", dup)
	undo_redo.add_do_method(dup, "set_owner", root)
	undo_redo.add_undo_method(parent, "remove_child", dup)
	undo_redo.commit_action()

	var rel_path: String = str(root.get_path_to(dup))
	return {"success": true, "path": rel_path}

func move_node(editor_interface: EditorInterface, params: Dictionary) -> Dictionary:
	var root := editor_interface.get_edited_scene_root()
	if root == null:
		return {"error": "No scene open"}

	var node := root.get_node_or_null(params.get("path", ""))
	if node == null:
		return {"error": "Node not found: " + params.get("path", "")}

	var parent := node.get_parent()
	if parent == null:
		return {"error": "Cannot move root node"}

	var old_index: int = node.get_index()
	var new_index: int = params.get("index", 0)

	var undo_redo := editor_interface.get_editor_undo_redo()
	undo_redo.create_action("Move Node")
	undo_redo.add_do_method(parent, "move_child", node, new_index)
	undo_redo.add_undo_method(parent, "move_child", node, old_index)
	undo_redo.commit_action()

	return {"success": true, "new_index": new_index}

## Instance a PackedScene as a child of a node in the edited scene.
## Only the instance root is owned by the edited scene so save writes
## `instance=ExtResource(...)` instead of inlining the packed children.
func instance_scene(editor_interface: EditorInterface, params: Dictionary) -> Dictionary:
	var root: Node = editor_interface.get_edited_scene_root()
	if root == null:
		return {"error": "No scene open"}

	var scene_path: String = str(params.get("scene_path", params.get("path", "")))
	if scene_path == "":
		return {"error": "scene_path is required"}

	var parent_path: String = str(params.get("parent_path", params.get("parent", ".")))
	var node_name: String = str(params.get("node_name", params.get("name", "")))

	var parent: Node
	if parent_path == "." or parent_path == "":
		parent = root
	else:
		parent = root.get_node_or_null(parent_path)
	if parent == null:
		return {"error": "Parent node not found: " + parent_path}

	if not ResourceLoader.exists(scene_path) and not FileAccess.file_exists(scene_path):
		return {"error": "Scene file not found: " + scene_path}

	# Refuse self / circular instancing (a scene that would contain itself).
	var target_path: String = root.scene_file_path
	if target_path != "":
		var src_norm: String = _normalize_res_path(scene_path)
		var dst_norm: String = _normalize_res_path(target_path)
		if src_norm == dst_norm:
			return {"error": "Cannot instance a scene into itself: " + scene_path}
		var chain: Array = _find_dependency_chain(src_norm, dst_norm, {})
		if not chain.is_empty():
			return {"error": "Circular instance refused: %s already contains %s (via %s)" % [scene_path, target_path, " -> ".join(chain)]}

	var loaded: Resource = ResourceLoader.load(scene_path)
	if loaded == null or not (loaded is PackedScene):
		return {"error": "Failed to load PackedScene: " + scene_path}
	var packed: PackedScene = loaded as PackedScene

	# GEN_EDIT_STATE_INSTANCE matches Scene → Instantiate Child Scene in the editor.
	var instance: Node = packed.instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE)
	if instance == null:
		return {"error": "Failed to instantiate: " + scene_path}

	if node_name != "":
		instance.name = StringName(node_name)

	var undo_redo: EditorUndoRedoManager = editor_interface.get_editor_undo_redo()
	undo_redo.create_action("Instance Scene: " + str(instance.name))
	undo_redo.add_do_method(parent, "add_child", instance)
	undo_redo.add_do_method(instance, "set_owner", root)
	undo_redo.add_undo_method(parent, "remove_child", instance)
	undo_redo.commit_action()

	# Ensure it stays a non-editable instance (children not inlined on save).
	if editor_interface.has_method("set_editable_instance"):
		editor_interface.set_editable_instance(instance, false)

	var rel_path: String = str(root.get_path_to(instance))
	return {
		"success": true,
		"path": rel_path,
		"name": str(instance.name),
		"scene_path": scene_path,
		"scene_file_path": instance.scene_file_path,
	}



func _normalize_res_path(p: String) -> String:
	if p.begins_with("uid://"):
		var id: int = ResourceUID.text_to_id(p)
		if id != ResourceUID.INVALID_ID and ResourceUID.has_id(id):
			return ResourceUID.get_id_path(id)
	if not p.begins_with("res://"):
		p = ProjectSettings.localize_path(p)
	return p.simplify_path()

## Depth-first search of scene dependencies. Returns the path chain from
## `from_path` to `target` if `from_path` (transitively) depends on it.
func _find_dependency_chain(from_path: String, target: String, visited: Dictionary) -> Array:
	if visited.has(from_path):
		return []
	visited[from_path] = true
	for dep in ResourceLoader.get_dependencies(from_path):
		var dep_path: String = str(dep)
		if dep_path.contains("::"):
			var parts: PackedStringArray = dep_path.split("::")
			dep_path = parts[parts.size() - 1]
			if dep_path == "":
				dep_path = parts[0]
		dep_path = _normalize_res_path(dep_path)
		if not (dep_path.ends_with(".tscn") or dep_path.ends_with(".scn")):
			continue
		if dep_path == target:
			return [from_path, dep_path]
		var sub: Array = _find_dependency_chain(dep_path, target, visited)
		if not sub.is_empty():
			return [from_path] + sub
	return []

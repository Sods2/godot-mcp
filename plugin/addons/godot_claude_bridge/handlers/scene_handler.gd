@tool
class_name SceneHandler
extends RefCounted

func get_tree(editor_interface: EditorInterface, params: Dictionary) -> Dictionary:
	var root := editor_interface.get_edited_scene_root()
	if root == null:
		return {"error": "No scene open"}
	var max_depth: int = params.get("max_depth", 10)
	return {
		"scene_path": root.scene_file_path,
		"root": _describe_node(root, 0, max_depth)
	}

func _describe_node(node: Node, depth: int, max_depth: int) -> Dictionary:
	var result := {
		"name": node.name,
		"type": node.get_class(),
		"path": str(node.get_path()),
		"children": []
	}
	if depth < max_depth:
		for child in node.get_children():
			result["children"].append(_describe_node(child, depth + 1, max_depth))
	return result

func get_selected(editor_interface: EditorInterface) -> Dictionary:
	var selection := editor_interface.get_selection()
	var selected := selection.get_selected_nodes()
	var nodes: Array[Dictionary] = []
	for node in selected:
		nodes.append({
			"name": node.name,
			"type": node.get_class(),
			"path": str(node.get_path())
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

	var undo_redo := editor_interface.get_editor_undo_redo()
	undo_redo.create_action("Add Node: " + node_name)
	undo_redo.add_do_method(parent, "add_child", new_node)
	undo_redo.add_do_method(new_node, "set_owner", root)
	undo_redo.add_undo_method(parent, "remove_child", new_node)
	undo_redo.commit_action()

	return {"success": true, "path": str(new_node.get_path())}

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
	return {"success": true, "new_path": str(node.get_path())}

func open_scene(editor_interface: EditorInterface, params: Dictionary) -> Dictionary:
	var scene_path: String = params.get("path", "")
	editor_interface.open_scene_from_path(scene_path)
	return {"success": true}

func save_scene(editor_interface: EditorInterface) -> Dictionary:
	editor_interface.save_scene()
	return {"success": true}

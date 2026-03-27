@tool
class_name InspectorHandler
extends RefCounted

func get_properties(editor_interface: EditorInterface, params: Dictionary) -> Dictionary:
	var root := editor_interface.get_edited_scene_root()
	if root == null:
		return {"error": "No scene open"}

	var node_path: String = params.get("path", ".")
	var node: Node
	if node_path == "." or node_path == "":
		node = root
	else:
		node = root.get_node_or_null(node_path)

	if node == null:
		return {"error": "Node not found: " + node_path}

	var props: Array[Dictionary] = []
	for prop in node.get_property_list():
		if prop["usage"] & PROPERTY_USAGE_EDITOR:
			var value = node.get(prop["name"])
			props.append({
				"name": prop["name"],
				"type": type_string(prop["type"]),
				"value": str(value)
			})

	return {"node": node_path, "properties": props}

func set_property(editor_interface: EditorInterface, params: Dictionary) -> Dictionary:
	var root := editor_interface.get_edited_scene_root()
	if root == null:
		return {"error": "No scene open"}

	var node_path: String = params.get("path", ".")
	var prop_name: String = params.get("property", "")
	var prop_value = params.get("value", null)

	var node: Node
	if node_path == "." or node_path == "":
		node = root
	else:
		node = root.get_node_or_null(node_path)

	if node == null:
		return {"error": "Node not found: " + node_path}

	var old_value = node.get(prop_name)

	var undo_redo := editor_interface.get_editor_undo_redo()
	undo_redo.create_action("Set Property: " + prop_name)
	undo_redo.add_do_property(node, prop_name, prop_value)
	undo_redo.add_undo_property(node, prop_name, old_value)
	undo_redo.commit_action()

	return {"success": true, "property": prop_name, "value": str(prop_value)}

func import_asset(editor_interface: EditorInterface, params: Dictionary) -> Dictionary:
	var paths: Array = params.get("paths", [])
	var packed := PackedStringArray(paths)
	editor_interface.get_resource_filesystem().reimport_files(packed)
	return {"success": true, "paths": paths}

func read_resource(editor_interface: EditorInterface, params: Dictionary) -> Dictionary:
	var res_path: String = params.get("path", "")
	var res = ResourceLoader.load(res_path)
	if res == null:
		return {"error": "Resource not found: " + res_path}
	var properties := []
	for prop in res.get_property_list():
		var pname: String = prop["name"]
		if pname.begins_with("_") or pname == "script" or pname == "resource_path" or pname == "resource_name":
			continue
		var usage: int = prop.get("usage", 0)
		if usage & PROPERTY_USAGE_EDITOR == 0 and usage & PROPERTY_USAGE_STORAGE == 0:
			continue
		var val = res.get(pname)
		if val is Object or val is Array or val is Dictionary:
			val = str(val)
		properties.append({"name": pname, "value": val})
	return {"type": res.get_class(), "path": res_path, "properties": properties}

func write_resource(editor_interface: EditorInterface, params: Dictionary) -> Dictionary:
	var res_path: String = params.get("path", "")
	var properties: Dictionary = params.get("properties", {})
	var res = ResourceLoader.load(res_path)
	if res == null:
		return {"error": "Resource not found: " + res_path}
	for key in properties:
		res.set(key, properties[key])
	var err := ResourceSaver.save(res, res_path)
	if err != OK:
		return {"error": "Failed to save resource: " + str(err)}
	return {"success": true}

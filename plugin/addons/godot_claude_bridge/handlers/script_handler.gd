@tool
class_name ScriptHandler
extends RefCounted

func get_current(editor_interface: EditorInterface) -> Dictionary:
	var script_editor := editor_interface.get_script_editor()
	if script_editor == null:
		return {"error": "Script editor not available"}

	var current_script := script_editor.get_current_script()
	if current_script == null:
		return {"script": null}

	var result := {
		"path": current_script.resource_path,
		"source": current_script.source_code,
		"cursor_line": 0,
		"cursor_column": 0
	}

	var base_editor := script_editor.get_current_editor()
	if base_editor:
		var code_edit := _find_code_edit(base_editor)
		if code_edit:
			result["cursor_line"] = code_edit.get_caret_line() + 1
			result["cursor_column"] = code_edit.get_caret_column() + 1

	return result

func get_open(editor_interface: EditorInterface) -> Dictionary:
	var script_editor := editor_interface.get_script_editor()
	if script_editor == null:
		return {"scripts": []}

	var scripts: Array[String] = []
	for script in script_editor.get_open_scripts():
		scripts.append(script.resource_path)

	return {"scripts": scripts}

func get_selected_code(editor_interface: EditorInterface) -> Dictionary:
	var script_editor := editor_interface.get_script_editor()
	if script_editor == null:
		return {"text": ""}

	var base_editor := script_editor.get_current_editor()
	if not base_editor:
		return {"text": ""}

	var code_edit := _find_code_edit(base_editor)
	if code_edit and code_edit.has_selection():
		return {"text": code_edit.get_selected_text()}

	return {"text": ""}

func insert_at_cursor(editor_interface: EditorInterface, params: Dictionary) -> Dictionary:
	var text: String = params.get("text", "")
	var script_editor := editor_interface.get_script_editor()
	if script_editor == null:
		return {"error": "Script editor not available"}

	var base_editor := script_editor.get_current_editor()
	if not base_editor:
		return {"error": "No editor open"}

	var code_edit := _find_code_edit(base_editor)
	if code_edit:
		code_edit.insert_text_at_caret(text)
		return {"success": true}

	return {"error": "Could not find code editor"}

# Recursively find CodeEdit widget (Godot doesn't expose it directly)
func _find_code_edit(node: Node) -> CodeEdit:
	if node is CodeEdit:
		return node as CodeEdit
	for child in node.get_children():
		var found := _find_code_edit(child)
		if found:
			return found
	return null

@tool
class_name RunHandler
extends RefCounted

var _output_lines: Array[String] = []

func play(editor_interface: EditorInterface, params: Dictionary) -> Dictionary:
	var scene_path: String = params.get("scene", "")
	_output_lines.clear()
	if scene_path != "":
		editor_interface.play_scene(scene_path)
	else:
		editor_interface.play_current_scene()
	return {"success": true}

func stop(editor_interface: EditorInterface) -> Dictionary:
	editor_interface.stop_playing_scene()
	return {"success": true, "output": _output_lines}

func is_running(editor_interface: EditorInterface) -> Dictionary:
	return {"running": editor_interface.is_playing_scene()}

func get_output() -> Dictionary:
	return {"output": _output_lines}

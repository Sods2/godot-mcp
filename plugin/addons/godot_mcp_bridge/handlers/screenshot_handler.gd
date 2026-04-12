@tool
class_name ScreenshotHandler
extends RefCounted

func capture_viewport(editor_interface: EditorInterface) -> Dictionary:
	# Capture the editor's rendered viewport using its texture
	var base_control := editor_interface.get_base_control()
	if base_control == null:
		return {"error": "Could not get editor base control"}
	var viewport := base_control.get_viewport()
	if viewport == null:
		return {"error": "Could not get editor viewport"}
	var texture := viewport.get_texture()
	if texture == null:
		return {"error": "Viewport texture not ready — try again after a frame"}
	var image := texture.get_image()
	if image == null or image.is_empty():
		return {"error": "Could not capture viewport texture — rendering may not be ready"}
	var png_buffer := image.save_png_to_buffer()
	var base64_str := Marshalls.raw_to_base64(png_buffer)
	return {
		"success": true,
		"format": "png",
		"data": base64_str,
		"width": image.get_width(),
		"height": image.get_height()
	}


func capture_game(editor_interface: EditorInterface) -> Dictionary:
	if not editor_interface.is_playing_scene():
		return {"error": "No game is currently running — start a scene first with godot_run_scene"}

	# Try to find the embedded game SubViewport
	var main_screen := editor_interface.get_editor_main_screen()
	if main_screen != null:
		var game_vp := _find_subviewport(main_screen)
		if game_vp != null:
			var texture := game_vp.get_texture()
			if texture != null:
				var image := texture.get_image()
				if image != null and not image.is_empty():
					var png_bytes := image.save_png_to_buffer()
					return {
						"success": true,
						"format": "png",
						"data": Marshalls.raw_to_base64(png_bytes),
						"width": image.get_width(),
						"height": image.get_height()
					}

	return {"error": "Game screenshot unavailable — the game is running in a separate window. Enable 'Display > Window > Embed Subwindows' in Project Settings to run the game inside the editor."}


func _find_subviewport(node: Node) -> SubViewport:
	for child in node.get_children():
		if child is SubViewport:
			return child as SubViewport
		var result := _find_subviewport(child)
		if result != null:
			return result
	return null

@tool
class_name ScreenshotHandler
extends RefCounted

func capture_viewport(editor_interface: EditorInterface) -> Dictionary:
	# Get the editor's main viewport
	var viewport := editor_interface.get_editor_main_screen()
	if viewport == null:
		return {"error": "No viewport available"}

	# We can capture the main window's viewport
	var image := DisplayServer.screen_get_image(0)
	if image == null:
		# Fallback: try to get from the current viewport
		var main_viewport := editor_interface.get_base_control().get_viewport()
		if main_viewport:
			image = main_viewport.get_texture().get_image()

	if image == null:
		return {"error": "Could not capture screenshot"}

	var png_buffer := image.save_png_to_buffer()
	var base64_str := Marshalls.raw_to_base64(png_buffer)

	return {
		"success": true,
		"format": "png",
		"data": base64_str,
		"width": image.get_width(),
		"height": image.get_height()
	}

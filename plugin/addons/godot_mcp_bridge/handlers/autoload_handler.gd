@tool
class_name AutoloadHandler
extends RefCounted

# Autoload editing through the editor, so its in-memory ProjectSettings and
# project.godot agree. Writing project.godot behind the editor's back gets
# reverted by the next ProjectSettings.save() (Input Map edits, settings GUI).

static func _key(name: String) -> String:
	return "autoload/" + name

static func _save() -> String:
	var err := ProjectSettings.save()
	if err != OK:
		return "ProjectSettings.save() failed: " + error_string(err)
	return ""

func add_autoload(plugin, params: Dictionary) -> Dictionary:
	var name: String = str(params.get("name", ""))
	var script_path: String = str(params.get("script_path", ""))
	var overwrite: bool = bool(params.get("overwrite", false))
	if name.is_empty() or not name.is_valid_identifier():
		return {"error": "Invalid autoload name: '%s'" % name}
	if not script_path.begins_with("res://") or not FileAccess.file_exists(script_path):
		return {"error": "Script not found: " + script_path}
	var key := _key(name)
	var existed := ProjectSettings.has_setting(key)
	if existed and not overwrite:
		return {"error": "Autoload '%s' already exists (%s); pass overwrite=true to replace it" % [name, str(ProjectSettings.get_setting(key))]}
	if existed and plugin != null and plugin.has_method("remove_autoload_singleton"):
		plugin.remove_autoload_singleton(name)
	if plugin != null and plugin.has_method("add_autoload_singleton"):
		plugin.add_autoload_singleton(name, script_path)
	else:
		ProjectSettings.set_setting(key, "*" + script_path)
	var save_err := _save()
	if save_err != "":
		return {"error": save_err}
	return {"success": true, "name": name, "path": script_path, "replaced": existed}

func remove_autoload(plugin, params: Dictionary) -> Dictionary:
	var name: String = str(params.get("name", ""))
	var key := _key(name)
	if not ProjectSettings.has_setting(key):
		return {"error": "Autoload '%s' not found" % name}
	if plugin != null and plugin.has_method("remove_autoload_singleton"):
		plugin.remove_autoload_singleton(name)
	if ProjectSettings.has_setting(key):
		ProjectSettings.set_setting(key, null)
	var save_err := _save()
	if save_err != "":
		return {"error": save_err}
	return {"success": true, "name": name}

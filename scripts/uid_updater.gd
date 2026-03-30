extends SceneTree

var processed := 0
var errors := 0
var error_files: Array[String] = []

var RESOURCE_EXTENSIONS := [
	"tscn", "tres", "gd", "gdshader", "material", "mesh", "theme", "font"
]

func _init() -> void:
	scan_directory("res://")
	var result := {
		"processed": processed,
		"errors": errors,
		"error_files": error_files,
	}
	print(JSON.stringify(result))
	quit(errors)

func scan_directory(dir_path: String) -> void:
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return

	dir.list_dir_begin()
	var file_name := dir.get_next()
	while file_name != "":
		if file_name.begins_with("."):
			file_name = dir.get_next()
			continue

		var full_path := dir_path.path_join(file_name)

		if dir.current_is_dir():
			if file_name != "addons" and file_name != ".godot":
				scan_directory(full_path)
		else:
			var ext := file_name.get_extension()
			if ext in RESOURCE_EXTENSIONS:
				resave_resource(full_path)

		file_name = dir.get_next()
	dir.list_dir_end()

func resave_resource(res_path: String) -> void:
	if not ResourceLoader.exists(res_path):
		return
	var resource := ResourceLoader.load(res_path, "", ResourceLoader.CACHE_MODE_IGNORE)
	if resource == null:
		errors += 1
		var missing_deps: Array[String] = []
		for dep in ResourceLoader.get_dependencies(res_path):
			var dep_path: String = dep.get_slice("::", 0)
			if dep_path != "" and not ResourceLoader.exists(dep_path):
				missing_deps.append(dep_path)
		var detail: String = res_path
		if not missing_deps.is_empty():
			detail += " (missing deps: " + ", ".join(missing_deps) + ")"
		error_files.append(detail)
		return
	var err := ResourceSaver.save(resource, res_path)
	if err != OK:
		errors += 1
		error_files.append(res_path + " (save error: " + error_string(err) + ")")
	else:
		processed += 1

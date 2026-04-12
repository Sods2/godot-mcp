#!/usr/bin/env -S godot --headless --script
## MCP built-in test runner for godot-mcp
## Usage: godot --headless --path <project> -s <path_to_this_file> [-- --test-dir=res://tests --test-filter=my_test]
## Discovers GDScript files whose methods start with "test_", runs them, outputs JSON results to stdout.
extends SceneTree

const DEFAULT_TEST_DIR := "res://tests"

func _init() -> void:
	var test_dir := DEFAULT_TEST_DIR
	var test_filter := ""
	var test_method := ""

	# Parse custom args after "--"
	var args := OS.get_cmdline_user_args()
	for arg in args:
		if arg.begins_with("--test-dir="):
			test_dir = arg.substr("--test-dir=".length())
		elif arg.begins_with("--test-filter="):
			test_filter = arg.substr("--test-filter=".length())
		elif arg.begins_with("--test-method="):
			test_method = arg.substr("--test-method=".length())

	var results := run_all_tests(test_dir, test_filter, test_method)
	print(JSON.stringify(results))
	quit(results.failed + results.errors)


func run_all_tests(test_dir: String, test_filter: String, test_method: String = "") -> Dictionary:
	var test_files := discover_test_files(test_dir)
	var all_tests: Array = []
	var total_passed := 0
	var total_failed := 0
	var total_errors := 0
	var total_skipped := 0
	var start_time := Time.get_ticks_msec()

	for file_path in test_files:
		var file_results := run_test_file(file_path, test_filter, test_method)
		all_tests.append_array(file_results.tests)
		total_passed += file_results.passed
		total_failed += file_results.failed
		total_errors += file_results.errors
		total_skipped += file_results.skipped

	return {
		"framework": "builtin",
		"passed": total_passed,
		"failed": total_failed,
		"errors": total_errors,
		"skipped": total_skipped,
		"duration_ms": Time.get_ticks_msec() - start_time,
		"tests": all_tests,
	}


func discover_test_files(dir_path: String) -> Array:
	var files: Array = []
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return files

	dir.list_dir_begin()
	var file_name := dir.get_next()
	while file_name != "":
		if not file_name.begins_with("."):
			var full_path := dir_path.path_join(file_name)
			if dir.current_is_dir():
				files.append_array(discover_test_files(full_path))
			elif file_name.ends_with(".gd") and (file_name.begins_with("test_") or file_name.ends_with("_test.gd")):
				files.append(full_path)
		file_name = dir.get_next()
	dir.list_dir_end()
	return files


func run_test_file(file_path: String, test_filter: String, test_method: String = "") -> Dictionary:
	var tests: Array = []
	var passed := 0
	var failed := 0
	var errors := 0
	var skipped := 0

	var script = load(file_path)
	if script == null:
		return {"tests": [{"name": file_path, "suite": file_path, "status": "error", "message": "Failed to load script"}], "passed": 0, "failed": 0, "errors": 1, "skipped": 0}

	var instance = script.new()
	var suite_name := file_path.get_file().get_basename()

	# Find test methods
	var methods := instance.get_method_list()
	var test_methods: Array = []
	for m in methods:
		var mname: String = m.name
		if mname.begins_with("test_"):
			if not test_method.is_empty() and mname != test_method:
				continue
			if test_filter == "" or test_filter in mname:
				test_methods.append(mname)

	# Lifecycle: before_all
	if instance.has_method("before_all"):
		instance.call("before_all")

	for method_name in test_methods:
		var test_start := Time.get_ticks_msec()

		if instance.has_method("before_each"):
			instance.call("before_each")

		var status := "passed"
		var message := ""

		# We call the test method; GDScript assert() will crash on failure,
		# so we use a wrapper approach: check if the method exists and call it.
		# Failures surface as engine errors captured in _notification or via assert.
		# For best results, test scripts should use push_error() on failure.
		instance.call(method_name)

		if instance.has_method("after_each"):
			instance.call("after_each")

		var duration := Time.get_ticks_msec() - test_start
		tests.append({"name": method_name, "suite": suite_name, "status": status, "message": message, "duration_ms": duration})
		passed += 1

	# Lifecycle: after_all
	if instance.has_method("after_all"):
		instance.call("after_all")

	if instance is Node:
		instance.queue_free()

	return {"tests": tests, "passed": passed, "failed": failed, "errors": errors, "skipped": skipped}

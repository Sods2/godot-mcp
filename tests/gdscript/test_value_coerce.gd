#!/usr/bin/env -S godot --headless --script
## Headless unit test for the MCP bridge value-coercion helper.
##
## Exercises every branch of value_coerce.gd (the JSON -> Variant conversion the
## bridge relies on) and exits non-zero if any check fails, so it can gate CI.
##
## Run against any project that has the godot_mcp_bridge addon installed, e.g.:
##   godot --headless --path <project> --script res://tests/gdscript/test_value_coerce.gd
## This file is copied into such a project (next to the addon) before running.
extends SceneTree

const Coerce = preload("res://addons/godot_mcp_bridge/handlers/value_coerce.gd")

var _checks := 0
var _failures: Array[String] = []


func _init() -> void:
	_run()
	print("value_coerce: %d checks, %d failures" % [_checks, _failures.size()])
	for f in _failures:
		printerr("  FAIL: " + f)
	quit(1 if _failures.size() > 0 else 0)


func _check(actual, expected, label: String) -> void:
	_checks += 1
	if not (Coerce.values_match(actual, expected) or actual == expected):
		_failures.append("%s: got %s (%s), expected %s (%s)" % [
			label, str(actual), type_string(typeof(actual)),
			str(expected), type_string(typeof(expected))
		])


func _run() -> void:
	# Scalars
	_check(Coerce.coerce(5, TYPE_INT), 5, "int")
	_check(Coerce.coerce(2.5, TYPE_FLOAT), 2.5, "float")
	_check(Coerce.coerce(true, TYPE_BOOL), true, "bool")
	_check(Coerce.coerce("hi", TYPE_STRING), "hi", "String")
	_check(Coerce.coerce("sn", TYPE_STRING_NAME), StringName("sn"), "StringName")

	# Vector2 / Vector2i (dict and array forms; rounding for the int variant)
	_check(Coerce.coerce({"x": 1, "y": 2}, TYPE_VECTOR2), Vector2(1, 2), "Vector2 dict")
	_check(Coerce.coerce([3, 4], TYPE_VECTOR2), Vector2(3, 4), "Vector2 array")
	_check(Coerce.coerce({"x": 1.6, "y": 2.4}, TYPE_VECTOR2I), Vector2i(2, 2), "Vector2i round")

	# Vector3 / Vector3i
	_check(Coerce.coerce({"x": 1, "y": 2, "z": 3}, TYPE_VECTOR3), Vector3(1, 2, 3), "Vector3")
	_check(Coerce.coerce([1, 2, 3], TYPE_VECTOR3I), Vector3i(1, 2, 3), "Vector3i")

	# Vector4 / Vector4i
	_check(Coerce.coerce({"x": 1, "y": 2, "z": 3, "w": 4}, TYPE_VECTOR4), Vector4(1, 2, 3, 4), "Vector4")
	_check(Coerce.coerce([1, 2, 3, 4], TYPE_VECTOR4I), Vector4i(1, 2, 3, 4), "Vector4i")

	# Color (dict, rgb array, rgba array, html string)
	_check(Coerce.coerce({"r": 1, "g": 0, "b": 0, "a": 1}, TYPE_COLOR), Color(1, 0, 0, 1), "Color dict")
	_check(Coerce.coerce([0, 0, 1], TYPE_COLOR), Color(0, 0, 1, 1), "Color rgb array")
	_check(Coerce.coerce([0, 0, 1, 0.5], TYPE_COLOR), Color(0, 0, 1, 0.5), "Color rgba array")
	_check(Coerce.coerce("#00ff00", TYPE_COLOR), Color(0, 1, 0, 1), "Color html")

	# Rect2 / Rect2i (position+size, x/y/w/h, and array forms)
	_check(Coerce.coerce({"position": {"x": 1, "y": 2}, "size": {"x": 3, "y": 4}}, TYPE_RECT2), Rect2(1, 2, 3, 4), "Rect2 pos/size")
	_check(Coerce.coerce({"x": 1, "y": 2, "w": 3, "h": 4}, TYPE_RECT2), Rect2(1, 2, 3, 4), "Rect2 xywh")
	_check(Coerce.coerce([1, 2, 3, 4], TYPE_RECT2), Rect2(1, 2, 3, 4), "Rect2 array")
	_check(Coerce.coerce({"position": {"x": 1, "y": 2}, "size": {"x": 3, "y": 4}}, TYPE_RECT2I), Rect2i(1, 2, 3, 4), "Rect2i")

	# Unknown/unsupported type passes the value through unchanged.
	_check(Coerce.coerce("res://x.png", TYPE_OBJECT), "res://x.png", "passthrough Object")

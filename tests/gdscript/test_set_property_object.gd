#!/usr/bin/env -S godot --headless --script
## Verifies Object/NodePath coercion the way inspector.set_property uses it:
## Node-typed exports get a live Node (via NodePath resolve), and script /
## Resource properties load from res:// instead of storing a bare String.
extends SceneTree

const Coerce = preload("res://addons/godot_mcp_bridge/handlers/value_coerce.gd")

var _failures: Array[String] = []


func _fail(msg: String) -> void:
	_failures.append(msg)
	printerr("FAIL: " + msg)


func _init() -> void:
	_run()
	print("set_property_object: %d failures" % _failures.size())
	quit(1 if _failures.size() > 0 else 0)


func _run() -> void:
	# Script with a Node-typed export so get_property_list reports TYPE_OBJECT +
	# PROPERTY_HINT_NODE_TYPE the same way a real scene node would.
	var gds := GDScript.new()
	gds.source_code = "extends Node\n@export var target: Node\n"
	var err := gds.reload()
	if err != OK:
		_fail("failed to reload test script: %s" % err)
		return

	var root := Node.new()
	root.name = "Root"
	var holder := Node.new()
	holder.name = "Holder"
	holder.set_script(gds)
	var other := Node.new()
	other.name = "Other"
	root.add_child(holder)
	root.add_child(other)

	# Mimic inspector_handler: look up type/hint, coerce, resolve, set.
	var prop_name := "target"
	var target_type := TYPE_NIL
	var target_hint := PROPERTY_HINT_NONE
	var target_hint_string := ""
	for prop in holder.get_property_list():
		if prop["name"] == prop_name:
			target_type = int(prop["type"])
			target_hint = int(prop["hint"])
			target_hint_string = str(prop.get("hint_string", ""))
			break

	if target_type != TYPE_OBJECT:
		_fail("expected target export TYPE_OBJECT, got %s" % type_string(target_type))
	if target_hint != PROPERTY_HINT_NODE_TYPE:
		_fail("expected PROPERTY_HINT_NODE_TYPE, got %s" % target_hint)

	var coerced = Coerce.coerce("../Other", target_type, target_hint, target_hint_string)
	if not (coerced is NodePath):
		_fail("coerce should yield NodePath for Node export, got %s" % type_string(typeof(coerced)))
	elif typeof(coerced) == TYPE_STRING:
		_fail("coerce returned String; want NodePath")

	var resolved := Coerce.resolve_for_assignment(coerced, holder, target_type)
	if not resolved["ok"]:
		_fail("resolve failed: %s" % resolved["error"])
	else:
		holder.set(prop_name, resolved["value"])
		var actual = holder.get(prop_name)
		if actual != other:
			_fail("target should be Other node, got %s" % str(actual))
		if typeof(actual) == TYPE_STRING:
			_fail("target stored as String — should be Node")

	# Attaching a Script via res:// path (same path set_property uses for "script")
	var script_path := "res://tests/gdscript/dummy_node_script.gd"
	var script_type := TYPE_OBJECT
	var script_hint := PROPERTY_HINT_RESOURCE_TYPE
	for prop in holder.get_property_list():
		if prop["name"] == "script":
			script_type = int(prop["type"])
			script_hint = int(prop["hint"])
			break
	var script_val = Coerce.coerce(script_path, script_type, script_hint, "Script")
	if not (script_val is Script):
		_fail("script coerce should load Script, got %s" % type_string(typeof(script_val)))
	else:
		holder.set("script", script_val)
		var got_script = holder.get("script")
		if got_script == null:
			_fail("script still null after set")
		elif not (got_script is Script):
			_fail("script is not a Script resource: %s" % type_string(typeof(got_script)))
		elif typeof(got_script) == TYPE_STRING:
			_fail("script stored as String")

	# Clearing Object with null / ""
	var cleared = Coerce.coerce(null, TYPE_OBJECT)
	if cleared != null:
		_fail("null should clear Object")
	cleared = Coerce.coerce("", TYPE_OBJECT)
	if cleared != null:
		_fail("empty string should clear Object")

	root.free()

#!/usr/bin/env -S godot --headless --script
## Mimics scene_handler.add_node property application: script must be applied
## before Node exports are typed, and failed NodePath resolves must not count
## as applied (regardless of dict key order).
extends SceneTree

const Coerce = preload("res://addons/godot_mcp_bridge/handlers/value_coerce.gd")

var _failures: Array[String] = []


func _fail(msg: String) -> void:
	_failures.append(msg)
	printerr("FAIL: " + msg)


func _init() -> void:
	_run()
	print("add_node_script_props: %d failures" % _failures.size())
	quit(1 if _failures.size() > 0 else 0)


func _fill_prop_maps(node: Object, type_map: Dictionary, hint_map: Dictionary) -> void:
	type_map.clear()
	hint_map.clear()
	for prop in node.get_property_list():
		type_map[prop["name"]] = int(prop["type"])
		hint_map[prop["name"]] = {
			"hint": int(prop["hint"]),
			"hint_string": str(prop.get("hint_string", ""))
		}


## Same apply order as scene_handler.add_node (script first, rebuild maps,
## defer NodePath Object props until after the node is in the tree).
func _apply_like_add_node(new_node: Node, properties: Dictionary, scene_root: Node) -> Dictionary:
	var applied_properties: Array = []
	var property_errors: Array = []
	var pending_node_props: Dictionary = {}
	var type_map := {}
	var hint_map := {}
	_fill_prop_maps(new_node, type_map, hint_map)

	var script_keys: Array = []
	if properties.has("script"):
		script_keys.append("script")
	for key in properties:
		if key == "script":
			continue
		var preview_type: int = type_map.get(key, typeof(new_node.get(key)))
		var preview_h: Dictionary = hint_map.get(key, {"hint": PROPERTY_HINT_NONE, "hint_string": ""})
		var preview = Coerce.coerce(properties[key], preview_type, int(preview_h["hint"]), str(preview_h["hint_string"]))
		if preview is Script:
			script_keys.append(key)

	for key in script_keys:
		var target_type: int = type_map.get(key, TYPE_OBJECT)
		var h: Dictionary = hint_map.get(key, {"hint": PROPERTY_HINT_RESOURCE_TYPE, "hint_string": "Script"})
		var coerced = Coerce.coerce(properties[key], target_type, int(h["hint"]), str(h["hint_string"]))
		if key == "script" and not (coerced is Script) and properties[key] is String:
			coerced = Coerce.coerce(properties[key], TYPE_OBJECT, PROPERTY_HINT_RESOURCE_TYPE, "Script")
		new_node.set(key, coerced)
		if Coerce.values_match(new_node.get(key), coerced):
			applied_properties.append(key)
		else:
			property_errors.append("%s: Property did not accept the value" % key)

	if script_keys.size() > 0:
		_fill_prop_maps(new_node, type_map, hint_map)

	for key in properties:
		if key in script_keys:
			continue
		var target_type2: int = type_map.get(key, typeof(new_node.get(key)))
		var h2: Dictionary = hint_map.get(key, {"hint": PROPERTY_HINT_NONE, "hint_string": ""})
		var coerced2 = Coerce.coerce(properties[key], target_type2, int(h2["hint"]), str(h2["hint_string"]))
		if coerced2 is NodePath and target_type2 == TYPE_OBJECT:
			pending_node_props[key] = coerced2
			continue
		if target_type2 == TYPE_OBJECT and int(h2["hint"]) == PROPERTY_HINT_NODE_TYPE and coerced2 is String:
			pending_node_props[key] = NodePath(str(coerced2))
			continue
		new_node.set(key, coerced2)
		if Coerce.values_match(new_node.get(key), coerced2):
			applied_properties.append(key)
		else:
			property_errors.append("%s: Property did not accept the value" % key)

	# Node is already parented by the caller before resolve (mirrors add_child).
	for key in pending_node_props:
		var resolved := Coerce.resolve_for_assignment(pending_node_props[key], new_node, TYPE_OBJECT, scene_root)
		if not resolved["ok"]:
			property_errors.append("%s: %s" % [key, resolved["error"]])
			continue
		var value = resolved["value"]
		new_node.set(key, value)
		if Coerce.values_match(new_node.get(key), value):
			applied_properties.append(key)
		else:
			property_errors.append("%s: Property did not accept the value (still %s)" % [key, str(new_node.get(key))])

	return {"properties_applied": applied_properties, "errors": property_errors}


func _make_player_script() -> GDScript:
	var gds := GDScript.new()
	gds.source_code = "extends Node\n@export var target: Node\n"
	var err := gds.reload()
	if err != OK:
		_fail("failed to reload player script: %s" % err)
	return gds


func _run() -> void:
	var player_script := _make_player_script()
	if player_script == null or player_script.source_code == "":
		return

	# Persist script to disk so coerce can load via res:// like production.
	var script_path := "res://tests/gdscript/dummy_player_with_target.gd"
	# Write through the project filesystem (copied into temp project by runner).
	var abs_write := ProjectSettings.globalize_path(script_path)
	var f := FileAccess.open(abs_write, FileAccess.WRITE)
	if f == null:
		# Fallback: use in-memory Script resource path via ResourceSaver
		var save_err := ResourceSaver.save(player_script, script_path)
		if save_err != OK:
			_fail("could not save fixture script: %s" % save_err)
			return
	else:
		f.store_string("extends Node\n@export var target: Node\n")
		f.close()
		player_script = load(script_path) as GDScript
		if player_script == null:
			_fail("could not reload fixture script from disk")
			return

	# --- Case 1: script then target (dict order) — both should apply ---
	var root := Node.new()
	root.name = "Root"
	var enemy := Node.new()
	enemy.name = "Enemy"
	root.add_child(enemy)
	var holder := Node.new()
	holder.name = "Player"
	root.add_child(holder)

	var props_script_first := {}
	props_script_first["script"] = script_path
	props_script_first["target"] = "../Enemy"
	var r1 := _apply_like_add_node(holder, props_script_first, root)
	if not ("script" in r1["properties_applied"]):
		_fail("case1: script should be applied")
	if not ("target" in r1["properties_applied"]):
		_fail("case1: target should be applied; applied=%s errors=%s" % [str(r1["properties_applied"]), str(r1["errors"])])
	var t1 = holder.get("target")
	if t1 != enemy:
		_fail("case1: target should be Enemy node, got %s (%s)" % [str(t1), type_string(typeof(t1))])
	if typeof(t1) == TYPE_STRING:
		_fail("case1: target must not remain a plain String")
	if r1["errors"].size() > 0:
		_fail("case1: unexpected errors %s" % str(r1["errors"]))
	root.free()

	# --- Case 2: target BEFORE script in dict — still must apply correctly ---
	root = Node.new()
	root.name = "Root"
	enemy = Node.new()
	enemy.name = "Enemy"
	root.add_child(enemy)
	holder = Node.new()
	holder.name = "Player"
	root.add_child(holder)

	var props_target_first := {}
	# Build with target first by inserting in order (Godot Dictionary preserves order).
	props_target_first["target"] = "../Enemy"
	props_target_first["script"] = script_path
	var r2 := _apply_like_add_node(holder, props_target_first, root)
	if not ("script" in r2["properties_applied"]):
		_fail("case2: script should be applied when target comes first in dict")
	if not ("target" in r2["properties_applied"]):
		_fail("case2: target should still apply when listed before script; applied=%s errors=%s" % [str(r2["properties_applied"]), str(r2["errors"])])
	var t2 = holder.get("target")
	if t2 != enemy:
		_fail("case2: target should be Enemy, got %s" % str(t2))
	if typeof(t2) == TYPE_STRING:
		_fail("case2: target must not be a plain String when script follows in dict")
	root.free()

	# --- Case 3: bad path must NOT count as applied ---
	root = Node.new()
	root.name = "Root"
	enemy = Node.new()
	enemy.name = "Enemy"
	root.add_child(enemy)
	holder = Node.new()
	holder.name = "Player"
	root.add_child(holder)

	var props_bad := {}
	props_bad["script"] = script_path
	props_bad["target"] = "../Nope"
	var r3 := _apply_like_add_node(holder, props_bad, root)
	if "target" in r3["properties_applied"]:
		_fail("case3: bad path must not be in properties_applied; got %s" % str(r3["properties_applied"]))
	if r3["errors"].size() == 0:
		_fail("case3: expected an error for unresolved NodePath")
	var t3 = holder.get("target")
	if t3 == null:
		pass  # ok — unset
	elif typeof(t3) == TYPE_STRING:
		_fail("case3: bad path must not leave a plain String on target")
	elif t3 != null:
		_fail("case3: target should be unset/null after failed resolve, got %s" % str(t3))
	root.free()

	# --- Case 4: root-relative path fallback ("Enemy" not "../Enemy") ---
	root = Node.new()
	root.name = "Root"
	enemy = Node.new()
	enemy.name = "Enemy"
	root.add_child(enemy)
	holder = Node.new()
	holder.name = "Player"
	root.add_child(holder)

	var props_root_rel := {}
	props_root_rel["script"] = script_path
	props_root_rel["target"] = "Enemy"
	var r4 := _apply_like_add_node(holder, props_root_rel, root)
	if not ("target" in r4["properties_applied"]):
		_fail("case4: root-relative Enemy should apply via scene_root fallback; applied=%s errors=%s" % [str(r4["properties_applied"]), str(r4["errors"])])
	var t4 = holder.get("target")
	if t4 != enemy:
		_fail("case4: target should be Enemy via root fallback, got %s" % str(t4))
	root.free()

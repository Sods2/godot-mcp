#!/usr/bin/env -S godot --headless --script
## #12: inline sub-resources ({type:CircleShape2D,...}) and res:// ExtResources
## coerce into real Resources and persist as [sub_resource]/[ext_resource].
extends SceneTree

const Coerce = preload("res://addons/godot_mcp_bridge/handlers/value_coerce.gd")

var _failures: Array[String] = []


func _fail(msg: String) -> void:
	_failures.append(msg)
	printerr("FAIL: " + msg)


func _ok(cond: bool, msg: String) -> void:
	if not cond:
		_fail(msg)


func _init() -> void:
	_run()
	print("subresource_coerce: %d failures" % _failures.size())
	quit(1 if _failures.size() > 0 else 0)


func _run() -> void:
	var c = Coerce.coerce({"type": "CircleShape2D", "radius": 20}, TYPE_OBJECT, PROPERTY_HINT_RESOURCE_TYPE, "Shape2D")
	_ok(c is CircleShape2D and is_equal_approx(c.radius, 20.0) and Coerce.last_error == "", "circle sub-resource")
	var r = Coerce.coerce({"type": "RectangleShape2D", "size": {"x": 8, "y": 4}}, TYPE_OBJECT, PROPERTY_HINT_RESOURCE_TYPE, "Shape2D")
	_ok(r is RectangleShape2D and r.size == Vector2(8, 4), "rect sub-resource with nested Vector2 coerce")

	var bad = Coerce.coerce({"type": "NotAType"}, TYPE_OBJECT, PROPERTY_HINT_RESOURCE_TYPE, "Shape2D")
	_ok(bad is Dictionary and Coerce.last_error != "", "unknown type -> error")
	var wrong = Coerce.coerce({"type": "Gradient"}, TYPE_OBJECT, PROPERTY_HINT_RESOURCE_TYPE, "Shape2D")
	_ok(wrong is Dictionary and Coerce.last_error.contains("not compatible"), "incompatible type -> error")
	var badprop = Coerce.coerce({"type": "CircleShape2D", "nope": 1}, TYPE_OBJECT, PROPERTY_HINT_RESOURCE_TYPE, "Shape2D")
	_ok(badprop is Dictionary and Coerce.last_error.contains("nope"), "unknown sub-property -> error")
	var missing = Coerce.coerce("res://does_not_exist.png", TYPE_OBJECT, PROPERTY_HINT_RESOURCE_TYPE, "Texture2D")
	_ok(missing is String and Coerce.last_error != "", "missing res:// -> error, no clear")
	Coerce.coerce(5, TYPE_INT)
	var okc = Coerce.coerce({"type": "CircleShape2D"}, TYPE_OBJECT, PROPERTY_HINT_RESOURCE_TYPE, "Shape2D")
	_ok(okc is CircleShape2D and Coerce.last_error == "", "last_error reset on success")

	# Persist: texture as ExtResource, shapes as SubResource.
	var tex := PlaceholderTexture2D.new()
	tex.size = Vector2(4, 4)
	ResourceSaver.save(tex, "res://tests/tmp_tex.tres")
	var root := Node2D.new()
	root.name = "Root"
	var spr := Sprite2D.new()
	spr.name = "Sprite"
	root.add_child(spr)
	spr.owner = root
	spr.texture = Coerce.coerce("res://tests/tmp_tex.tres", TYPE_OBJECT, PROPERTY_HINT_RESOURCE_TYPE, "Texture2D")
	var cs := CollisionShape2D.new()
	cs.name = "Hitbox"
	root.add_child(cs)
	cs.owner = root
	cs.shape = c
	var ps := PackedScene.new()
	ps.pack(root)
	ResourceSaver.save(ps, "res://tests/tmp_scene.tscn")
	var txt := FileAccess.get_file_as_string("res://tests/tmp_scene.tscn")
	_ok(txt.contains("[ext_resource") and txt.contains("tmp_tex.tres") and txt.contains("texture = ExtResource("), "tscn has ExtResource texture")
	_ok(txt.contains("[sub_resource type=\"CircleShape2D\"") and txt.contains("radius = 20"), "tscn has CircleShape2D sub_resource")
	root.free()

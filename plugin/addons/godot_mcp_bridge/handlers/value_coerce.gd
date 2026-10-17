@tool
extends RefCounted

# Convert a JSON-decoded value (bool/int/float/String/Array/Dictionary) into the
# Godot Variant type a property expects. The MCP bridge receives every value as
# JSON, so a Vector2 arrives as {"x":1,"y":2} (a Dictionary) and a Color as
# {"r":..} or "#rrggbb". Assigning those straight to a typed property silently
# no-ops, so coerce first and the assignment actually takes.
#
# hint / hint_string come from get_property_list() and disambiguate TYPE_OBJECT:
# RESOURCE_TYPE loads res:// paths; NODE_TYPE turns a path string into NodePath
# (call resolve_for_assignment afterwards to get the live Node).
# Set by coerce() when a value could not be converted (e.g. unknown inline
# sub-resource type). Callers read it right after coerce() to report honestly.
static var last_error: String = ""


static func coerce(value, type: int, hint: int = PROPERTY_HINT_NONE, hint_string: String = ""):
	match type:
		TYPE_BOOL:
			return bool(value)
		TYPE_INT:
			return int(value)
		TYPE_FLOAT:
			return float(value)
		TYPE_STRING:
			return str(value)
		TYPE_STRING_NAME:
			return StringName(str(value))
		TYPE_NODE_PATH:
			return _node_path(value)
		TYPE_OBJECT:
			last_error = ""
			return _object(value, hint, hint_string)
		TYPE_VECTOR2:
			return _vec2(value)
		TYPE_VECTOR2I:
			var v := _vec2(value)
			return Vector2i(roundi(v.x), roundi(v.y))
		TYPE_VECTOR3:
			return _vec3(value)
		TYPE_VECTOR3I:
			var v := _vec3(value)
			return Vector3i(roundi(v.x), roundi(v.y), roundi(v.z))
		TYPE_VECTOR4:
			return _vec4(value)
		TYPE_VECTOR4I:
			var v := _vec4(value)
			return Vector4i(roundi(v.x), roundi(v.y), roundi(v.z), roundi(v.w))
		TYPE_COLOR:
			return _color(value)
		TYPE_RECT2:
			return _rect2(value)
		TYPE_RECT2I:
			var r := _rect2(value)
			return Rect2i(roundi(r.position.x), roundi(r.position.y), roundi(r.size.x), roundi(r.size.y))
		_:
			return value


# After coerce(), Node-typed Object properties may still hold a NodePath (path
# string from JSON). Resolve it relative to owner first (Godot Node-export
# convention), then fall back to scene_root so callers can also pass paths the
# same way other tools do (from the edited scene root). Returns
# {"ok": bool, "value": Variant, "error": String}.
static func resolve_for_assignment(coerced, owner: Node, target_type: int, scene_root: Node = null) -> Dictionary:
	if coerced is NodePath and target_type == TYPE_OBJECT:
		var np: NodePath = coerced
		if np.is_empty():
			return {"ok": true, "value": null, "error": ""}
		if owner == null and scene_root == null:
			return {"ok": false, "value": null, "error": "Cannot resolve NodePath without an owner node"}
		var resolved: Node = null
		if owner != null:
			resolved = owner.get_node_or_null(np)
		if resolved == null and scene_root != null and scene_root != owner:
			resolved = scene_root.get_node_or_null(np)
		if resolved == null:
			return {"ok": false, "value": null, "error": "Node not found for path: %s" % str(np)}
		return {"ok": true, "value": resolved, "error": ""}
	return {"ok": true, "value": coerced, "error": ""}


static func _node_path(value) -> NodePath:
	if value == null:
		return NodePath()
	if value is NodePath:
		return value
	return NodePath(str(value))


static func _object(value, hint: int, _hint_string: String):
	if value == null:
		return null
	if value is Object:
		return value
	# Empty string clears an Object/Resource/Node property.
	if value is String and value == "":
		return null
	if value is String:
		var s: String = value
		# Resource / Script from a project path.
		if s.begins_with("res://") or s.begins_with("user://"):
			# Try load even if exists() is false — it can be for brand-new files.
			var loaded = ResourceLoader.load(s)
			if loaded == null:
				last_error = "Could not load resource: %s" % s
				return value
			return loaded
		# Node-typed export: keep as NodePath so the caller can resolve against
		# the property owner (paths are relative to that node, not the scene root).
		if hint == PROPERTY_HINT_NODE_TYPE:
			return NodePath(s)
		# RESOURCE_TYPE with an explicit URI prefix.
		if hint == PROPERTY_HINT_RESOURCE_TYPE and s.contains("://"):
			return ResourceLoader.load(s)
		return value
	# Inline sub-resource: {"type":"CircleShape2D","radius":20,...}
	if value is Dictionary and value.has("type"):
		return _sub_resource(value, hint, _hint_string)
	return value


# Build an unsaved Resource from a dict; Godot packs it as a [sub_resource]
# when the owning scene is saved. On failure returns the original dict (so the
# assignment no-ops instead of clearing the property) and sets last_error.
static func _sub_resource(d: Dictionary, hint: int, hint_string: String):
	var type_name := str(d["type"])
	if not ClassDB.class_exists(type_name) or not ClassDB.can_instantiate(type_name):
		last_error = "Unknown or non-instantiable resource type: %s" % type_name
		return d
	if not ClassDB.is_parent_class(type_name, "Resource"):
		last_error = "%s is not a Resource type" % type_name
		return d
	if hint == PROPERTY_HINT_RESOURCE_TYPE and hint_string != "":
		var ok := false
		for allowed in hint_string.split(","):
			allowed = allowed.strip_edges()
			if allowed == type_name or (ClassDB.class_exists(allowed) and ClassDB.is_parent_class(type_name, allowed)):
				ok = true
				break
		if not ok:
			last_error = "%s is not compatible with expected type %s" % [type_name, hint_string]
			return d
	var res: Resource = ClassDB.instantiate(type_name)
	var plist := {}
	for prop in res.get_property_list():
		plist[str(prop["name"])] = prop
	var errs: Array = []
	for key in d:
		if key == "type":
			continue
		if not plist.has(str(key)):
			errs.append("%s.%s: no such property" % [type_name, key])
			continue
		var pr: Dictionary = plist[str(key)]
		var v = coerce(d[key], int(pr["type"]), int(pr["hint"]), str(pr.get("hint_string", "")))
		if last_error != "":
			errs.append("%s.%s: %s" % [type_name, key, last_error])
			last_error = ""
			continue
		res.set(key, v)
		if not values_match(res.get(key), v):
			errs.append("%s.%s: property did not accept the value" % [type_name, key])
	if errs.size() > 0:
		last_error = "; ".join(errs)
		return d
	return res


static func _num(value, key: String, idx: int, def: float) -> float:
	if value is Dictionary:
		return float(value.get(key, def))
	if value is Array and idx < value.size():
		return float(value[idx])
	return def


static func _vec2(value) -> Vector2:
	if value is Vector2:
		return value
	return Vector2(_num(value, "x", 0, 0.0), _num(value, "y", 1, 0.0))


static func _vec3(value) -> Vector3:
	if value is Vector3:
		return value
	return Vector3(_num(value, "x", 0, 0.0), _num(value, "y", 1, 0.0), _num(value, "z", 2, 0.0))


static func _vec4(value) -> Vector4:
	if value is Vector4:
		return value
	return Vector4(_num(value, "x", 0, 0.0), _num(value, "y", 1, 0.0), _num(value, "z", 2, 0.0), _num(value, "w", 3, 0.0))


static func _color(value) -> Color:
	if value is Color:
		return value
	if value is String:
		return Color.html(value)
	if value is Dictionary:
		return Color(
			float(value.get("r", 0.0)),
			float(value.get("g", 0.0)),
			float(value.get("b", 0.0)),
			float(value.get("a", 1.0))
		)
	if value is Array and value.size() >= 3:
		var a := 1.0 if value.size() < 4 else float(value[3])
		return Color(float(value[0]), float(value[1]), float(value[2]), a)
	return Color()


static func _rect2(value) -> Rect2:
	if value is Rect2:
		return value
	if value is Dictionary:
		if value.has("position") or value.has("size"):
			return Rect2(_vec2(value.get("position", {})), _vec2(value.get("size", {})))
		var w := float(value.get("w", value.get("width", 0.0)))
		var h := float(value.get("h", value.get("height", 0.0)))
		return Rect2(float(value.get("x", 0.0)), float(value.get("y", 0.0)), w, h)
	if value is Array and value.size() >= 4:
		return Rect2(float(value[0]), float(value[1]), float(value[2]), float(value[3]))
	return Rect2()


# Loose equality with float tolerance, for verifying that a write took effect.
static func values_match(a, b) -> bool:
	if typeof(a) != typeof(b):
		return a == b
	match typeof(a):
		TYPE_FLOAT:
			return is_equal_approx(a, b)
		TYPE_VECTOR2, TYPE_VECTOR3, TYPE_VECTOR4, TYPE_COLOR, TYPE_QUATERNION:
			return a.is_equal_approx(b)
		_:
			return a == b

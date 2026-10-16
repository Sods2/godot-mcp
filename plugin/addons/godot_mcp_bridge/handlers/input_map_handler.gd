@tool
class_name InputMapHandler
extends RefCounted

# Input Map editing through ProjectSettings (input/<action>) + ProjectSettings.save().
# Going through the engine instead of rewriting project.godot keeps existing
# multi-line action blocks intact.

const DEFAULT_DEADZONE := 0.5

static func _setting_key(action: String) -> String:
	return "input/" + action

static func event_from_dict(d: Dictionary) -> InputEvent:
	var t: String = str(d.get("type", "key")).to_lower()
	match t:
		"key":
			var ev := InputEventKey.new()
			if d.has("keycode"):
				ev.keycode = int(d["keycode"])
			if d.has("physical_keycode"):
				ev.physical_keycode = int(d["physical_keycode"])
			if d.has("key_label"):
				ev.key_label = int(d["key_label"])
			if d.has("unicode"):
				ev.unicode = int(d["unicode"])
			if ev.keycode == 0 and ev.physical_keycode == 0 and ev.key_label == 0:
				return null
			ev.shift_pressed = bool(d.get("shift", false))
			ev.ctrl_pressed = bool(d.get("ctrl", false))
			ev.alt_pressed = bool(d.get("alt", false))
			ev.meta_pressed = bool(d.get("meta", false))
			ev.device = int(d.get("device", -1))  # -1 = all devices, as the Input Map editor writes
			return ev
		"mouse_button", "mouse":
			var mb := InputEventMouseButton.new()
			mb.button_index = int(d.get("button_index", 1))
			mb.device = int(d.get("device", -1))
			return mb
		"joypad_button", "joy_button":
			var jb := InputEventJoypadButton.new()
			jb.button_index = int(d.get("button_index", 0))
			jb.device = int(d.get("device", -1))
			return jb
		"joypad_motion", "joy_axis":
			var jm := InputEventJoypadMotion.new()
			jm.axis = int(d.get("axis", 0))
			jm.axis_value = float(d.get("axis_value", 1.0))
			jm.device = int(d.get("device", -1))
			return jm
	return null

static func event_to_dict(ev: InputEvent) -> Dictionary:
	if ev is InputEventKey:
		return {"type": "key", "keycode": ev.keycode, "physical_keycode": ev.physical_keycode,
			"key_label": ev.key_label, "unicode": ev.unicode,
			"shift": ev.shift_pressed, "ctrl": ev.ctrl_pressed, "alt": ev.alt_pressed, "meta": ev.meta_pressed,
			"text": _key_text(ev)}
	if ev is InputEventMouseButton:
		return {"type": "mouse_button", "button_index": ev.button_index, "text": ev.as_text()}
	if ev is InputEventJoypadButton:
		return {"type": "joypad_button", "button_index": ev.button_index, "device": ev.device, "text": ev.as_text()}
	if ev is InputEventJoypadMotion:
		return {"type": "joypad_motion", "axis": ev.axis, "axis_value": ev.axis_value, "device": ev.device, "text": ev.as_text()}
	return {"type": ev.get_class() if ev else "null", "text": ev.as_text() if ev else ""}

static func _key_text(ev: InputEventKey) -> String:
	var txt: String = ev.as_text()
	if ev.keycode == 0 and ev.physical_keycode != 0 and not txt.ends_with("Physical"):
		txt += " - Physical"
	return txt

# Identity used for duplicate detection (ignores the human-readable text).
static func _event_sig(ev: InputEvent) -> String:
	var d := event_to_dict(ev)
	d.erase("text")
	if ev is InputEventKey:
		# unicode/key_label are derived/metadata; the binding is keycode/physical_keycode + modifiers.
		# Only keep key_label when it is the sole identifier of the key.
		d.erase("unicode")
		if ev.keycode != 0 or ev.physical_keycode != 0:
			d.erase("key_label")
	if ev is InputEventJoypadMotion:
		d["axis_value"] = signf(ev.axis_value)  # direction is what matters in the Input Map
	return var_to_str(d)

func _parse_events(raw) -> Dictionary:
	var out: Array = []
	if raw == null:
		return {"events": out}
	if not (raw is Array):
		return {"error": "events must be an array"}
	for i in raw.size():
		var e = raw[i]
		if not (e is Dictionary):
			return {"error": "events[%d] must be an object" % i}
		var et: String = str(e.get("type", "key")).to_lower()
		if (et == "joypad_motion" or et == "joy_axis") and not e.has("axis"):
			return {"error": "events[%d]: joypad_motion requires axis" % i}
		var ev := event_from_dict(e)
		if ev == null:
			return {"error": "events[%d] is invalid (supported types: key, mouse_button, joypad_button, joypad_motion; key needs keycode or physical_keycode)" % i}
		out.append(ev)
	return {"events": out}

func _sync_input_map(action: String, entry) -> void:
	# Keep the editor's live InputMap in step so InputMap.has_action() agrees.
	if InputMap.has_action(action):
		InputMap.erase_action(action)
	if entry is Dictionary:
		InputMap.add_action(action, float(entry.get("deadzone", DEFAULT_DEADZONE)))
		for ev in entry.get("events", []):
			if ev is InputEvent:
				InputMap.action_add_event(action, ev)

func _save() -> String:
	var err := ProjectSettings.save()
	if err != OK:
		return "ProjectSettings.save() failed: " + error_string(err)
	return ""

# Make the editor's Project Settings > Input Map tab pick up the change.
func _refresh_editor_ui(key: String, present: bool) -> void:
	if present:
		ProjectSettings.set_as_basic(key, true)
	ProjectSettings.emit_signal("settings_changed")
	if not Engine.is_editor_hint():
		return
	var base := EditorInterface.get_base_control()
	if base == null:
		return
	var pse := _find_node_by_class(base, "ProjectSettingsEditor")
	if pse == null:
		return
	# Internal methods are not always reachable from script, so guard each call.
	for m in ["_update_action_map_editor", "update_action_map_editor"]:
		if pse.has_method(m):
			pse.call_deferred(m)
			return
	var ame := _find_node_by_class(pse, "ActionMapEditor")
	if ame != null and ame.has_method("update_action_list"):
		ame.call_deferred("update_action_list")

func _find_node_by_class(root: Node, cls: String) -> Node:
	if root.get_class() == cls:
		return root
	for c in root.get_children(true):
		var f := _find_node_by_class(c, cls)
		if f != null:
			return f
	return null

func list_actions(params: Dictionary) -> Dictionary:
	var include_builtin: bool = bool(params.get("include_builtin", false))
	var actions: Array = []
	for prop in ProjectSettings.get_property_list():
		var key: String = prop.get("name", "")
		if not key.begins_with("input/"):
			continue
		var action := key.substr(6)
		if not include_builtin and action.begins_with("ui_"):
			continue
		var entry = ProjectSettings.get_setting(key)
		if not (entry is Dictionary):
			continue
		var evs: Array = []
		for ev in entry.get("events", []):
			evs.append(event_to_dict(ev))
		actions.append({"action": action, "deadzone": entry.get("deadzone", DEFAULT_DEADZONE), "events": evs})
	return {"actions": actions, "count": actions.size()}

func add_action(params: Dictionary) -> Dictionary:
	var action: String = str(params.get("action", "")).strip_edges()
	if action == "":
		return {"error": "action is required"}
	if action.contains("/") or action.contains("=") or action.contains(" "):
		return {"error": "Invalid action name: " + action}
	var key := _setting_key(action)
	var existed := ProjectSettings.has_setting(key)
	var overwrite: bool = bool(params.get("overwrite", false))
	var parsed := _parse_events(params.get("events", []))
	if parsed.has("error"):
		return parsed
	var entry: Dictionary
	if existed and not overwrite:
		var cur = ProjectSettings.get_setting(key)
		entry = (cur as Dictionary).duplicate() if cur is Dictionary else {"deadzone": DEFAULT_DEADZONE, "events": []}
		var evs: Array = (entry.get("events", []) as Array).duplicate()
		evs.append_array(parsed["events"])
		entry["events"] = evs
		if params.has("deadzone"):
			entry["deadzone"] = float(params["deadzone"])
	else:
		entry = {"deadzone": float(params.get("deadzone", DEFAULT_DEADZONE)), "events": parsed["events"]}
	# Drop duplicate events (already on the action, or repeated in this request).
	var seen := {}
	var unique: Array = []
	var skipped := 0
	for ev in entry["events"]:
		var sig := _event_sig(ev)
		if seen.has(sig):
			skipped += 1
			continue
		seen[sig] = true
		unique.append(ev)
	entry["events"] = unique
	ProjectSettings.set_setting(key, entry)
	var err := _save()
	if err != "":
		return {"error": err}
	_sync_input_map(action, entry)
	_refresh_editor_ui(key, true)
	return {"success": true, "action": action, "created": not existed,
		"deadzone": entry["deadzone"], "event_count": (entry["events"] as Array).size(), "skipped_duplicates": skipped}

func add_event(params: Dictionary) -> Dictionary:
	var action: String = str(params.get("action", ""))
	if not ProjectSettings.has_setting(_setting_key(action)):
		return {"error": "Action not found: " + action}
	var evs = params.get("events", null)
	if evs == null and params.has("event"):
		evs = [params["event"]]
	if evs == null or (evs is Array and evs.is_empty()):
		return {"error": "event or events is required"}
	return add_action({"action": action, "events": evs})

func remove_action(params: Dictionary) -> Dictionary:
	var action: String = str(params.get("action", ""))
	var key := _setting_key(action)
	if action == "" or not ProjectSettings.has_setting(key):
		return {"error": "Action not found: " + action}
	ProjectSettings.set_setting(key, null)
	var err := _save()
	if err != "":
		return {"error": err}
	_sync_input_map(action, null)
	_refresh_editor_ui(key, false)
	return {"success": true, "action": action, "removed": true}

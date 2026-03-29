@tool
extends EditorDebuggerPlugin

var _breakpoints: Array = []  # Array of {file, line}
var _stack_frames: Array = []  # Array of {file, line, function, id}
var _locals: Array = []        # Array of {name, value}
var _is_paused: bool = false
var _active_session: EditorDebuggerSession = null
var _profiler_data: Array = []  # Collected profiler frames
var _profiler_active: bool = false
var _output_lines: Array[String] = []  # Game print() output
var _editor_interface: EditorInterface = null
var _capture_logged: bool = false
var _output_panel_start: int = 0  # Text length at session start

func set_editor_interface(ei: EditorInterface) -> void:
	_editor_interface = ei

func _setup_session(session_id: int) -> void:
	var session := get_session(session_id)
	if session == null:
		return
	_active_session = session
	session.started.connect(_on_session_started.bind(session_id))
	session.stopped.connect(_on_session_stopped.bind(session_id))
	session.breaked.connect(_on_session_breaked)
	session.continued.connect(_on_session_continued)

func _has_capture(capture: String) -> bool:
	var c := capture
	if c == "output" or c == "stack_dump" or c == "stack_frame_vars" \
		or c == "debug" or c == "claude_bridge" or c == "servers" or c == "scripts":
		return true
	return false

func _on_session_started(session_id: int) -> void:
	var session := get_session(session_id)
	if session == null:
		return
	_active_session = session
	_is_paused = false
	_stack_frames = []
	_locals = []
	_output_lines.clear()
	_capture_logged = false
	# Record current output panel length so we only return new output
	_output_panel_start = _get_output_panel_text().length()
	# Apply any pre-set breakpoints to the new session
	for bp in _breakpoints:
		session.set_breakpoint(bp.file, bp.line, true)

func _on_session_stopped(session_id: int) -> void:
	_is_paused = false
	_stack_frames = []
	_locals = []
	_active_session = null

func _on_session_breaked(can_debug: bool) -> void:
	_is_paused = true
	_stack_frames = []
	_locals = []

func _on_session_continued() -> void:
	_is_paused = false
	_stack_frames = []
	_locals = []

func _capture(message: String, data: Array, session_id: int) -> bool:
	var msg := message
	if not _capture_logged:
		_capture_logged = true
		print("[Claude Bridge] Capture active (first message: %s)" % msg)
	# Diagnostics: log relevant capture messages with data type info
	if msg == "stack_dump" or msg == "stack_frame_vars" or msg == "output" \
		or msg.begins_with("servers:") or msg.begins_with("scripts:"):
		var type_info := ""
		for i in range(min(data.size(), 3)):
			type_info += type_string(typeof(data[i])) + " "
		print("[Claude Bridge] _capture: msg=%s data_size=%d types=[%s]" % [msg, data.size(), type_info.strip_edges()])

	# Native debugger: stack dump sent automatically when breaking or in response to get_stack_dump
	if msg == "stack_dump":
		_stack_frames = []
		if data.size() > 0 and data[0] is Dictionary:
			# Custom/legacy format: array of dicts
			for frame in data:
				if frame is Dictionary:
					_stack_frames.append(frame)
		else:
			# Godot native flat format: [file, line, func, file, line, func, ...]
			var i := 0
			while i + 2 < data.size():
				_stack_frames.append({
					"file": str(data[i]),
					"line": int(data[i + 1]),
					"function": str(data[i + 2]),
					"id": i / 3
				})
				i += 3
		# Auto-request locals for the top frame
		if _active_session != null and not _stack_frames.is_empty():
			_active_session.send_message("get_stack_frame_vars", [0])
		return false  # Let built-in debugger handle it too

	# Native debugger: locals response for a stack frame
	# Godot 4 format: [locals_count, name0, val0, ..., members_count, name0, val0, ..., globals_count, name0, val0, ...]
	if msg == "stack_frame_vars":
		_locals = []
		var idx: int = 0
		while idx < data.size():
			var section_count: int = int(data[idx])
			idx += 1
			for i in range(section_count):
				if idx + 1 < data.size():
					_locals.append({
						"name": str(data[idx]),
						"value": str(data[idx + 1])
					})
				idx += 2
		return false

	# Game print() output
	# Godot 4 format: [PackedStringArray(messages), PackedInt32Array(types)]
	if msg == "output":
		if data.size() >= 1:
			var messages = data[0]
			if messages is PackedStringArray:
				for text in messages:
					var line: String = str(text).strip_edges()
					if line != "":
						_output_lines.append(line)
			elif messages is Array:
				for text in messages:
					var line: String = str(text).strip_edges()
					if line != "":
						_output_lines.append(line)
			else:
				# Unexpected format: stringify everything
				for item in data:
					var line: String = str(item).strip_edges()
					if line != "":
						_output_lines.append(line)
		return false

	# Legacy custom messages (kept for backwards compatibility)
	if msg == "claude_bridge:stack_dump":
		_stack_frames = []
		for frame in data:
			if frame is Dictionary:
				_stack_frames.append(frame)
		return true
	if msg == "claude_bridge:locals":
		_locals = []
		for local in data:
			if local is Dictionary:
				_locals.append(local)
		return true

	# Profiler frame data from built-in profilers (servers + scripts)
	if msg == "servers:profile_frame" or msg == "scripts:profile_frame":
		var frame_info := {}
		frame_info["profiler"] = "servers" if msg.begins_with("servers:") else "scripts"
		if data.size() >= 2:
			var names = data[0]
			var values = data[1]
			var entries: Array = []
			if names is PackedStringArray:
				for j in range(names.size()):
					entries.append({
						"name": names[j],
						"value": float(values[j]) if j < values.size() else 0.0
					})
			frame_info["entries"] = entries
		else:
			frame_info["raw_size"] = data.size()
		_profiler_data.append(frame_info)
		return true

	return false

func get_stack_frames() -> Array:
	if not _stack_frames.is_empty():
		return _stack_frames
	# Fallback: read from the editor's debugger UI
	return _read_stack_from_editor_ui()

func get_locals() -> Array:
	if not _locals.is_empty():
		return _locals
	# Fallback: read from the editor's debugger UI
	return _read_locals_from_editor_ui()

func is_paused() -> bool:
	return _is_paused

func get_output_lines() -> Array:
	# If _capture received output lines, use those
	if not _output_lines.is_empty():
		return _output_lines.duplicate()
	# Fallback: read from the editor's Output panel (EditorLog)
	var full_text := _get_output_panel_text()
	if full_text.length() > _output_panel_start:
		var new_text := full_text.substr(_output_panel_start)
		var lines: Array = []
		for line in new_text.split("\n"):
			var trimmed := line.strip_edges()
			if trimmed != "":
				lines.append(trimmed)
		return lines
	return []

func set_breakpoint_in_session(file: String, line: int, enabled: bool) -> void:
	# Track breakpoints locally
	if enabled:
		var already := false
		for bp in _breakpoints:
			if bp.file == file and bp.line == line:
				already = true
				break
		if not already:
			_breakpoints.append({"file": file, "line": line})
	else:
		for i in range(_breakpoints.size() - 1, -1, -1):
			if _breakpoints[i].file == file and _breakpoints[i].line == line:
				_breakpoints.remove_at(i)

	if _active_session != null:
		_active_session.set_breakpoint(file, line, enabled)

	# Set visual breakpoint in the editor gutter
	_set_visual_breakpoint(file, line, enabled)

func _set_visual_breakpoint(file: String, line: int, enabled: bool) -> void:
	if _editor_interface == null:
		return
	var script_editor = _editor_interface.get_script_editor()
	if script_editor == null:
		return
	# Open the script so it can receive the visual breakpoint
	var script = load(file)
	if script == null:
		return
	# edit_script() makes the script the current tab, so get_current_editor() returns it
	_editor_interface.edit_script(script, line)
	var current_editor = script_editor.get_current_editor()
	if current_editor == null:
		return
	var base = current_editor.get_base_editor()
	if base is CodeEdit:
		(base as CodeEdit).set_line_as_breakpoint(line - 1, enabled)  # CodeEdit uses 0-indexed lines

func has_active_session() -> bool:
	return _active_session != null

func send_debugger_command(command: String, args: Array = []) -> void:
	if _active_session != null:
		_active_session.send_message(command, args)

func is_profiler_active() -> bool:
	return _profiler_active

func start_profiler() -> void:
	_profiler_data = []
	_profiler_active = true
	if _active_session != null:
		_active_session.toggle_profiler("servers", true, [])
		_active_session.toggle_profiler("scripts", true, [])

func stop_profiler() -> Array:
	_profiler_active = false
	if _active_session != null:
		_active_session.toggle_profiler("servers", false, [])
		_active_session.toggle_profiler("scripts", false, [])
	return _profiler_data.duplicate()

func get_profiler_data() -> Array:
	if not _profiler_data.is_empty():
		return _profiler_data.duplicate()
	# Fallback: basic performance metrics available without game-side capture
	return [_get_performance_snapshot()]

func _get_performance_snapshot() -> Dictionary:
	return {
		"profiler": "performance",
		"entries": [
			{"name": "fps", "value": Performance.get_monitor(Performance.TIME_FPS)},
			{"name": "process_time_ms", "value": Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0},
			{"name": "physics_process_time_ms", "value": Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0},
			{"name": "static_memory_mb", "value": Performance.get_monitor(Performance.MEMORY_STATIC) / 1048576.0},
			{"name": "object_count", "value": Performance.get_monitor(Performance.OBJECT_COUNT)},
			{"name": "nodes_count", "value": Performance.get_monitor(Performance.OBJECT_NODE_COUNT)},
			{"name": "render_draw_calls", "value": Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)},
		]
	}

# --- Editor UI reading (fallback for built-in messages that bypass _capture) ---

func _get_editor_base() -> Control:
	if _editor_interface != null:
		return _editor_interface.get_base_control()
	return EditorInterface.get_base_control()

func _get_output_panel_text() -> String:
	var base := _get_editor_base()
	if base == null:
		return ""
	var rtl := _find_node_of_class(base, "RichTextLabel", "EditorLog")
	if rtl != null:
		return rtl.get_parsed_text()
	return ""

func _read_stack_from_editor_ui() -> Array:
	var base := _get_editor_base()
	if base == null:
		return []
	# Find the ScriptEditorDebugger node
	var debugger := _find_node_of_class(base, "ScriptEditorDebugger")
	if debugger == null:
		return []
	# The stack Tree is inside the debugger with columns for function/file/line
	var frames := []
	for child in _get_all_children(debugger):
		if child is Tree and child.get_columns() >= 2:
			var root: TreeItem = child.get_root()
			if root == null:
				continue
			var item := root.get_first_child()
			while item != null:
				var frame := {}
				var cols: int = child.get_columns()
				if cols >= 3:
					frame["function"] = item.get_text(0)
					frame["file"] = item.get_text(1)
					frame["line"] = item.get_text(2).to_int()
				elif cols >= 2:
					frame["function"] = item.get_text(0)
					frame["file"] = item.get_text(1)
				frame["id"] = frames.size()
				frames.append(frame)
				item = item.get_next()
			if not frames.is_empty():
				return frames
	return frames

func _read_locals_from_editor_ui() -> Array:
	var base := _get_editor_base()
	if base == null:
		return []
	var debugger := _find_node_of_class(base, "ScriptEditorDebugger")
	if debugger == null:
		return []
	# The locals inspector uses a Tree with property name/value columns
	var locals := []
	for child in _get_all_children(debugger):
		if child is Tree and child.get_columns() >= 2:
			var root: TreeItem = child.get_root()
			if root == null:
				continue
			# Skip the stack tree (identified by having stack-like data)
			var first := root.get_first_child()
			if first == null:
				continue
			# Locals tree items have name in col 0 and value in col 1
			# Distinguish from stack tree: stack has file paths in col 1
			var col1_text: String = first.get_text(1)
			if col1_text.begins_with("res://") or col1_text.ends_with(".gd"):
				continue  # This is the stack tree, skip
			var item := first
			while item != null:
				var name_text: String = item.get_text(0).strip_edges()
				var val_text: String = item.get_text(1).strip_edges()
				if name_text != "":
					locals.append({"name": name_text, "value": val_text})
				item = item.get_next()
			if not locals.is_empty():
				return locals
	return locals

func _find_node_of_class(root: Node, class_name_str: String, parent_class: String = "") -> Node:
	for child in _get_all_children(root):
		if child.get_class() == class_name_str or child.is_class(class_name_str):
			if parent_class == "":
				return child
			if child.get_parent() != null and (child.get_parent().get_class() == parent_class or child.get_parent().is_class(parent_class)):
				return child
	return null

func _get_all_children(node: Node) -> Array:
	var result: Array = []
	var stack: Array = [node]
	while not stack.is_empty():
		var current: Node = stack.pop_back()
		for child in current.get_children():
			result.append(child)
			stack.append(child)
	return result

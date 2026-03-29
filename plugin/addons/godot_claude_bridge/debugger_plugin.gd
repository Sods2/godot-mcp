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
	_is_paused = false
	_stack_frames = []
	_locals = []
	_output_lines.clear()
	# Apply any pre-set breakpoints to the new session
	for bp in _breakpoints:
		_active_session.set_breakpoint(bp.file, bp.line, true)

func _on_session_stopped(session_id: int) -> void:
	_is_paused = false
	_stack_frames = []
	_locals = []
	_active_session = null

func _on_session_breaked(can_debug: bool) -> void:
	_is_paused = true

func _on_session_continued() -> void:
	_is_paused = false
	_stack_frames = []
	_locals = []

func _capture(message: String, data: Array, session_id: int) -> bool:
	var msg := message
	if not _capture_logged:
		_capture_logged = true
		print("[Claude Bridge] Capture active (first message: %s)" % msg)
	# Log all capture messages for diagnostics (remove in production)
	if msg == "stack_dump" or msg == "stack_frame_vars" or msg == "output" \
		or msg.begins_with("servers:") or msg.begins_with("scripts:"):
		print("[Claude Bridge] _capture: msg=%s data_size=%d" % [msg, data.size()])
	# Native debugger: stack dump sent automatically when breaking
	if msg == "stack_dump":
		_stack_frames = []
		for frame in data:
			if frame is Dictionary:
				_stack_frames.append(frame)
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
	# data format varies by Godot version: [PackedStringArray, PackedInt32Array] or interleaved
	if msg == "output":
		if data.size() >= 1 and data[0] is Array:
			for text in data[0]:
				var line: String = str(text).strip_edges()
				if line != "":
					_output_lines.append(line)
		else:
			for item in data:
				if item is String:
					var line: String = item.strip_edges()
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
	if msg == "servers:profile_frame":
		_profiler_data.append(data)
		return true
	if msg == "scripts:profile_frame":
		_profiler_data.append(data)
		return true
	return false

func get_stack_frames() -> Array:
	return _stack_frames

func get_locals() -> Array:
	return _locals

func is_paused() -> bool:
	return _is_paused

func get_output_lines() -> Array:
	return _output_lines.duplicate()

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
	return _profiler_data.duplicate()

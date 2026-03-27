@tool
class_name ClaudeBridgeDebugger
extends EditorDebuggerPlugin

var _breakpoints: Array = []  # Array of {file, line}
var _stack_frames: Array = []  # Array of {file, line, function, id}
var _locals: Array = []        # Array of {name, value}
var _is_paused: bool = false
var _active_session: EditorDebuggerSession = null
var _profiler_data: Array = []  # Collected profiler frames
var _profiler_active: bool = false

func _setup_session(session_id: int) -> void:
	var session := get_session(session_id)
	if session == null:
		return
	_active_session = session
	session.started.connect(_on_session_started.bind(session_id))
	session.stopped.connect(_on_session_stopped.bind(session_id))
	session.breaked.connect(_on_session_breaked)
	session.continued.connect(_on_session_continued)

func _on_session_started(session_id: int) -> void:
	_is_paused = false
	_stack_frames = []
	_locals = []

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
	if message == "claude_bridge:stack_dump":
		_stack_frames = []
		for frame in data:
			if frame is Dictionary:
				_stack_frames.append(frame)
		return true
	if message == "claude_bridge:locals":
		_locals = []
		for local in data:
			if local is Dictionary:
				_locals.append(local)
		return true
	if message == "servers:profile_frame":
		_profiler_data.append(data)
		return true
	return false

func get_stack_frames() -> Array:
	return _stack_frames

func get_locals() -> Array:
	return _locals

func is_paused() -> bool:
	return _is_paused

func set_breakpoint_in_session(file: String, line: int, enabled: bool) -> void:
	if _active_session != null:
		_active_session.set_breakpoint(file, line, enabled)

func send_debugger_command(command: String, args: Array = []) -> void:
	if _active_session != null:
		_active_session.send_message(command, args)

func start_profiler() -> void:
	_profiler_data = []
	_profiler_active = true
	if _active_session != null:
		_active_session.toggle_profiler("servers", true, [], 1.0 / 60.0)

func stop_profiler() -> Array:
	_profiler_active = false
	if _active_session != null:
		_active_session.toggle_profiler("servers", false, [], 0.0)
	return _profiler_data.duplicate()

func get_profiler_data() -> Array:
	return _profiler_data.duplicate()

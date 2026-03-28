@tool
class_name DebugHandler
extends RefCounted

var _debugger: ClaudeBridgeDebugger

func _init(debugger: ClaudeBridgeDebugger) -> void:
	_debugger = debugger

func set_breakpoint(_ei: EditorInterface, params: Dictionary) -> Dictionary:
	var file: String = params.get("file", "")
	var line: int = params.get("line", 0)
	if file.is_empty() or line <= 0:
		return { "error": "file and line required" }
	if not _debugger.has_active_session():
		return { "error": "No active debug session — run the project first, then set breakpoints" }
	_debugger.set_breakpoint_in_session(file, line, true)
	return { "success": true, "file": file, "line": line }

func remove_breakpoint(_ei: EditorInterface, params: Dictionary) -> Dictionary:
	var file: String = params.get("file", "")
	var line: int = params.get("line", 0)
	if file.is_empty() or line <= 0:
		return { "error": "file and line required" }
	if not _debugger.has_active_session():
		return { "error": "No active debug session — run the project first" }
	_debugger.set_breakpoint_in_session(file, line, false)
	return { "success": true }

func list_breakpoints(_ei: EditorInterface, _params: Dictionary) -> Dictionary:
	return { "breakpoints": _debugger._breakpoints }

func get_stack_trace(_ei: EditorInterface, _params: Dictionary) -> Dictionary:
	if not _debugger.is_paused():
		return { "error": "not paused at breakpoint" }
	return { "frames": _debugger.get_stack_frames() }

func get_locals(_ei: EditorInterface, _params: Dictionary) -> Dictionary:
	if not _debugger.is_paused():
		return { "error": "not paused at breakpoint" }
	return { "locals": _debugger.get_locals() }

func step_over(_ei: EditorInterface, _params: Dictionary) -> Dictionary:
	if not _debugger.is_paused():
		return { "error": "not paused at breakpoint" }
	_debugger.send_debugger_command("next", [])
	return { "success": true }

func step_into(_ei: EditorInterface, _params: Dictionary) -> Dictionary:
	if not _debugger.is_paused():
		return { "error": "not paused at breakpoint" }
	_debugger.send_debugger_command("step", [])
	return { "success": true }

func step_out(_ei: EditorInterface, _params: Dictionary) -> Dictionary:
	if not _debugger.is_paused():
		return { "error": "not paused at breakpoint" }
	_debugger.send_debugger_command("finish", [])
	return { "success": true }

func continue_execution(_ei: EditorInterface, _params: Dictionary) -> Dictionary:
	if not _debugger.is_paused():
		return { "error": "not paused at breakpoint" }
	_debugger.send_debugger_command("continue", [])
	return { "success": true }

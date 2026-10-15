@tool
extends Logger
## Captures error output while a script is being validated (Godot 4.5+ only).
## Loaded dynamically by ScriptHandler so older Godot versions never parse it.

var _mutex := Mutex.new()
var messages: Array[String] = []

func _log_error(function: String, file: String, line: int, code: String, rationale: String, editor_notify: bool, error_type: int, script_backtraces: Array[ScriptBacktrace]) -> void:
	var text := rationale if not rationale.is_empty() else code
	if line > 0:
		text = "line %d: %s" % [line, text]
	_mutex.lock()
	messages.append(text)
	_mutex.unlock()

func _log_message(message: String, error: bool) -> void:
	if not error:
		return
	_mutex.lock()
	messages.append(message.strip_edges())
	_mutex.unlock()

@tool
extends EditorPlugin

const _DebuggerScript = preload("res://addons/godot_mcp_bridge/debugger_plugin.gd")
const _BridgeServerScript = preload("res://addons/godot_mcp_bridge/bridge_server.gd")

var _bridge_server
var _debugger_plugin

func _enter_tree() -> void:
	# Skip bridge in headless/export mode
	if DisplayServer.get_name() == "headless":
		return

	_debugger_plugin = _DebuggerScript.new()
	_debugger_plugin.set_editor_interface(get_editor_interface())
	add_debugger_plugin(_debugger_plugin)

	_bridge_server = _BridgeServerScript.new()
	_bridge_server.editor_interface = get_editor_interface()
	add_child(_bridge_server)
	_bridge_server.set_debugger(_debugger_plugin)
	_bridge_server.set_profiler_handler(_debugger_plugin)
	_bridge_server.start()
	print("[Claude Bridge] Started on port 6008")

func _exit_tree() -> void:
	if _bridge_server:
		_bridge_server.stop()
		_bridge_server.queue_free()
		_bridge_server = null
	if _debugger_plugin:
		remove_debugger_plugin(_debugger_plugin)
		_debugger_plugin = null
	print("[Claude Bridge] Stopped")

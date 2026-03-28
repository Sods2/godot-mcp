@tool
extends EditorPlugin

var _bridge_server: BridgeServer
var _debugger_plugin: ClaudeBridgeDebugger

func _enter_tree() -> void:
	# Skip bridge in headless/export mode
	if DisplayServer.get_name() == "headless":
		return

	_debugger_plugin = ClaudeBridgeDebugger.new()
	add_debugger_plugin(_debugger_plugin)

	_bridge_server = BridgeServer.new()
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

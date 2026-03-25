@tool
extends EditorPlugin

var _bridge_server: BridgeServer

func _enter_tree() -> void:
	_bridge_server = BridgeServer.new()
	_bridge_server.editor_interface = get_editor_interface()
	add_child(_bridge_server)
	_bridge_server.start()
	print("[Claude Bridge] Started on port 6008")

func _exit_tree() -> void:
	if _bridge_server:
		_bridge_server.stop()
		_bridge_server.queue_free()
		_bridge_server = null
	print("[Claude Bridge] Stopped")

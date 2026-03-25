@tool
class_name BridgeServer
extends Node

var editor_interface: EditorInterface
var _tcp_server: TCPServer
var _client: StreamPeerTCP = null
var _protocol: BridgeProtocol = BridgeProtocol.new()

# Handlers (populated in _ready)
var _scene_handler: SceneHandler
var _inspector_handler: InspectorHandler
var _script_handler: ScriptHandler
var _run_handler: RunHandler
var _screenshot_handler: ScreenshotHandler

func _ready() -> void:
	_scene_handler = SceneHandler.new()
	_inspector_handler = InspectorHandler.new()
	_script_handler = ScriptHandler.new()
	_run_handler = RunHandler.new()
	_screenshot_handler = ScreenshotHandler.new()

func start(port: int = 6008) -> void:
	_tcp_server = TCPServer.new()
	var err := _tcp_server.listen(port, "127.0.0.1")
	if err != OK:
		push_error("[Claude Bridge] Failed to listen on port %d: %s" % [port, error_string(err)])

func stop() -> void:
	if _client:
		_client.disconnect_from_host()
		_client = null
	if _tcp_server:
		_tcp_server.stop()
		_tcp_server = null

func _process(_delta: float) -> void:
	if _tcp_server == null:
		return

	# Accept new connection if no client
	if _client == null and _tcp_server.is_connection_available():
		_client = _tcp_server.take_connection()
		_protocol = BridgeProtocol.new()  # Fresh parser for new connection
		print("[Claude Bridge] Client connected")

	if _client == null:
		return

	# Check client still connected
	if _client.get_status() != StreamPeerTCP.STATUS_CONNECTED:
		print("[Claude Bridge] Client disconnected")
		_client = null
		return

	# Read available data
	var available := _client.get_available_bytes()
	if available > 0:
		var data := _client.get_data(available)
		if data[0] == OK:
			var messages := _protocol.feed(data[1])
			for msg in messages:
				_handle_message(msg)

func _handle_message(msg: Dictionary) -> void:
	var id = msg.get("id", null)
	var method: String = msg.get("method", "")
	var params: Dictionary = msg.get("params", {})

	var result = null
	var error_msg = ""

	match method:
		"editor.status":
			result = _handle_editor_status()
		"scene.get_tree":
			result = _scene_handler.get_tree(editor_interface, params)
		"scene.get_selected":
			result = _scene_handler.get_selected(editor_interface)
		"scene.add_node":
			result = _scene_handler.add_node(editor_interface, params)
		"scene.remove_node":
			result = _scene_handler.remove_node(editor_interface, params)
		"scene.reparent_node":
			result = _scene_handler.reparent_node(editor_interface, params)
		"scene.open":
			result = _scene_handler.open_scene(editor_interface, params)
		"scene.save":
			result = _scene_handler.save_scene(editor_interface)
		"inspector.get_properties":
			result = _inspector_handler.get_properties(editor_interface, params)
		"inspector.set_property":
			result = _inspector_handler.set_property(editor_interface, params)
		"script.get_current":
			result = _script_handler.get_current(editor_interface)
		"script.get_open":
			result = _script_handler.get_open(editor_interface)
		"script.get_selected_code":
			result = _script_handler.get_selected_code(editor_interface)
		"script.insert_at_cursor":
			result = _script_handler.insert_at_cursor(editor_interface, params)
		"run.play":
			result = _run_handler.play(editor_interface, params)
		"run.stop":
			result = _run_handler.stop(editor_interface)
		"run.is_running":
			result = _run_handler.is_running(editor_interface)
		"run.get_output":
			result = _run_handler.get_output()
		"screenshot.viewport":
			result = _screenshot_handler.capture_viewport(editor_interface)
		_:
			error_msg = "Unknown method: " + method

	if error_msg != "":
		_send(_client, BridgeProtocol.encode_error(id, -32601, error_msg))
	else:
		_send(_client, BridgeProtocol.encode_response(id, result))

func _handle_editor_status() -> Dictionary:
	var open_scenes: Array[String] = []
	for i in range(EditorInterface.get_open_scenes().size()):
		open_scenes.append(EditorInterface.get_open_scenes()[i])
	return {
		"connected": true,
		"open_scenes": open_scenes,
		"is_playing": EditorInterface.is_playing_scene()
	}

func _send(peer: StreamPeerTCP, data: PackedByteArray) -> void:
	if peer and peer.get_status() == StreamPeerTCP.STATUS_CONNECTED:
		peer.put_data(data)

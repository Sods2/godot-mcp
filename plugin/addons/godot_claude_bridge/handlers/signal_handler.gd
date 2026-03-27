@tool
class_name SignalHandler
extends RefCounted

func list_signals(editor_interface: EditorInterface, params: Dictionary) -> Dictionary:
	var root = editor_interface.get_edited_scene_root()
	if not root:
		return {"error": "No scene open"}
	var node_path: String = params.get("path", "")
	var node: Node = root.get_node_or_null(node_path) if node_path != "" else root
	if not node:
		return {"error": "Node not found: " + node_path}
	var signals_list: Array = []
	for sig in node.get_signal_list():
		var args_list: Array = []
		for arg in sig.get("args", []):
			args_list.append({"name": arg.get("name", ""), "type": type_string(arg.get("type", 0))})
		signals_list.append({"name": sig.get("name", ""), "args": args_list})
	return {"node": str(node.get_path()), "signals": signals_list}

func connect_signal(editor_interface: EditorInterface, params: Dictionary) -> Dictionary:
	var root = editor_interface.get_edited_scene_root()
	if not root:
		return {"error": "No scene open"}
	var from_node: Node = root.get_node_or_null(params.get("from_path", ""))
	if not from_node:
		return {"error": "Source node not found: " + params.get("from_path", "")}
	var to_node: Node = root.get_node_or_null(params.get("to_path", ""))
	if not to_node:
		return {"error": "Target node not found: " + params.get("to_path", "")}
	var signal_name: String = params.get("signal_name", "")
	var method_name: String = params.get("method", "")
	var flags: int = params.get("flags", 0)
	if not from_node.has_signal(signal_name):
		return {"error": "Signal not found: " + signal_name}
	var callable = Callable(to_node, method_name)
	var undo_redo = editor_interface.get_editor_undo_redo()
	undo_redo.create_action("Connect Signal")
	undo_redo.add_do_method(from_node, "connect", signal_name, callable, flags)
	undo_redo.add_undo_method(from_node, "disconnect", signal_name, callable)
	undo_redo.commit_action()
	return {"success": true}

func disconnect_signal(editor_interface: EditorInterface, params: Dictionary) -> Dictionary:
	var root = editor_interface.get_edited_scene_root()
	if not root:
		return {"error": "No scene open"}
	var from_node: Node = root.get_node_or_null(params.get("from_path", ""))
	if not from_node:
		return {"error": "Source node not found: " + params.get("from_path", "")}
	var to_node: Node = root.get_node_or_null(params.get("to_path", ""))
	if not to_node:
		return {"error": "Target node not found: " + params.get("to_path", "")}
	var signal_name: String = params.get("signal_name", "")
	var method_name: String = params.get("method", "")
	var callable = Callable(to_node, method_name)
	if not from_node.is_connected(signal_name, callable):
		return {"error": "Signal not connected"}
	var undo_redo = editor_interface.get_editor_undo_redo()
	undo_redo.create_action("Disconnect Signal")
	undo_redo.add_do_method(from_node, "disconnect", signal_name, callable)
	undo_redo.add_undo_method(from_node, "connect", signal_name, callable)
	undo_redo.commit_action()
	return {"success": true}

func list_connections(editor_interface: EditorInterface, params: Dictionary) -> Dictionary:
	var root = editor_interface.get_edited_scene_root()
	if not root:
		return {"error": "No scene open"}
	var node_path: String = params.get("path", "")
	var node: Node = root.get_node_or_null(node_path) if node_path != "" else root
	if not node:
		return {"error": "Node not found: " + node_path}
	var connections: Array = []
	for sig in node.get_signal_list():
		var sig_name: String = sig.get("name", "")
		for conn in node.get_signal_connection_list(sig_name):
			connections.append({
				"signal": sig_name,
				"from": str(node.get_path()),
				"to": str(conn.get("callable", Callable()).get_object().get_path()) if conn.get("callable", Callable()).get_object() else "",
				"method": conn.get("callable", Callable()).get_method() if conn.get("callable", Callable()).is_valid() else "",
				"flags": conn.get("flags", 0)
			})
	return {"connections": connections}

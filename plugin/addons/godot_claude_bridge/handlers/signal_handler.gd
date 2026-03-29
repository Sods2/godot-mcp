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
	var rel_path: String
	if root != null and node != root:
		rel_path = str(root.get_path_to(node))
	else:
		rel_path = "."
	return {"node": rel_path, "signals": signals_list}

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
	if not to_node.has_method(method_name):
		return {"error": "Target node has no method: " + method_name}
	from_node.connect(signal_name, callable, flags)
	return {"success": true, "warning": "Runtime connection only — will not persist when the scene is saved/reloaded"}

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
	from_node.disconnect(signal_name, callable)
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
			var callable: Callable = conn.get("callable", Callable())
			if not callable.is_valid():
				continue
			var target_obj = callable.get_object()
			if target_obj == null:
				continue
			# Filter out editor-internal connections (target not owned by scene)
			if target_obj is Node:
				var target_node: Node = target_obj as Node
				if target_node != root and target_node.owner != root:
					continue
				connections.append({
					"signal": sig_name,
					"from": str(root.get_path_to(node)),
					"to": str(root.get_path_to(target_node)),
					"method": callable.get_method(),
					"flags": conn.get("flags", 0)
				})
	return {"connections": connections}

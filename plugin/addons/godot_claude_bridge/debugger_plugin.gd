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
var _output_panel_start: int = 0  # Text length at session start
var _hierarchy_dumped: bool = false  # One-shot diagnostic flag

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
	var session := get_session(session_id)
	if session == null:
		return
	_active_session = session
	_is_paused = false
	_stack_frames = []
	_locals = []
	_output_lines.clear()
	_capture_logged = false
	# Record current output panel length so we only return new output
	_output_panel_start = _get_output_panel_text().length()
	# Apply any pre-set breakpoints to the new session
	for bp in _breakpoints:
		session.set_breakpoint(bp.file, bp.line, true)

func _on_session_stopped(session_id: int) -> void:
	_is_paused = false
	_stack_frames = []
	_locals = []
	_active_session = null

func _on_session_breaked(can_debug: bool) -> void:
	_is_paused = true
	_stack_frames = []
	_locals = []
	if not _hierarchy_dumped:
		_hierarchy_dumped = true
		# Deferred so the debugger UI has time to populate
		call_deferred("_dump_editor_hierarchy")

func _on_session_continued() -> void:
	_is_paused = false
	_stack_frames = []
	_locals = []

func _capture(message: String, data: Array, session_id: int) -> bool:
	var msg := message
	if not _capture_logged:
		_capture_logged = true
		print("[Claude Bridge] Capture active (first message: %s)" % msg)
	# Diagnostics: log relevant capture messages with data type info
	if msg == "stack_dump" or msg == "stack_frame_vars" or msg == "output" \
		or msg.begins_with("servers:") or msg.begins_with("scripts:"):
		var type_info := ""
		for i in range(min(data.size(), 3)):
			type_info += type_string(typeof(data[i])) + " "
		print("[Claude Bridge] _capture: msg=%s data_size=%d types=[%s]" % [msg, data.size(), type_info.strip_edges()])

	# Native debugger: stack dump sent automatically when breaking or in response to get_stack_dump
	if msg == "stack_dump":
		_stack_frames = []
		if data.size() > 0 and data[0] is Dictionary:
			# Custom/legacy format: array of dicts
			for frame in data:
				if frame is Dictionary:
					_stack_frames.append(frame)
		else:
			# Godot native flat format: [file, line, func, file, line, func, ...]
			var i := 0
			while i + 2 < data.size():
				_stack_frames.append({
					"file": str(data[i]),
					"line": int(data[i + 1]),
					"function": str(data[i + 2]),
					"id": i / 3
				})
				i += 3
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
	# Godot 4 format: [PackedStringArray(messages), PackedInt32Array(types)]
	if msg == "output":
		if data.size() >= 1:
			var messages = data[0]
			if messages is PackedStringArray:
				for text in messages:
					var line: String = str(text).strip_edges()
					if line != "":
						_output_lines.append(line)
			elif messages is Array:
				for text in messages:
					var line: String = str(text).strip_edges()
					if line != "":
						_output_lines.append(line)
			else:
				# Unexpected format: stringify everything
				for item in data:
					var line: String = str(item).strip_edges()
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

	# Profiler frame data from built-in profilers (servers + scripts)
	if msg == "servers:profile_frame" or msg == "scripts:profile_frame":
		var frame_info := {}
		frame_info["profiler"] = "servers" if msg.begins_with("servers:") else "scripts"
		if data.size() >= 2:
			var names = data[0]
			var values = data[1]
			var entries: Array = []
			if names is PackedStringArray:
				for j in range(names.size()):
					entries.append({
						"name": names[j],
						"value": float(values[j]) if j < values.size() else 0.0
					})
			frame_info["entries"] = entries
		else:
			frame_info["raw_size"] = data.size()
		_profiler_data.append(frame_info)
		return true

	return false

func get_stack_frames() -> Array:
	if not _stack_frames.is_empty():
		return _stack_frames
	# Fallback: read from the editor's debugger UI
	return _read_stack_from_editor_ui()

func get_locals() -> Array:
	if not _locals.is_empty():
		return _locals
	# Fallback: read from the editor's debugger UI
	return _read_locals_from_editor_ui()

func is_paused() -> bool:
	return _is_paused

func get_output_lines() -> Array:
	# If _capture received output lines, use those
	if not _output_lines.is_empty():
		return _output_lines.duplicate()
	# Fallback: read from the editor's Output panel (EditorLog)
	var full_text := _get_output_panel_text()
	if full_text.length() > _output_panel_start:
		var new_text := full_text.substr(_output_panel_start)
		var lines: Array = []
		for line in new_text.split("\n"):
			var trimmed := line.strip_edges()
			if trimmed != "":
				lines.append(trimmed)
		return lines
	return []

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
	if not _profiler_data.is_empty():
		return _profiler_data.duplicate()
	# Fallback: basic performance metrics available without game-side capture
	return [_get_performance_snapshot()]

func _get_performance_snapshot() -> Dictionary:
	return {
		"profiler": "performance",
		"entries": [
			{"name": "fps", "value": Performance.get_monitor(Performance.TIME_FPS)},
			{"name": "process_time_ms", "value": Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0},
			{"name": "physics_process_time_ms", "value": Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0},
			{"name": "static_memory_mb", "value": Performance.get_monitor(Performance.MEMORY_STATIC) / 1048576.0},
			{"name": "object_count", "value": Performance.get_monitor(Performance.OBJECT_COUNT)},
			{"name": "nodes_count", "value": Performance.get_monitor(Performance.OBJECT_NODE_COUNT)},
			{"name": "render_draw_calls", "value": Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)},
		]
	}

# --- Diagnostic: one-shot hierarchy dump to editor console ---

func _dump_editor_hierarchy() -> void:
	var base := _get_editor_base()
	if base == null:
		print("[DIAG] No editor base control found")
		return

	var all := _get_all_children(base)

	# Part 1: All RichTextLabel nodes (for Bug 1 - output panel)
	print("[DIAG] === RichTextLabel nodes in editor ===")
	for child in all:
		if child is RichTextLabel:
			var path := _node_ancestor_chain(child, 4)
			var text_len: int = child.get_parsed_text().length()
			print("[DIAG] RTL: %s  text_len=%d" % [path, text_len])

	# Part 2: Find ScriptEditorDebugger and dump its Tree nodes (for Bug 2)
	print("[DIAG] === ScriptEditorDebugger search ===")
	var debugger_count := 0
	for child in all:
		if child.get_class() == "ScriptEditorDebugger" or child.is_class("ScriptEditorDebugger"):
			debugger_count += 1
			print("[DIAG] Debugger #%d: %s" % [debugger_count, _node_ancestor_chain(child, 3)])
			# Dump all Tree children of this debugger
			for sub in _get_all_children(child):
				if sub is Tree:
					var cols: int = sub.get_columns()
					var root: TreeItem = sub.get_root()
					var item_count := 0
					var sample := ""
					if root != null:
						var item := root.get_first_child()
						while item != null:
							item_count += 1
							if item_count <= 2:
								var texts := []
								for c in range(cols):
									texts.append(item.get_text(c))
								sample += "  row%d: %s" % [item_count, str(texts)]
							item = item.get_next()
					print("[DIAG]   Tree: %s  cols=%d items=%d%s" % [
						_node_ancestor_chain(sub, 5), cols, item_count, sample])
	if debugger_count == 0:
		print("[DIAG] No ScriptEditorDebugger found")

	# Part 3: TabContainer tabs (for output panel tab search)
	print("[DIAG] === TabContainers ===")
	for child in all:
		if child is TabContainer:
			var tabs := []
			for i in range(child.get_tab_count()):
				tabs.append(child.get_tab_title(i))
			print("[DIAG] TabContainer: %s  tabs=%s" % [_node_ancestor_chain(child, 3), str(tabs)])

func _node_ancestor_chain(node: Node, depth: int) -> String:
	var parts: Array[String] = []
	var current: Node = node
	for i in range(depth):
		if current == null:
			break
		parts.push_front("%s(%s)" % [current.name, current.get_class()])
		current = current.get_parent()
	return " > ".join(parts)

# --- Editor UI reading (fallback for built-in messages that bypass _capture) ---

func _get_editor_base() -> Control:
	if _editor_interface != null:
		return _editor_interface.get_base_control()
	return EditorInterface.get_base_control()

func _get_output_panel_text() -> String:
	var base := _get_editor_base()
	if base == null:
		return ""
	# Strategy 1: parent class is "EditorLog" (Godot 4.x prior to 4.5)
	var rtl := _find_node_of_class(base, "RichTextLabel", "EditorLog")
	if rtl != null:
		return rtl.get_parsed_text()
	# Strategies 2-4: traverse once and try progressively broader matches
	var all_children := _get_all_children(base)
	# Strategy 2: parent node NAME contains "log" or "output" (case-insensitive)
	for child in all_children:
		if child is RichTextLabel and child.get_parent() != null:
			var parent_name: String = child.get_parent().name
			if parent_name.containsn("log") or parent_name.containsn("output"):
				return child.get_parsed_text()
	# Strategy 3: find the tab labelled "Output" in any TabContainer
	for child in all_children:
		if child is TabContainer:
			for tab_idx in range(child.get_tab_count()):
				if child.get_tab_title(tab_idx).containsn("output"):
					var tab_control: Control = child.get_tab_control(tab_idx)
					if tab_control != null:
						for sub in _get_all_children(tab_control):
							if sub is RichTextLabel:
								return sub.get_parsed_text()
	# Strategy 4: largest RichTextLabel with any content (last resort)
	var best_rtl: RichTextLabel = null
	var best_len: int = 0
	for child in all_children:
		if child is RichTextLabel:
			var text: String = child.get_parsed_text()
			if text.length() > best_len:
				best_rtl = child
				best_len = text.length()
	if best_rtl != null:
		return best_rtl.get_parsed_text()
	return ""

func _read_stack_from_editor_ui() -> Array:
	var base := _get_editor_base()
	if base == null:
		return []
	var debugger := _find_node_of_class(base, "ScriptEditorDebugger")
	if debugger == null:
		return []
	# Strategy 1: find first Tree in the "Stack Trace" tab (Godot 4.5+, 1-column format)
	var stack_tree := _find_stack_trace_tree(debugger)
	if stack_tree != null:
		var frames := _extract_stack_frames(stack_tree)
		if not frames.is_empty():
			return frames
	# Strategy 2 (fallback): scan all Trees, check any column for a file path
	var frames := []
	for child in _get_all_children(debugger):
		if not (child is Tree):
			continue
		var root: TreeItem = child.get_root()
		if root == null:
			continue
		var first := root.get_first_child()
		if first == null:
			continue
		var cols: int = child.get_columns()
		var file_col: int = -1
		for c in range(cols):
			if _looks_like_file_path(first.get_text(c)):
				file_col = c
				break
		if file_col == -1:
			continue
		var item := first
		while item != null:
			var frame := {}
			if cols >= 3:
				frame["function"] = item.get_text(0)
				frame["file"] = item.get_text(1)
				frame["line"] = item.get_text(2).to_int()
			elif cols == 2:
				if file_col == 1:
					frame["function"] = item.get_text(0)
					frame["file"] = item.get_text(1)
				else:
					frame["file"] = item.get_text(0)
					frame["function"] = item.get_text(1)
			else:
				frame = _parse_single_column_stack_entry(item.get_text(0))
			frame["id"] = frames.size()
			frames.append(frame)
			item = item.get_next()
		if not frames.is_empty():
			return frames
	return frames

func _read_locals_from_editor_ui() -> Array:
	var base := _get_editor_base()
	if base == null:
		return []
	var debugger := _find_node_of_class(base, "ScriptEditorDebugger")
	if debugger == null:
		return []
	# Strategy 1: find second Tree in the "Stack Trace" tab (Godot 4.5+, locals/inspector)
	var locals_tree := _find_locals_tree(debugger)
	if locals_tree != null:
		var locals := _extract_locals_from_tree(locals_tree)
		if not locals.is_empty():
			return locals
	# Strategy 2 (fallback): scan all Trees, skip stack trees and known non-locals trees
	var locals := []
	for child in _get_all_children(debugger):
		if not (child is Tree):
			continue
		var root: TreeItem = child.get_root()
		if root == null:
			continue
		var first := root.get_first_child()
		if first == null:
			continue
		var cols: int = child.get_columns()
		# Skip stack trees (any column has a file path)
		var is_stack := false
		for c in range(cols):
			if _looks_like_file_path(first.get_text(c)):
				is_stack = true
				break
		if is_stack:
			continue
		# Skip trees where the first item has no name (profiler, monitors, etc.)
		var first_text: String = first.get_text(0).strip_edges()
		if first_text.is_empty() or first_text == "Time":
			continue
		var item := first
		while item != null:
			var name_text: String = item.get_text(0).strip_edges()
			var val_text: String = ""
			if cols >= 2:
				val_text = item.get_text(1).strip_edges()
			if name_text != "":
				locals.append({"name": name_text, "value": val_text})
			item = item.get_next()
		if not locals.is_empty():
			return locals
	return locals

func _find_node_of_class(root: Node, class_name_str: String, parent_class: String = "") -> Node:
	for child in _get_all_children(root):
		if child.get_class() == class_name_str or child.is_class(class_name_str):
			if parent_class == "":
				return child
			# Check ancestors up to 3 levels (handles intermediate containers like VBoxContainer)
			var ancestor: Node = child.get_parent()
			for _i in range(3):
				if ancestor == null:
					break
				if ancestor.get_class() == parent_class or ancestor.is_class(parent_class):
					return child
				ancestor = ancestor.get_parent()
	return null

func _get_all_children(node: Node) -> Array:
	var result: Array = []
	var stack: Array = [node]
	while not stack.is_empty():
		var current: Node = stack.pop_back()
		for child in current.get_children():
			result.append(child)
			stack.append(child)
	return result

func _looks_like_file_path(text: String) -> bool:
	var t := text.strip_edges()
	return t.begins_with("res://") or t.ends_with(".gd") or t.ends_with(".cs") or t.ends_with(".tscn")

# Find the first Tree node inside the "Stack Trace" tab of the debugger (the stack tree)
func _find_stack_trace_tree(debugger: Node) -> Tree:
	for child in _get_all_children(debugger):
		if child is TabContainer:
			for tab_idx in range(child.get_tab_count()):
				if child.get_tab_title(tab_idx).containsn("stack"):
					var tab_control: Control = child.get_tab_control(tab_idx)
					if tab_control == null:
						continue
					for sub in _get_all_children(tab_control):
						if sub is Tree:
							return sub
	return null

# Find the second Tree node inside the "Stack Trace" tab of the debugger (the locals/inspector tree)
func _find_locals_tree(debugger: Node) -> Tree:
	for child in _get_all_children(debugger):
		if child is TabContainer:
			for tab_idx in range(child.get_tab_count()):
				if child.get_tab_title(tab_idx).containsn("stack"):
					var tab_control: Control = child.get_tab_control(tab_idx)
					if tab_control == null:
						continue
					var tree_count := 0
					for sub in _get_all_children(tab_control):
						if sub is Tree:
							tree_count += 1
							if tree_count == 2:
								return sub
	return null

# Extract stack frames from a Tree, handling 1-col, 2-col, and 3-col formats
func _extract_stack_frames(tree: Tree) -> Array:
	var frames := []
	var root: TreeItem = tree.get_root()
	if root == null:
		return frames
	var cols: int = tree.get_columns()
	var item := root.get_first_child()
	while item != null:
		var frame := {}
		if cols >= 3:
			frame["function"] = item.get_text(0)
			frame["file"] = item.get_text(1)
			frame["line"] = item.get_text(2).to_int()
		elif cols == 2:
			if _looks_like_file_path(item.get_text(1)):
				frame["function"] = item.get_text(0)
				frame["file"] = item.get_text(1)
			else:
				frame["file"] = item.get_text(0)
				frame["function"] = item.get_text(1)
		else:
			frame = _parse_single_column_stack_entry(item.get_text(0))
		frame["id"] = frames.size()
		frames.append(frame)
		item = item.get_next()
	return frames

# Parse a single-column stack entry in "file:line" or plain "file" format
func _parse_single_column_stack_entry(text: String) -> Dictionary:
	var t := text.strip_edges()
	var frame := {"file": t, "function": "", "line": 0}
	var colon_idx := t.rfind(":")
	if colon_idx > 0:
		var after_colon := t.substr(colon_idx + 1)
		if after_colon.is_valid_int():
			frame["file"] = t.substr(0, colon_idx)
			frame["line"] = after_colon.to_int()
	return frame

# Extract locals name/value pairs from a Tree, handling 1-col and 2-col formats
func _extract_locals_from_tree(tree: Tree) -> Array:
	var locals := []
	var root: TreeItem = tree.get_root()
	if root == null:
		return locals
	var cols: int = tree.get_columns()
	var item := root.get_first_child()
	while item != null:
		var name_text: String = item.get_text(0).strip_edges()
		var val_text: String = ""
		if cols >= 2:
			val_text = item.get_text(1).strip_edges()
		if name_text != "":
			locals.append({"name": name_text, "value": val_text})
		item = item.get_next()
	return locals

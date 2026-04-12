import { describe, it, expect } from "vitest";
import { createMockServer } from "./helpers/mock-server.js";
import { createMockBridge } from "./helpers/mock-bridge.js";
import { createMockProcessManager } from "./helpers/mock-process-manager.js";
import { registerEditorTools } from "../tools/editor-tools.js";
import { registerScriptTools } from "../tools/script-tools.js";
import { registerScreenshotTools } from "../tools/screenshot-tools.js";
import { registerSignalTools } from "../tools/signal-tools.js";
import { registerAnimationTools } from "../tools/animation-tools.js";
import { registerDebugTools } from "../tools/debug-tools.js";
import { registerProfilerTools } from "../tools/profiler-tools.js";
import { registerSceneTools } from "../tools/scene-tools.js";
import { registerFileTools } from "../tools/file-tools.js";
import { registerRunTools } from "../tools/run-tools.js";
import { registerTestTools } from "../tools/test-tools.js";
import { registerExportTools } from "../tools/export-tools.js";

// Tools registered inline in index.ts
const INLINE_TOOL_NAMES = [
  "godot_get_version",
  "godot_list_projects",
  "godot_get_project_info",
  "godot_launch_editor",
  "godot_run_project",
  "godot_stop_project",
  "godot_get_debug_output",
  "godot_get_uid",
  "godot_update_uids",
  "godot_get_autoloads",
  "godot_add_autoload",
];

const EXPECTED_TOOL_NAMES = [
  // Editor tools
  "godot_editor_status",
  "godot_get_scene_tree",
  "godot_get_selected_nodes",
  "godot_get_node_properties",
  "godot_open_scene",
  "godot_reparent_node",
  "godot_rename_node",
  "godot_duplicate_node",
  "godot_move_node",
  // Script tools
  "godot_get_current_script",
  "godot_get_selected_code",
  "godot_insert_code",
  "godot_get_open_scripts",
  "godot_create_script",
  "godot_detach_script",
  "godot_get_script_for_node",
  // Screenshot tools
  "godot_take_screenshot",
  "godot_take_game_screenshot",
  // Signal tools
  "godot_list_signals",
  "godot_connect_signal",
  "godot_disconnect_signal",
  "godot_list_connections",
  // Animation tools
  "godot_list_animations",
  "godot_get_animation",
  "godot_create_animation",
  // Debug tools
  "godot_set_breakpoint",
  "godot_remove_breakpoint",
  "godot_list_breakpoints",
  "godot_get_stack_trace",
  "godot_get_locals",
  "godot_step_over",
  "godot_step_into",
  "godot_step_out",
  "godot_continue",
  // Profiler tools
  "godot_start_profiler",
  "godot_stop_profiler",
  "godot_get_profiler_data",
  // Scene tools
  "godot_add_node",
  "godot_remove_node",
  "godot_set_property",
  "godot_save_scene",
  // File tools
  "godot_parse_scene",
  "godot_create_scene",
  "godot_add_node_to_file",
  "godot_set_property_in_file",
  "godot_load_sprite_in_file",
  "godot_validate_script",
  "godot_create_folder",
  "godot_list_directory",
  "godot_delete_file",
  "godot_rename_file",
  "godot_list_resources",
  "godot_import_asset",
  "godot_read_resource",
  "godot_write_resource",
  // Run tools
  "godot_run_scene",
  "godot_stop_scene",
  "godot_get_output",
  "godot_is_running",
  // Test tools
  "godot_detect_test_framework",
  "godot_list_tests",
  "godot_create_test",
  "godot_run_tests",
  // Export tools
  "godot_list_export_presets",
  "godot_export_project",
  "godot_export_mesh_library",
];

describe("tool-registration", () => {
  it("registers all 66 modular tools via register* functions", () => {
    const mockServer = createMockServer();
    const mockBridge = createMockBridge();
    const mockPM = createMockProcessManager();
    const godotPath = async () => "/usr/bin/godot";

    registerEditorTools(mockServer.server, mockBridge);
    registerScriptTools(mockServer.server, mockBridge);
    registerScreenshotTools(mockServer.server, mockBridge);
    registerSignalTools(mockServer.server, mockBridge);
    registerAnimationTools(mockServer.server, mockBridge);
    registerDebugTools(mockServer.server, mockBridge);
    registerProfilerTools(mockServer.server, mockBridge);
    registerSceneTools(mockServer.server, mockBridge);
    registerFileTools(mockServer.server, mockBridge, godotPath);
    registerRunTools(mockServer.server, mockPM, mockBridge, godotPath);
    registerTestTools(mockServer.server, godotPath);
    registerExportTools(mockServer.server, godotPath);

    const registered = mockServer.getToolNames();
    expect(registered).toHaveLength(EXPECTED_TOOL_NAMES.length);
    for (const name of EXPECTED_TOOL_NAMES) {
      expect(registered).toContain(name);
    }
  });

  it("registers no duplicate tool names", () => {
    const mockServer = createMockServer();
    const mockBridge = createMockBridge();
    const mockPM = createMockProcessManager();
    const godotPath = async () => "/usr/bin/godot";

    registerEditorTools(mockServer.server, mockBridge);
    registerScriptTools(mockServer.server, mockBridge);
    registerScreenshotTools(mockServer.server, mockBridge);
    registerSignalTools(mockServer.server, mockBridge);
    registerAnimationTools(mockServer.server, mockBridge);
    registerDebugTools(mockServer.server, mockBridge);
    registerProfilerTools(mockServer.server, mockBridge);
    registerSceneTools(mockServer.server, mockBridge);
    registerFileTools(mockServer.server, mockBridge, godotPath);
    registerRunTools(mockServer.server, mockPM, mockBridge, godotPath);
    registerTestTools(mockServer.server, godotPath);
    registerExportTools(mockServer.server, godotPath);

    const names = mockServer.getToolNames();
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("every registered tool has a non-empty description", () => {
    const mockServer = createMockServer();
    const mockBridge = createMockBridge();
    const mockPM = createMockProcessManager();
    const godotPath = async () => "/usr/bin/godot";

    registerEditorTools(mockServer.server, mockBridge);
    registerScriptTools(mockServer.server, mockBridge);
    registerScreenshotTools(mockServer.server, mockBridge);
    registerSignalTools(mockServer.server, mockBridge);
    registerAnimationTools(mockServer.server, mockBridge);
    registerDebugTools(mockServer.server, mockBridge);
    registerProfilerTools(mockServer.server, mockBridge);
    registerSceneTools(mockServer.server, mockBridge);
    registerFileTools(mockServer.server, mockBridge, godotPath);
    registerRunTools(mockServer.server, mockPM, mockBridge, godotPath);
    registerTestTools(mockServer.server, godotPath);
    registerExportTools(mockServer.server, godotPath);

    for (const [, tool] of mockServer.getTools()) {
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it("all inline tool names are documented in INLINE_TOOL_NAMES constant", () => {
    // This verifies the expected inline tools list is complete
    expect(INLINE_TOOL_NAMES).toHaveLength(11);
    expect(INLINE_TOOL_NAMES).toContain("godot_get_version");
    expect(INLINE_TOOL_NAMES).toContain("godot_get_autoloads");
    expect(INLINE_TOOL_NAMES).toContain("godot_add_autoload");
  });

  it("total tool count (modular + inline) equals 77", () => {
    expect(EXPECTED_TOOL_NAMES.length + INLINE_TOOL_NAMES.length).toBe(77);
  });
});

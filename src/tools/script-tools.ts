import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BridgeConnection } from "../connection.js";
import type { CurrentScriptResponse, SelectedCodeResponse, InsertAtCursorResponse, OpenScriptsResponse } from "../types/bridge-responses.js";

export function registerScriptTools(
  server: McpServer,
  bridge: BridgeConnection
): void {
  server.tool(
    "godot_get_current_script",
    "Get the currently open script in the Godot editor (path, source, cursor position)",
    {},
    async () => {
      try {
        const result = await bridge.send<CurrentScriptResponse>("script.get_current");
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "godot_get_selected_code",
    "Get the currently selected code in the Godot script editor",
    {},
    async () => {
      try {
        const result = await bridge.send<SelectedCodeResponse>("script.get_selected_code");
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "godot_insert_code",
    "Insert code at the current cursor position in the Godot script editor",
    {
      text: z.string().describe("Code text to insert at cursor position"),
    },
    async ({ text }) => {
      try {
        const result = await bridge.send<InsertAtCursorResponse>("script.insert_at_cursor", { text });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "godot_get_open_scripts",
    "Get list of all open scripts in the Godot editor",
    {},
    async () => {
      try {
        const result = await bridge.send<OpenScriptsResponse>("script.get_open");
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "godot_create_script",
    "Create a new GDScript file and attach it to a node",
    {
      node_path: z.string().describe("Path to the node to attach the script to"),
      script_path: z.string().describe("res:// path where the script will be created (e.g. res://src/player.gd)"),
      template: z.string().optional().describe("Script content (default: minimal extends template)"),
    },
    async ({ node_path, script_path, template }) => {
      try {
        const result = await bridge.send<{ success: true; script_path: string }>("script.create_and_attach", { node_path, script_path, template });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "godot_detach_script",
    "Remove the script attached to a node",
    {
      node_path: z.string().describe("Path to the node to detach the script from"),
    },
    async ({ node_path }) => {
      try {
        const result = await bridge.send<{ success: true }>("script.detach", { node_path });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "godot_get_script_for_node",
    "Get the script path attached to a node",
    {
      node_path: z.string().describe("Node path in the scene tree"),
    },
    async ({ node_path }) => {
      try {
        const result = await bridge.send<{ script_path: string; class_name?: string } | { script: null }>("script.get_for_node", { path: node_path });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );
}

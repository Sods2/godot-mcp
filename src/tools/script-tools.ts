import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BridgeConnection } from "../connection.js";

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
        const result = await bridge.send("script.get_current");
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
        const result = await bridge.send("script.get_selected_code");
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
        const result = await bridge.send("script.insert_at_cursor", { text });
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
        const result = await bridge.send("script.get_open");
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
}

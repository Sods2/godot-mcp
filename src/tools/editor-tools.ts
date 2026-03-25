import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BridgeConnection } from "../connection.js";

export function registerEditorTools(
  server: McpServer,
  bridge: BridgeConnection
): void {
  server.tool(
    "godot_editor_status",
    "Get Godot editor status (connected, open scenes, playing state)",
    {},
    async () => {
      if (!bridge.connected) {
        return {
          content: [
            { type: "text", text: JSON.stringify({ connected: false }, null, 2) },
          ],
        };
      }
      try {
        const result = await bridge.send("editor.status");
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
    "godot_get_scene_tree",
    "Get the scene tree of the currently open scene",
    {
      max_depth: z
        .number()
        .optional()
        .describe("Maximum tree depth to return (default: unlimited)"),
    },
    async ({ max_depth }) => {
      try {
        const result = await bridge.send("scene.get_tree", {
          max_depth,
        });
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
    "godot_get_selected_nodes",
    "Get the currently selected nodes in the Godot editor",
    {},
    async () => {
      try {
        const result = await bridge.send("scene.get_selected");
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
    "godot_get_node_properties",
    "Get properties of a node by its path in the scene tree",
    {
      path: z.string().describe("Node path in the scene tree"),
    },
    async ({ path }) => {
      try {
        const result = await bridge.send("inspector.get_properties", {
          path,
        });
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
    "godot_open_scene",
    "Open a scene file in the Godot editor",
    {
      scene_path: z
        .string()
        .describe("Path to the scene file (res:// or absolute)"),
    },
    async ({ scene_path }) => {
      try {
        const result = await bridge.send("scene.open", { path: scene_path });
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
    "godot_reparent_node",
    "Move a node to a new parent in the scene tree",
    {
      path: z.string().describe("Current node path in the scene tree"),
      new_parent: z.string().describe("Path of the new parent node"),
    },
    async ({ path, new_parent }) => {
      try {
        const result = await bridge.send("scene.reparent_node", {
          path,
          new_parent,
        });
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

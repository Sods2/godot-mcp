import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BridgeConnection } from "../connection.js";
import type { EditorStatusResponse, SceneTreeResponse, SelectedNodesResponse, GetPropertiesResponse, OpenSceneResponse, ReparentNodeResponse, RenameNodeResponse, DuplicateNodeResponse, MoveNodeResponse } from "../types/bridge-responses.js";

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
        const result = await bridge.send<EditorStatusResponse>("editor.status");
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
      type_filter: z
        .string()
        .optional()
        .describe("Filter nodes by type (e.g. 'Sprite2D'). Children of non-matching nodes are still searched."),
    },
    async ({ max_depth, type_filter }) => {
      try {
        const result = await bridge.send<SceneTreeResponse>("scene.get_tree", {
          max_depth,
          type_filter,
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
        const result = await bridge.send<SelectedNodesResponse>("scene.get_selected");
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
      node_path: z.string().describe("Node path in the scene tree"),
    },
    async ({ node_path }) => {
      try {
        const result = await bridge.send<GetPropertiesResponse>("inspector.get_properties", {
          path: node_path,
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
        const result = await bridge.send<OpenSceneResponse>("scene.open", { path: scene_path });
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
      node_path: z.string().describe("Current node path in the scene tree"),
      new_parent: z.string().describe("Path of the new parent node"),
    },
    async ({ node_path, new_parent }) => {
      try {
        const result = await bridge.send<ReparentNodeResponse>("scene.reparent_node", {
          path: node_path,
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

  server.tool(
    "godot_rename_node",
    "Rename a node in the current scene",
    {
      node_path: z.string().describe("Node path in the scene tree"),
      new_name: z.string().describe("New name for the node"),
    },
    async ({ node_path, new_name }) => {
      try {
        const result = await bridge.send<RenameNodeResponse>("scene.rename_node", { path: node_path, new_name });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "godot_duplicate_node",
    "Duplicate a node in the current scene",
    {
      node_path: z.string().describe("Node path to duplicate"),
      new_name: z.string().optional().describe("Name for the duplicated node (default: auto-generated)"),
    },
    async ({ node_path, new_name }) => {
      try {
        const result = await bridge.send<DuplicateNodeResponse>("scene.duplicate_node", { path: node_path, new_name });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "godot_move_node",
    "Move a node to a different sibling index (reorder within parent)",
    {
      node_path: z.string().describe("Node path to move"),
      index: z.number().describe("Target sibling index (0 = first child)"),
    },
    async ({ node_path, index }) => {
      try {
        const result = await bridge.send<MoveNodeResponse>("scene.move_node", { path: node_path, index });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );
}

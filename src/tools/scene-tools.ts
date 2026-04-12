import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BridgeConnection } from "../connection.js";
import type { AddNodeResponse, RemoveNodeResponse, SetPropertyResponse, SaveSceneResponse } from "../types/bridge-responses.js";

const NOT_CONNECTED_MSG =
  "Editor plugin not connected — open project in Godot with godot_mcp_bridge addon enabled, or use godot_add_node_to_file for file-based editing";

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(e: unknown) {
  return {
    content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
    isError: true,
  };
}

export function registerSceneTools(server: McpServer, bridge: BridgeConnection) {
  server.tool(
    "godot_add_node",
    "Add a node to the current scene (requires editor plugin)",
    {
      project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
      scene_path: z.string().describe("Path to the scene file relative to project"),
      node_type: z.string().describe("Godot node type (e.g. Sprite2D, CharacterBody2D)"),
      node_name: z.string().describe("Name for the new node"),
      parent_path: z.string().optional().describe("Parent node path (default: root '.')"),
      properties: z.string().optional().describe("JSON object of properties to set on the node"),
    },
    async ({ node_type, node_name, parent_path, properties }) => {
      if (!bridge.connected) {
        return { ...textResult(NOT_CONNECTED_MSG), isError: true };
      }
      try {
        const parsedProps = properties ? JSON.parse(properties) : undefined;
        const result = await bridge.send<AddNodeResponse>("scene.add_node", {
          type: node_type,
          name: node_name,
          parent: parent_path ?? ".",
          properties: parsedProps,
        });
        return textResult(JSON.stringify(result, null, 2));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.tool(
    "godot_remove_node",
    "Remove a node from the current scene (requires editor plugin)",
    {
      node_path: z.string().describe("Node path to remove (e.g. 'Player/Sprite2D')"),
    },
    async ({ node_path }) => {
      if (!bridge.connected) {
        return { ...textResult(NOT_CONNECTED_MSG), isError: true };
      }
      try {
        const result = await bridge.send<RemoveNodeResponse>("scene.remove_node", { path: node_path });
        return textResult(JSON.stringify(result, null, 2));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.tool(
    "godot_set_property",
    "Set a property on a node in the current scene (requires editor plugin)",
    {
      node_path: z.string().describe("Node path (e.g. 'Player/Sprite2D')"),
      property: z.string().describe("Property name (e.g. 'position', 'texture')"),
      value: z.any().describe("Property value"),
    },
    async ({ node_path, property, value }) => {
      if (!bridge.connected) {
        return { ...textResult(NOT_CONNECTED_MSG), isError: true };
      }
      try {
        const result = await bridge.send<SetPropertyResponse>("inspector.set_property", {
          path: node_path,
          property,
          value,
        });
        return textResult(JSON.stringify(result, null, 2));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.tool(
    "godot_save_scene",
    "Save the current scene in the editor",
    {},
    async () => {
      if (!bridge.connected) {
        return textResult(
          "Scene is already on disk — no save needed when editing files directly"
        );
      }
      try {
        const result = await bridge.send<SaveSceneResponse>("scene.save", {});
        return textResult(JSON.stringify(result, null, 2));
      } catch (e) {
        return errorResult(e);
      }
    }
  );
}

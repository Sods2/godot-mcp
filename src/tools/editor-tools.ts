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
    "godot_close_scene",
    "Close an open scene tab in the Godot editor. If the scene has unsaved editor changes the call is refused unless force is true (then they are discarded and the result has discarded_unsaved_changes: true). open_scenes lists the tabs still open ([] when none).",
    {
      scene_path: z.string().describe("res:// path of the open scene to close"),
      force: z.boolean().optional().describe("Discard unsaved editor changes to the scene and close anyway. Default false (refuse)."),
    },
    async ({ scene_path, force }) => {
      try {
        const result = await bridge.send<Record<string, unknown>>("scene.close", {
          path: scene_path,
          ...(force ? { force: true } : {}),
        });
        const isErr = result && typeof result === "object" && "error" in result;
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          ...(isErr ? { isError: true } : {}),
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
    "godot_reload_project",
    "Restart the Godot editor to reload the project (EditorInterface.restart_editor). Before restarting, unsaved scenes are saved (save: true, default); if any can't be saved nothing is restarted. With save: false the call is refused while scenes have unsaved changes unless force is true (then they are discarded). The bridge disconnects during the restart; by default this waits until the NEW editor process answers.",
    {
      save: z.boolean().optional().describe("Save unsaved scenes before restarting (default true)."),
      force: z.boolean().optional().describe("With save: false, discard unsaved scene changes and restart anyway. Default false (refuse)."),
      wait_for_reconnect: z.boolean().optional().describe("Wait for the restarted editor to come back (default true)"),
      timeout_sec: z.number().optional().describe("Max seconds to wait for reconnect (default 90)"),
    },
    async ({ save, force, wait_for_reconnect, timeout_sec }) => {
      try {
        const ack = await bridge.send<Record<string, unknown>>("editor.reload_project", {
          save: save ?? true,
          ...(force ? { force: true } : {}),
        });
        if (ack && typeof ack === "object" && "error" in ack) {
          return { content: [{ type: "text", text: JSON.stringify(ack, null, 2) }], isError: true };
        }
        if (wait_for_reconnect === false) {
          return { content: [{ type: "text", text: JSON.stringify(ack, null, 2) }] };
        }
        const oldBoot = ack?.boot_id;
        const start = Date.now();
        const deadline = start + (timeout_sec ?? 90) * 1000;
        // Wait for the old connection to drop (restart fires ~0.5s after the ack).
        while (bridge.connected && Date.now() < start + 10000) await sleep(250);
        while (Date.now() < deadline) {
          await sleep(1000);
          bridge.reconnectNow();
          if (!bridge.connected) continue;
          try {
            const status = await bridge.send<Record<string, unknown>>("editor.status");
            // Only a different editor process counts: the old one may still be answering
            // (e.g. stuck on a dialog) and must not be reported as a successful restart.
            if (oldBoot !== undefined && status?.boot_id === oldBoot) continue;
            const result = { ...ack, reconnected: true, seconds: Math.round((Date.now() - start) / 1000), status };
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          } catch {
            /* not ready yet */
          }
        }
        return {
          content: [{ type: "text", text: `Error: editor restart requested but a restarted editor did not answer within ${timeout_sec ?? 90}s (the old editor may still be running, e.g. stuck on a dialog)` }],
          isError: true,
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

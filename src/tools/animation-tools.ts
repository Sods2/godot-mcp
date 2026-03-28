import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BridgeConnection } from "../connection.js";

export function registerAnimationTools(
  server: McpServer,
  bridge: BridgeConnection
): void {
  server.tool(
    "godot_list_animations",
    "List all animations in an AnimationPlayer node",
    {
      node_path: z.string().describe("Path to the AnimationPlayer node"),
    },
    async ({ node_path }) => {
      try {
        const result = await bridge.send<{
          node: string;
          animations: Array<{ name: string; length: number; track_count: number }>;
        }>("animation.list", { path: node_path });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "godot_get_animation",
    "Get detailed track and keyframe data for an animation",
    {
      node_path: z.string().describe("Path to the AnimationPlayer node"),
      animation_name: z.string().describe("Name of the animation"),
    },
    async ({ node_path, animation_name }) => {
      try {
        const result = await bridge.send<{
          name: string;
          length: number;
          loop_mode: number;
          tracks: Array<{ index: number; type: string; path: string; keys: Array<{ time: number; value: string }> }>;
        }>("animation.get", { path: node_path, animation_name });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "godot_create_animation",
    "Create a new animation in an AnimationPlayer node",
    {
      node_path: z.string().describe("Path to the AnimationPlayer node"),
      animation_name: z.string().describe("Name for the new animation"),
      length: z.number().describe("Duration in seconds"),
      loop_mode: z.number().optional().describe("Loop mode: 0=none, 1=linear, 2=ping-pong"),
      tracks: z.string().optional().describe("JSON array of track objects: [{path, keys: [{time, value}]}]"),
    },
    async ({ node_path, animation_name, length, loop_mode, tracks }) => {
      try {
        const parsedTracks = tracks ? JSON.parse(tracks) : [];
        const result = await bridge.send<{ success: true; animation_name: string; track_count: number }>(
          "animation.create",
          { path: node_path, animation_name, length, loop_mode: loop_mode ?? 0, tracks: parsedTracks }
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );
}

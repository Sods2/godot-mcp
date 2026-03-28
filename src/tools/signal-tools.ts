import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BridgeConnection } from "../connection.js";

export function registerSignalTools(
  server: McpServer,
  bridge: BridgeConnection
): void {
  server.tool(
    "godot_list_signals",
    "List all signals exposed by a node",
    {
      node_path: z.string().describe("Node path in the scene tree (empty for root)"),
    },
    async ({ node_path }) => {
      try {
        const result = await bridge.send<{ node: string; signals: Array<{ name: string; args: Array<{ name: string; type: string }> }> }>("signal.list", { path: node_path });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "godot_connect_signal",
    "Connect a signal from one node to a method on another node",
    {
      from_path: z.string().describe("Node path of the signal source"),
      signal_name: z.string().describe("Name of the signal to connect"),
      to_path: z.string().describe("Node path of the signal target"),
      method: z.string().describe("Method name on the target node to call"),
      flags: z.number().optional().describe("Connection flags (0=default, 1=deferred, 4=one_shot)"),
    },
    async ({ from_path, signal_name, to_path, method, flags }) => {
      try {
        const result = await bridge.send<{ success: true }>("signal.connect", { from_path, signal_name, to_path, method, flags });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "godot_disconnect_signal",
    "Disconnect a signal connection between two nodes",
    {
      from_path: z.string().describe("Node path of the signal source"),
      signal_name: z.string().describe("Name of the signal"),
      to_path: z.string().describe("Node path of the signal target"),
      method: z.string().describe("Method name that was connected"),
    },
    async ({ from_path, signal_name, to_path, method }) => {
      try {
        const result = await bridge.send<{ success: true }>("signal.disconnect", { from_path, signal_name, to_path, method });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "godot_list_connections",
    "List all signal connections on a node",
    {
      node_path: z.string().optional().describe("Node path (empty for root)"),
    },
    async ({ node_path }) => {
      try {
        const result = await bridge.send<{ connections: Array<{ signal: string; from: string; to: string; method: string; flags: number }> }>("signal.list_connections", { path: node_path ?? "" });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );
}

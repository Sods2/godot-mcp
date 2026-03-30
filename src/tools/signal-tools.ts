import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BridgeConnection } from "../connection.js";
import { TscnParser } from "../parsers/tscn-parser.js";
import { expandPath, resolveProjectPath } from "../project-utils.js";

const _parser = new TscnParser();

function resolveResPath(projectPath: string, resPath: string): string {
  const project = expandPath(projectPath);
  const relative = resPath.replace(/^res:\/\//, "");
  return path.join(project, relative);
}

async function persistConnection(
  bridge: BridgeConnection,
  signal: string,
  from: string,
  to: string,
  method: string,
  flags: number | undefined,
  remove: boolean
): Promise<string> {
  // Get the currently open scene from editor
  const status = await bridge.send<{ open_scenes?: string[] }>("editor.status", {});
  const openScenes = status.open_scenes ?? [];
  if (openScenes.length === 0) return "Runtime connection only — no open scene found for persistence";

  const scenePath = openScenes[0];
  const projectDir = resolveProjectPath();
  const filePath = resolveResPath(projectDir, scenePath);
  const content = await readFile(filePath, "utf-8");
  let scene = _parser.parse(content);

  if (remove) {
    scene = _parser.removeConnection(scene, signal, from, to, method);
  } else {
    scene = _parser.addConnection(scene, { signal, from, to, method, flags });
  }

  await writeFile(filePath, _parser.serialize(scene), "utf-8");
  return scenePath;
}

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
        await bridge.send<{ success: true }>("signal.connect", { from_path, signal_name, to_path, method, flags });
        let persistNote = "";
        try {
          const scenePath = await persistConnection(bridge, signal_name, from_path, to_path, method, flags, false);
          persistNote = `Persisted to ${scenePath}`;
        } catch (pe) {
          persistNote = `Runtime only — could not persist: ${(pe as Error).message}`;
        }
        return { content: [{ type: "text", text: JSON.stringify({ success: true, persisted: persistNote }, null, 2) }] };
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
        await bridge.send<{ success: true }>("signal.disconnect", { from_path, signal_name, to_path, method });
        let persistNote = "";
        try {
          const scenePath = await persistConnection(bridge, signal_name, from_path, to_path, method, undefined, true);
          persistNote = `Removed from ${scenePath}`;
        } catch (pe) {
          persistNote = `Runtime only — could not remove from file: ${(pe as Error).message}`;
        }
        return { content: [{ type: "text", text: JSON.stringify({ success: true, persisted: persistNote }, null, 2) }] };
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
      recursive: z.boolean().optional().describe("Also collect connections from descendant nodes (default: true)"),
    },
    async ({ node_path, recursive }) => {
      try {
        const result = await bridge.send<{ connections: Array<{ signal: string; from: string; to: string; method: string; flags: number }> }>("signal.list_connections", { path: node_path ?? "", recursive: recursive ?? true });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );
}

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { checkAddonStatus, UPDATE_HINT } from "./addon-version.js";
import type { BridgeConnection } from "./connection.js";

// editor_status already reports addon problems itself.
const SELF_REPORTING_TOOLS = new Set(["godot_editor_status"]);

/**
 * Wrap `server` so that the first bridge tool call of the session runs a version
 * check (editor.status) and, if the addon is outdated, appends a one-time
 * warning to that tool's result. The tool itself always runs; this is never an error.
 */
export function withAddonWarning(server: McpServer, bridge: BridgeConnection): McpServer {
  let done = false;
  let checking = false;

  // Returns a warning if the addon is outdated; marks the session as checked
  // once the answer is conclusive.
  async function check(): Promise<string | null> {
    try {
      const warning = checkAddonStatus(await bridge.send("editor.status"));
      done = true;
      return warning;
    } catch (e) {
      const message = (e as Error).message;
      // Pre-handshake addons reject editor.status as an unknown method.
      if (message.includes(UPDATE_HINT)) {
        done = true;
        return message;
      }
      return null; // inconclusive (timeout etc.); try again on a later call
    }
  }

  const wrapped = Object.create(server) as McpServer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (wrapped as any).tool = (name: string, ...rest: any[]) => {
    const handler = rest[rest.length - 1];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rest[rest.length - 1] = async (...args: any[]) => {
      if (SELF_REPORTING_TOOLS.has(name)) {
        done = true;
        return handler(...args);
      }
      let warning: string | null = null;
      if (!done && !checking && bridge.connected) {
        checking = true; // concurrent first calls stay silent
        try {
          warning = await check();
        } finally {
          checking = false;
        }
      }
      const result = await handler(...args);
      if (warning && result && Array.isArray(result.content)) {
        result.content.push({ type: "text", text: `Warning: ${warning}` });
      }
      return result;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (server.tool as any).call(server, name, ...rest);
  };
  return wrapped;
}

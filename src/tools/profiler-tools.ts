import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BridgeConnection } from "../connection.js";
import type {
  StartProfilerResponse,
  StopProfilerResponse,
  GetProfilerDataResponse,
} from "../types/bridge-responses.js";

export function registerProfilerTools(
  server: McpServer,
  bridge: BridgeConnection
): void {
  server.tool(
    "godot_start_profiler",
    "Start capturing performance profiling data in the running Godot game",
    {},
    async () => {
      try {
        const result = await bridge.send<StartProfilerResponse>("profiler.start");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "godot_stop_profiler",
    "Stop profiling and return collected performance data",
    {},
    async () => {
      try {
        const result = await bridge.send<StopProfilerResponse>("profiler.stop");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "godot_get_profiler_data",
    "Get the currently collected profiler frames without stopping profiling",
    {},
    async () => {
      try {
        const result = await bridge.send<GetProfilerDataResponse>("profiler.get_data");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );
}

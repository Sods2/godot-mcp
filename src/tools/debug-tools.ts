import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BridgeConnection } from "../connection.js";
import type {
  SetBreakpointResponse,
  RemoveBreakpointResponse,
  ListBreakpointsResponse,
  GetStackTraceResponse,
  GetLocalsResponse,
  DebugStepResponse,
  DebugContinueResponse,
} from "../types/bridge-responses.js";

export function registerDebugTools(
  server: McpServer,
  bridge: BridgeConnection
): void {
  server.tool(
    "godot_set_breakpoint",
    "Set a breakpoint at a file and line in the running Godot game",
    {
      file: z.string().describe("File path (res:// or absolute)"),
      line: z.number().int().describe("Line number"),
    },
    async ({ file, line }) => {
      try {
        const result = await bridge.send<SetBreakpointResponse>("debug.set_breakpoint", { file, line });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "godot_remove_breakpoint",
    "Remove a breakpoint at a file and line",
    {
      file: z.string().describe("File path (res:// or absolute)"),
      line: z.number().int().describe("Line number"),
    },
    async ({ file, line }) => {
      try {
        const result = await bridge.send<RemoveBreakpointResponse>("debug.remove_breakpoint", { file, line });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "godot_list_breakpoints",
    "List all active breakpoints",
    {},
    async () => {
      try {
        const result = await bridge.send<ListBreakpointsResponse>("debug.list_breakpoints");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "godot_get_stack_trace",
    "Get the current stack trace when paused at a breakpoint",
    {},
    async () => {
      try {
        const result = await bridge.send<GetStackTraceResponse>("debug.get_stack_trace");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "godot_get_locals",
    "Get local variables when paused at a breakpoint",
    {},
    async () => {
      try {
        const result = await bridge.send<GetLocalsResponse>("debug.get_locals");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "godot_step_over",
    "Step over the current line (debugger must be paused)",
    {},
    async () => {
      try {
        const result = await bridge.send<DebugStepResponse>("debug.step_over");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "godot_step_into",
    "Step into the current function call (debugger must be paused)",
    {},
    async () => {
      try {
        const result = await bridge.send<DebugStepResponse>("debug.step_into");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "godot_step_out",
    "Step out of the current function (debugger must be paused)",
    {},
    async () => {
      try {
        const result = await bridge.send<DebugStepResponse>("debug.step_out");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "godot_continue",
    "Continue execution after a breakpoint pause",
    {},
    async () => {
      try {
        const result = await bridge.send<DebugContinueResponse>("debug.continue_execution");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );
}

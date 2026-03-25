import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BridgeConnection } from "../connection.js";
import type { ProcessManager } from "../process-manager.js";

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(e: unknown) {
  return {
    content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
    isError: true,
  };
}

export function registerRunTools(
  server: McpServer,
  processManager: ProcessManager,
  bridge: BridgeConnection,
  godotPath: () => Promise<string>
) {
  server.tool(
    "godot_run_scene",
    "Run a Godot project/scene in debug mode",
    {
      project_path: z.string().describe("Path to the Godot project directory"),
      scene: z.string().optional().describe("Specific scene to run (optional)"),
    },
    async ({ project_path, scene }) => {
      if (bridge.connected) {
        try {
          const result = await bridge.send("run.play", { scene: scene ?? "" });
          return textResult(JSON.stringify(result, null, 2));
        } catch (e) {
          return errorResult(e);
        }
      }
      try {
        const gp = await godotPath();
        await processManager.runProject(gp, project_path, scene);
        return textResult("Project running in debug mode (spawned process)");
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.tool(
    "godot_stop_scene",
    "Stop the running Godot scene/project",
    {},
    async () => {
      if (bridge.connected) {
        try {
          const result = await bridge.send("run.stop", {});
          return textResult(JSON.stringify(result, null, 2));
        } catch (e) {
          return errorResult(e);
        }
      }
      try {
        const result = await processManager.stopProject();
        return textResult(
          JSON.stringify(
            {
              stopped: true,
              outputLines: result.output.length,
              errorLines: result.errors.length,
              lastOutput: result.output.slice(-20),
              lastErrors: result.errors.slice(-20),
            },
            null,
            2
          )
        );
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.tool(
    "godot_get_output",
    "Get stdout/stderr from the running Godot scene",
    {},
    async () => {
      if (bridge.connected) {
        try {
          const result = await bridge.send("run.get_output", {});
          return textResult(JSON.stringify(result, null, 2));
        } catch (e) {
          return errorResult(e);
        }
      }
      const result = processManager.getDebugOutput();
      return textResult(JSON.stringify(result, null, 2));
    }
  );

  server.tool(
    "godot_is_running",
    "Check if a Godot scene/project is currently running",
    {},
    async () => {
      if (bridge.connected) {
        try {
          const result = await bridge.send("run.is_running", {});
          return textResult(JSON.stringify(result, null, 2));
        } catch (e) {
          return errorResult(e);
        }
      }
      return textResult(JSON.stringify({ running: processManager.isRunning() }, null, 2));
    }
  );
}

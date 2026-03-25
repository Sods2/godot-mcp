import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { findGodotPath, getGodotVersion } from "./godot-path.js";
import { ProcessManager } from "./process-manager.js";
import {
  listProjects,
  getProjectInfo,
  getGodotVersion as getGodotVersionTool,
} from "./tools/project-tools.js";
import { getUid, updateProjectUids } from "./tools/uid-tools.js";
import { bridge } from "./connection.js";
import { registerEditorTools } from "./tools/editor-tools.js";
import { registerScriptTools } from "./tools/script-tools.js";
import { registerScreenshotTools } from "./tools/screenshot-tools.js";
import { registerSceneTools } from "./tools/scene-tools.js";
import { registerRunTools } from "./tools/run-tools.js";
import { registerFileTools } from "./tools/file-tools.js";
import { registerTestTools } from "./tools/test-tools.js";

const server = new McpServer({
  name: "godot-claude-mcp",
  version: "0.1.0",
});

const processManager = new ProcessManager();

let cachedGodotPath: string | null = null;

async function godotPath(): Promise<string> {
  if (!cachedGodotPath) {
    cachedGodotPath = await findGodotPath();
  }
  return cachedGodotPath;
}

// --- Tools ---

server.tool("godot_get_version", "Get installed Godot version", {}, async () => {
  try {
    const gp = await godotPath();
    const version = await getGodotVersion(gp);
    return { content: [{ type: "text", text: version }] };
  } catch (e) {
    return {
      content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
      isError: true,
    };
  }
});

server.tool(
  "godot_list_projects",
  "List all Godot projects under a directory",
  {
    directory: z.string().describe("Directory to scan for Godot projects"),
    recursive: z
      .boolean()
      .optional()
      .describe("Scan subdirectories recursively (default: false)"),
  },
  async ({ directory, recursive }) => {
    try {
      const projects = await listProjects(directory, recursive ?? false);
      return {
        content: [{ type: "text", text: JSON.stringify(projects, null, 2) }],
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
  "godot_get_project_info",
  "Get metadata about a Godot project",
  {
    project_path: z.string().describe("Path to the Godot project directory"),
  },
  async ({ project_path }) => {
    try {
      const gp = await godotPath();
      const info = await getProjectInfo(project_path, gp);
      return {
        content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
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
  "godot_launch_editor",
  "Launch the Godot editor for a project",
  {
    project_path: z.string().describe("Path to the Godot project directory"),
  },
  async ({ project_path }) => {
    try {
      const gp = await godotPath();
      await processManager.launchEditor(gp, project_path);
      return {
        content: [{ type: "text", text: "Godot editor launched" }],
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
  "godot_run_project",
  "Run a Godot project in debug mode",
  {
    project_path: z.string().describe("Path to the Godot project directory"),
    scene: z
      .string()
      .optional()
      .describe("Specific scene to run (optional)"),
  },
  async ({ project_path, scene }) => {
    try {
      const gp = await godotPath();
      await processManager.runProject(gp, project_path, scene);
      return {
        content: [{ type: "text", text: "Project running in debug mode" }],
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
  "godot_stop_project",
  "Stop the running Godot project",
  {},
  async () => {
    try {
      const result = await processManager.stopProject();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                stopped: true,
                outputLines: result.output.length,
                errorLines: result.errors.length,
                lastOutput: result.output.slice(-20),
                lastErrors: result.errors.slice(-20),
              },
              null,
              2
            ),
          },
        ],
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
  "godot_get_debug_output",
  "Get stdout/stderr from the running Godot project",
  {},
  async () => {
    const result = processManager.getDebugOutput();
    const running = processManager.isRunning();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              running,
              output: result.output,
              errors: result.errors,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.tool(
  "godot_get_uid",
  "Get the UID for a resource file (Godot 4.4+)",
  {
    project_path: z.string().describe("Path to the Godot project directory"),
    file_path: z
      .string()
      .describe("Relative path to the resource file within the project"),
  },
  async ({ project_path, file_path }) => {
    try {
      const uid = await getUid(project_path, file_path);
      if (uid) {
        return { content: [{ type: "text", text: uid }] };
      }
      return {
        content: [
          { type: "text", text: "No UID found for this resource" },
        ],
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
  "godot_update_uids",
  "Update all resource UIDs in a Godot project",
  {
    project_path: z.string().describe("Path to the Godot project directory"),
  },
  async ({ project_path }) => {
    try {
      const gp = await godotPath();
      const message = await updateProjectUids(gp, project_path);
      return {
        content: [{ type: "text", text: message }],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

// --- Live editor tools (require plugin connection) ---

registerEditorTools(server, bridge);
registerScriptTools(server, bridge);
registerScreenshotTools(server, bridge);

// --- Hybrid tools (plugin + file fallback) ---

registerSceneTools(server, bridge);
registerFileTools(server, godotPath);
registerRunTools(server, processManager, bridge, godotPath);
registerTestTools(server, godotPath);

// --- Start server ---

const transport = new StdioServerTransport();
await server.connect(transport);

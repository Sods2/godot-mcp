import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { findGodotPath, getGodotVersion } from "./godot-path.js";
import { ProcessManager } from "./process-manager.js";
import {
  listProjects,
  getProjectInfo,
  getAutoloads,
  addAutoload,
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
import { registerSignalTools } from "./tools/signal-tools.js";
import { registerAnimationTools } from "./tools/animation-tools.js";
import { registerExportTools } from "./tools/export-tools.js";
import { registerDebugTools } from "./tools/debug-tools.js";
import { registerProfilerTools } from "./tools/profiler-tools.js";
import { resolveProjectPath } from "./project-utils.js";

const server = new McpServer({
  name: "godot-mcp",
  version: "1.2.0",
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
    sort_by: z
      .enum(["name", "path", "modified"])
      .optional()
      .describe("Sort results by name, path, or modification time"),
    godot_version: z
      .string()
      .optional()
      .describe("Filter to projects targeting this Godot version (e.g. '4.4')"),
  },
  async ({ directory, recursive, sort_by, godot_version }) => {
    try {
      const projects = await listProjects(
        directory,
        recursive ?? false,
        sort_by,
        godot_version
      );
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
    project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
  },
  async ({ project_path }) => {
    try {
      const projectDir = resolveProjectPath(project_path);
      const gp = await godotPath();
      const info = await getProjectInfo(projectDir, gp);
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
    project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
  },
  async ({ project_path }) => {
    try {
      const projectDir = resolveProjectPath(project_path);
      const gp = await godotPath();
      await processManager.launchEditor(gp, projectDir);
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
  "godot_get_uid",
  "Get the UID for a resource file (Godot 4.4+)",
  {
    project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
    file_path: z
      .string()
      .describe("Relative path to the resource file within the project"),
  },
  async ({ project_path, file_path }) => {
    try {
      const projectDir = resolveProjectPath(project_path);
      const uid = await getUid(projectDir, file_path);
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
    project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
  },
  async ({ project_path }) => {
    try {
      const projectDir = resolveProjectPath(project_path);
      const gp = await godotPath();
      const message = await updateProjectUids(gp, projectDir);
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
registerSignalTools(server, bridge);
registerAnimationTools(server, bridge);
registerDebugTools(server, bridge);
registerProfilerTools(server, bridge);

// --- Hybrid tools (plugin + file fallback) ---

registerSceneTools(server, bridge);
registerFileTools(server, bridge, godotPath);
registerRunTools(server, processManager, bridge, godotPath);
registerTestTools(server, godotPath);
registerExportTools(server, godotPath);

// --- Autoload tools ---

server.tool(
  "godot_get_autoloads",
  "List all autoload singletons configured in a Godot project",
  {
    project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
  },
  async ({ project_path }) => {
    try {
      const projectDir = resolveProjectPath(project_path);
      const autoloads = await getAutoloads(projectDir);
      return {
        content: [{ type: "text", text: JSON.stringify(autoloads, null, 2) }],
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
  "godot_add_autoload",
  "Add an autoload singleton to a Godot project",
  {
    project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
    name: z.string().describe("Autoload name (e.g. 'GameManager')"),
    script_path: z
      .string()
      .describe("res:// path to the script (e.g. 'res://src/game_manager.gd')"),
  },
  async ({ project_path, name, script_path }) => {
    try {
      const projectDir = resolveProjectPath(project_path);
      await addAutoload(projectDir, name, script_path);
      return {
        content: [
          {
            type: "text",
            text: `Added autoload "${name}" -> ${script_path}`,
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

// --- Start server ---

const transport = new StdioServerTransport();
await server.connect(transport);

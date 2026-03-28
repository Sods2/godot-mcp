import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { expandPath, resolveProjectPath } from "../project-utils.js";
import { cleanOutput } from "../output-utils.js";

const execFileAsync = promisify(execFile);

function getExportMeshLibraryScriptPath(): string {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(dir, "../../scripts/export_mesh_library.gd");
}

interface ExportPreset {
  name: string;
  platform: string;
  export_path: string;
}

async function parseExportPresets(projectPath: string): Promise<ExportPreset[]> {
  const presetsPath = path.join(expandPath(projectPath), "export_presets.cfg");
  let content: string;
  try {
    content = await readFile(presetsPath, "utf-8");
  } catch {
    return [];
  }

  const presets: ExportPreset[] = [];
  const lines = content.split("\n");
  let current: Partial<ExportPreset> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.match(/^\[preset\.\d+\]$/)) {
      if (current?.name !== undefined) presets.push(current as ExportPreset);
      current = { name: "", platform: "", export_path: "" };
      continue;
    }
    if (!current) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^"(.*)"$/, "$1");
    if (key === "name") current.name = val;
    else if (key === "platform") current.platform = val;
    else if (key === "export_path") current.export_path = val;
  }
  if (current?.name !== undefined) presets.push(current as ExportPreset);
  return presets;
}

export function registerExportTools(
  server: McpServer,
  godotPath: () => Promise<string>
): void {
  server.tool(
    "godot_list_export_presets",
    "List all export presets configured in the project",
    {
      project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
    },
    async ({ project_path }) => {
      try {
        const projectDir = resolveProjectPath(project_path);
        const presets = await parseExportPresets(projectDir);
        if (presets.length === 0) {
          return { content: [{ type: "text", text: "No export presets found. Configure them in Project > Export." }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(presets, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "godot_export_project",
    "Export the project using a configured export preset",
    {
      project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
      preset: z.string().describe("Name of the export preset to use"),
      output_path: z.string().describe("Output file path for the export"),
      debug: z.boolean().optional().describe("Export debug build (default: release)"),
    },
    async ({ project_path, preset, output_path, debug }) => {
      try {
        const projectDir = resolveProjectPath(project_path);
        const gp = await godotPath();
        const proj = projectDir;
        const flag = debug ? "--export-debug" : "--export-release";
        const args = ["--headless", "--path", proj, flag, preset, output_path];
        let stdout = "";
        let stderr = "";
        try {
          const result = await execFileAsync(gp, args, { timeout: 300000 });
          stdout = result.stdout;
          stderr = result.stderr;
        } catch (err: unknown) {
          const execErr = err as { stdout?: string; stderr?: string; message?: string };
          stdout = execErr.stdout ?? "";
          stderr = execErr.stderr ?? "";
          if (!stdout && !stderr) throw err;
        }
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ preset, output_path, stdout: cleanOutput(stdout.trim()), stderr: cleanOutput(stderr.trim()) }, null, 2),
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "godot_export_mesh_library",
    "Export a scene as a MeshLibrary resource (for use with TileMap/GridMap)",
    {
      project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
      scene_path: z.string().describe("res:// path to the scene containing MeshInstance3D nodes"),
      output_path: z.string().describe("res:// path for the output .meshlib file"),
    },
    async ({ project_path, scene_path, output_path }) => {
      try {
        const projectDir = resolveProjectPath(project_path);
        const gp = await godotPath();
        const proj = projectDir;
        const scriptPath = getExportMeshLibraryScriptPath();
        const args = [
          "--headless", "--path", proj,
          "-s", scriptPath,
          "--", `--scene=${scene_path}`, `--output=${output_path}`,
        ];
        let stdout = "";
        try {
          const result = await execFileAsync(gp, args, { timeout: 60000 });
          stdout = result.stdout;
        } catch (err: unknown) {
          const execErr = err as { stdout?: string; message?: string };
          stdout = execErr.stdout ?? "";
          if (!stdout) throw err;
        }
        const jsonLine = stdout.split("\n").find((l) => l.trim().startsWith("{"));
        if (jsonLine) {
          return { content: [{ type: "text", text: JSON.stringify(JSON.parse(jsonLine), null, 2) }] };
        }
        return { content: [{ type: "text", text: stdout || "Export completed" }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );
}

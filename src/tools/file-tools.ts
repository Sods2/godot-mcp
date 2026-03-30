import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile, writeFile, mkdir, readdir, stat, unlink, rename, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { TscnParser, type TscnScene } from "../parsers/tscn-parser.js";
import type { BridgeConnection } from "../connection.js";
import type { ImportAssetResponse, ReadResourceResponse, WriteResourceResponse } from "../types/bridge-responses.js";
import { expandPath, resolveProjectPath } from "../project-utils.js";
import { cleanOutput } from "../output-utils.js";

const execFileAsync = promisify(execFile);
const parser = new TscnParser();

function resolveResPath(projectPath: string, resPath: string): string {
  const project = expandPath(projectPath);
  const relative = resPath.replace(/^res:\/\//, "");
  return path.join(project, relative);
}

async function readScene(
  projectPath: string,
  scenePath: string
): Promise<{ scene: TscnScene; filePath: string }> {
  const filePath = resolveResPath(projectPath, scenePath);
  const content = await readFile(filePath, "utf-8");
  const scene = parser.parse(content);
  return { scene, filePath };
}

async function writeScene(filePath: string, scene: TscnScene): Promise<void> {
  const content = parser.serialize(scene);
  await writeFile(filePath, content, "utf-8");
}

export function registerFileTools(
  server: McpServer,
  bridge: BridgeConnection,
  godotPath: () => Promise<string>,
  _projectPath?: string
): void {
  server.tool(
    "godot_parse_scene",
    "Parse a .tscn file and return its structure as JSON",
    {
      project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
      scene_path: z
        .string()
        .describe('Scene file path (e.g. "res://scenes/player.tscn")'),
    },
    async ({ project_path, scene_path }) => {
      try {
        const projectDir = resolveProjectPath(project_path);
        const { scene } = await readScene(projectDir, scene_path);
        return {
          content: [
            { type: "text", text: JSON.stringify(scene, null, 2) },
          ],
        };
      } catch (e) {
        return {
          content: [
            { type: "text", text: `Error: ${(e as Error).message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "godot_create_scene",
    "Create a new .tscn file with a root node",
    {
      project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
      scene_path: z
        .string()
        .describe('Scene path (e.g. "res://scenes/player.tscn")'),
      root_node_type: z
        .string()
        .describe('Root node type (e.g. "CharacterBody2D")'),
      root_node_name: z
        .string()
        .optional()
        .describe("Root node name (defaults to scene filename without extension)"),
    },
    async ({ project_path, scene_path, root_node_type, root_node_name }) => {
      try {
        const projectDir = resolveProjectPath(project_path);
        const filePath = resolveResPath(projectDir, scene_path);
        const dirPath = path.dirname(filePath);
        await mkdir(dirPath, { recursive: true });

        const defaultName = path.basename(filePath, ".tscn");
        const rootName = root_node_name ?? defaultName;

        const scene = parser.createScene(root_node_type, rootName);

        await writeScene(filePath, scene);

        return {
          content: [
            {
              type: "text",
              text: `Created scene at ${filePath} with root ${root_node_type} "${rootName}"`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            { type: "text", text: `Error: ${(e as Error).message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "godot_add_node_to_file",
    "Add a node to a .tscn file (no editor required)",
    {
      project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
      scene_path: z.string().describe("Scene file path"),
      node_type: z.string().describe('Node type (e.g. "Sprite2D")'),
      node_name: z.string().describe("Node name"),
      parent_path: z
        .string()
        .describe('Parent path ("." for direct child of root)'),
      properties: z
        .record(z.string(), z.string())
        .optional()
        .describe("Optional properties as key-value pairs"),
    },
    async ({
      project_path,
      scene_path,
      node_type,
      node_name,
      parent_path,
      properties,
    }) => {
      try {
        const projectDir = resolveProjectPath(project_path);
        const { scene, filePath } = await readScene(projectDir, scene_path);

        const updated = parser.addNode(scene, {
          name: node_name,
          type: node_type,
          parent: parent_path,
          properties: properties as Record<string, string> | undefined,
        });

        await writeScene(filePath, updated);

        return {
          content: [
            {
              type: "text",
              text: `Added ${node_type} "${node_name}" to scene`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            { type: "text", text: `Error: ${(e as Error).message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "godot_set_property_in_file",
    "Set a property on a node in a .tscn file",
    {
      project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
      scene_path: z.string().describe("Scene file path"),
      node_path: z
        .string()
        .describe('Node path (e.g. "Player" or "Player/Sprite2D")'),
      property: z.string().describe("Property name"),
      value: z
        .string()
        .describe('Property value as Godot variant string (e.g. "Vector2(100, 200)")'),
    },
    async ({ project_path, scene_path, node_path, property, value }) => {
      try {
        const projectDir = resolveProjectPath(project_path);
        const { scene, filePath } = await readScene(projectDir, scene_path);
        const updated = parser.setProperty(scene, node_path, property, value);
        await writeScene(filePath, updated);

        return {
          content: [
            {
              type: "text",
              text: `Set ${property} = ${value} on ${node_path}`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            { type: "text", text: `Error: ${(e as Error).message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "godot_load_sprite_in_file",
    "Set a Sprite2D texture by adding an ext_resource and setting the texture property",
    {
      project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
      scene_path: z.string().describe("Scene file path"),
      node_path: z.string().describe("Path to the Sprite2D node"),
      texture_path: z
        .string()
        .describe('Texture resource path (e.g. "res://icon.png")'),
    },
    async ({ project_path, scene_path, node_path, texture_path }) => {
      try {
        const projectDir = resolveProjectPath(project_path);
        const { scene, filePath } = await readScene(projectDir, scene_path);

        const { scene: withRes, id: resId } = parser.addExtResource(
          scene,
          "Texture2D",
          texture_path
        );

        const updated = parser.setProperty(
          withRes,
          node_path,
          "texture",
          `ExtResource("${resId}")`
        );

        await writeScene(filePath, updated);

        return {
          content: [
            {
              type: "text",
              text: `Set texture on ${node_path} to ${texture_path} (resource id: ${resId})`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            { type: "text", text: `Error: ${(e as Error).message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "godot_validate_script",
    "Validate a GDScript file using Godot's --check-only flag",
    {
      project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
      script_path: z
        .string()
        .describe('Script path (e.g. "res://src/player.gd")'),
      include_warnings: z
        .boolean()
        .optional()
        .describe("Include warnings in output (passes -W flag to Godot)"),
    },
    async ({ project_path, script_path, include_warnings }) => {
      try {
        const projectDir = resolveProjectPath(project_path);
        const gp = await godotPath();

        const args = [
          "--headless",
          "--path",
          projectDir,
          "--script",
          script_path,
          "--check-only",
        ];
        if (include_warnings) {
          args.push("-W");
        }

        const { stdout, stderr } = await execFileAsync(
          gp,
          args,
          { timeout: 30000 }
        );

        const output = cleanOutput((stdout + "\n" + stderr).trim());

        // Even on exit code 0, Godot may have printed error indicators (e.g. corrupt
        // project scene causes a crash before script parsing actually ran).
        if (/SCRIPT ERROR/i.test(output) || /Parse Error/i.test(output)) {
          return {
            content: [{ type: "text", text: output }],
            isError: true,
          };
        }
        if (/FATAL:/i.test(output) || /ERROR:.*\.gd/i.test(output) || /ERROR:.*Failed to load/i.test(output)) {
          return {
            content: [{ type: "text", text: `Warning: Godot reported project-level errors; script validation may not have completed.\n${output}`.trim() }],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Script is valid.\n${output}`.trim(),
            },
          ],
        };
      } catch (e: unknown) {
        const err = e as Error & { stdout?: string; stderr?: string };
        const output = cleanOutput(((err.stdout || "") + "\n" + (err.stderr || "")).trim());
        const hint = "\n\nNote: godot_validate_script uses --check-only which requires an exclusive project lock. If the Godot editor is already open with this project, close it first before validating.";
        return {
          content: [
            {
              type: "text",
              text: (output || `Error: ${err.message}`) + hint,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "godot_create_folder",
    "Create a new folder in the project",
    {
      project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
      folder_path: z.string().describe("res:// path for the new folder (e.g. res://src/enemies)"),
    },
    async ({ project_path, folder_path }) => {
      try {
        const projectDir = resolveProjectPath(project_path);
        const absPath = resolveResPath(projectDir, folder_path);
        await mkdir(absPath, { recursive: true });
        return { content: [{ type: "text", text: `Created folder: ${folder_path}` }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "godot_list_directory",
    "List files and folders in a project directory",
    {
      project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
      directory: z.string().optional().describe("res:// directory path (default: res://)"),
    },
    async ({ project_path, directory }) => {
      try {
        const projectDir = resolveProjectPath(project_path);
        const absDir = resolveResPath(projectDir, directory ?? "res://");
        const entries = await readdir(absDir, { withFileTypes: true });
        const results = await Promise.all(
          entries
            .filter((e) => !e.name.startsWith("."))
            .map(async (entry) => {
              const entryPath = path.join(absDir, entry.name);
              const stats = await stat(entryPath);
              return {
                name: entry.name,
                path: (directory ?? "res://").replace(/\/$/, "") + "/" + entry.name,
                is_directory: entry.isDirectory(),
                size: entry.isFile() ? stats.size : undefined,
                modified: stats.mtime.toISOString(),
              };
            })
        );
        results.sort((a, b) => {
          if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "godot_delete_file",
    "Delete a file or folder from the Godot project",
    {
      project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
      path: z.string().describe("res:// path to the file or folder to delete"),
    },
    async ({ project_path, path: resPath }) => {
      try {
        const absPath = resolveResPath(resolveProjectPath(project_path), resPath);
        const fileStats = await stat(absPath);
        if (fileStats.isDirectory()) {
          await rm(absPath, { recursive: true });
        } else {
          await unlink(absPath);
        }
        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, path: resPath }) }],
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
    "godot_rename_file",
    "Rename or move a file within the Godot project",
    {
      project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
      path: z.string().describe("Current res:// path of the file"),
      new_path: z.string().describe("New res:// path for the file"),
    },
    async ({ project_path, path: resPath, new_path: newResPath }) => {
      try {
        const projectDir = resolveProjectPath(project_path);
        const absFrom = resolveResPath(projectDir, resPath);
        const absTo = resolveResPath(projectDir, newResPath);
        const toDir = path.dirname(absTo);
        await mkdir(toDir, { recursive: true });
        await rename(absFrom, absTo);
        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, old_path: resPath, new_path: newResPath }) }],
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
    "godot_list_resources",
    "List resource files in the Godot project, optionally filtered by extension",
    {
      project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
      path: z.string().optional().describe("res:// path to scan (default: res://)"),
      extensions: z.array(z.string()).optional().describe('Filter by extensions (e.g. [".tres", ".res", ".tscn"])'),
    },
    async ({ project_path, path: resPath, extensions }) => {
      try {
        const projectDir = resolveProjectPath(project_path);
        const baseDir = resolveResPath(projectDir, resPath ?? "res://");
        const resources: Array<{ path: string; type: string; size: number; modified: string }> = [];

        async function scanDir(dir: string, resPrefix: string): Promise<void> {
          const entries = await readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name.startsWith(".")) continue;
            const fullPath = path.join(dir, entry.name);
            const entryResPath = resPrefix + entry.name;
            if (entry.isDirectory()) {
              await scanDir(fullPath, entryResPath + "/");
            } else {
              const ext = path.extname(entry.name);
              if (extensions && extensions.length > 0 && !extensions.includes(ext)) continue;
              const stats = await stat(fullPath);
              resources.push({
                path: entryResPath,
                type: ext.replace(/^\./, ""),
                size: stats.size,
                modified: stats.mtime.toISOString(),
              });
            }
          }
        }

        const prefix = (resPath ?? "res://").replace(/\/$/, "") + "/";
        await scanDir(baseDir, prefix);
        return {
          content: [{ type: "text", text: JSON.stringify({ resources }, null, 2) }],
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
    "godot_import_asset",
    "Reimport assets in the Godot editor",
    {
      paths: z.array(z.string()).describe("Array of res:// paths to reimport"),
    },
    async ({ paths }) => {
      try {
        const result = await bridge.send<ImportAssetResponse>("resource.import", { paths });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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
    "godot_read_resource",
    "Read a Godot resource's properties via the editor bridge",
    {
      path: z.string().describe("res:// path to the resource"),
    },
    async ({ path: resPath }) => {
      try {
        const result = await bridge.send<ReadResourceResponse>("resource.read", { path: resPath });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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
    "godot_write_resource",
    "Write properties to a Godot resource via the editor bridge",
    {
      path: z.string().describe("res:// path to the resource"),
      properties: z.record(z.string(), z.unknown()).describe("Properties to set on the resource"),
    },
    async ({ path: resPath, properties }) => {
      try {
        const result = await bridge.send<WriteResourceResponse>("resource.write", { path: resPath, properties });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}

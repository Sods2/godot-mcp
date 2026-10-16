import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getGodotVersion as getVersion } from "../godot-path.js";
import { parseProjectConfig, serializeProjectConfig } from "../parsers/project-parser.js";
import { expandPath } from "../project-utils.js";

export interface ProjectInfo {
  name: string;
  path: string;
  godotVersion: string;
  engineVersion: string;
  fileCounts: {
    scenes: number;
    scripts: number;
    images: number;
    audio: number;
    fonts: number;
    other: number;
  };
}

export async function listProjects(
  directory: string,
  recursive: boolean = false,
  sortBy?: "name" | "path" | "modified",
  godotVersionFilter?: string
): Promise<Array<{ path: string; name: string }>> {
  const dir = expandPath(directory);
  const results: Array<{ path: string; name: string }> = [];

  async function scan(currentDir: string, depth: number): Promise<void> {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    const hasProjectFile = entries.some(
      (e) => e.isFile() && e.name === "project.godot"
    );

    if (hasProjectFile) {
      // Parse project name from project.godot
      let name = path.basename(currentDir);
      try {
        const content = await readFile(
          path.join(currentDir, "project.godot"),
          "utf-8"
        );
        const match = content.match(/config\/name="([^"]+)"/);
        if (match) {
          name = match[1];
        }
      } catch {
        // use directory name as fallback
      }
      results.push({ path: currentDir, name });
    }

    if (recursive || depth === 0) {
      for (const entry of entries) {
        if (
          entry.isDirectory() &&
          !entry.name.startsWith(".") &&
          entry.name !== "node_modules" &&
          entry.name !== ".godot"
        ) {
          await scan(path.join(currentDir, entry.name), depth + 1);
        }
      }
    }
  }

  await scan(dir, 0);

  if (godotVersionFilter) {
    const filtered: Array<{ path: string; name: string }> = [];
    for (const project of results) {
      try {
        const content = await readFile(
          path.join(project.path, "project.godot"),
          "utf-8"
        );
        const featuresMatch = content.match(
          /config\/features=PackedStringArray\(([^)]+)\)/
        );
        if (featuresMatch) {
          const versionMatch = featuresMatch[1].match(/"(\d+\.\d+[^"]*)"/);
          if (versionMatch && versionMatch[1].includes(godotVersionFilter)) {
            filtered.push(project);
          }
        }
      } catch {
        // skip projects we can't read
      }
    }
    results.length = 0;
    results.push(...filtered);
  }

  if (sortBy === "name") {
    results.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortBy === "path") {
    results.sort((a, b) => a.path.localeCompare(b.path));
  } else if (sortBy === "modified") {
    const withMtime = await Promise.all(
      results.map(async (p) => {
        try {
          const s = await stat(path.join(p.path, "project.godot"));
          return { ...p, mtime: s.mtime.getTime() };
        } catch {
          return { ...p, mtime: 0 };
        }
      })
    );
    withMtime.sort((a, b) => b.mtime - a.mtime);
    results.length = 0;
    results.push(...withMtime.map(({ mtime: _, ...rest }) => rest));
  }

  return results;
}

const EXT_CATEGORIES: Record<string, keyof ProjectInfo["fileCounts"]> = {
  ".tscn": "scenes",
  ".gd": "scripts",
  ".gdscript": "scripts",
  ".png": "images",
  ".jpg": "images",
  ".jpeg": "images",
  ".webp": "images",
  ".svg": "images",
  ".wav": "audio",
  ".mp3": "audio",
  ".ogg": "audio",
  ".ttf": "fonts",
  ".otf": "fonts",
};

async function countFiles(
  dir: string
): Promise<ProjectInfo["fileCounts"]> {
  const counts: ProjectInfo["fileCounts"] = {
    scenes: 0,
    scripts: 0,
    images: 0,
    audio: 0,
    fonts: 0,
    other: 0,
  };

  async function walk(currentDir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (
          !entry.name.startsWith(".") &&
          entry.name !== "node_modules"
        ) {
          await walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const category = EXT_CATEGORIES[ext];
        if (category) {
          counts[category]++;
        } else if (
          ext !== "" &&
          entry.name !== "project.godot" &&
          !entry.name.endsWith(".import") &&
          !entry.name.endsWith(".uid")
        ) {
          counts.other++;
        }
      }
    }
  }

  await walk(dir);
  return counts;
}

export async function getProjectInfo(
  projectPath: string,
  godotPath: string
): Promise<ProjectInfo> {
  const dir = expandPath(projectPath);
  const projectFile = path.join(dir, "project.godot");

  const content = await readFile(projectFile, "utf-8");

  let name = path.basename(dir);
  const nameMatch = content.match(/config\/name="([^"]+)"/);
  if (nameMatch) {
    name = nameMatch[1];
  }

  let engineVersion = "unknown";
  const featuresMatch = content.match(/config\/features=PackedStringArray\(([^)]+)\)/);
  if (featuresMatch) {
    const features = featuresMatch[1];
    const versionMatch = features.match(/"(\d+\.\d+[^"]*)"/);
    if (versionMatch) {
      engineVersion = versionMatch[1];
    }
  }

  let godotVersion: string;
  try {
    godotVersion = await getVersion(godotPath);
  } catch {
    godotVersion = "unknown";
  }

  const fileCounts = await countFiles(dir);

  return {
    name,
    path: dir,
    godotVersion,
    engineVersion,
    fileCounts,
  };
}

export async function getGodotVersion(godotPath: string): Promise<string> {
  return getVersion(godotPath);
}

export async function getAutoloads(
  projectPath: string
): Promise<Array<{ name: string; path: string; enabled: boolean }>> {
  const dir = expandPath(projectPath);
  const projectFile = path.join(dir, "project.godot");
  const content = await readFile(projectFile, "utf-8");
  const config = parseProjectConfig(content);
  const autoloadSection = config.rawSections["autoload"] ?? {};
  return Object.entries(autoloadSection).map(([name, value]) => {
    const unquoted = value.trim().replace(/^"(.*)"$/, "$1");
    const enabled = unquoted.startsWith("*");
    return { name, path: enabled ? unquoted.slice(1) : unquoted, enabled };
  });
}

export interface AutoloadBridge {
  connected: boolean;
  send<T>(method: string, params?: unknown): Promise<T>;
}

function autoloadValue(raw: string): string {
  return raw.trim().replace(/^"(.*)"$/, "$1");
}

export function resolveResPath(projectDir: string, resPath: string): string {
  return path.join(projectDir, resPath.replace(/^res:\/\//, ""));
}

/**
 * Add (or with overwrite, replace) an autoload. With the editor bridge
 * connected the edit goes through the editor so its ProjectSettings copy and
 * project.godot agree; otherwise project.godot is rewritten directly.
 */
export async function addAutoload(
  projectPath: string,
  name: string,
  scriptPath: string,
  options: { overwrite?: boolean; bridge?: AutoloadBridge } = {}
): Promise<{ via: "bridge" | "file" }> {
  const dir = expandPath(projectPath);
  const overwrite = options.overwrite ?? false;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid autoload name "${name}"`);
  }
  if (!scriptPath.startsWith("res://")) {
    throw new Error(`script_path must start with res:// (got "${scriptPath}")`);
  }
  try {
    const s = await stat(resolveResPath(dir, scriptPath));
    if (!s.isFile()) throw new Error("not a file");
  } catch {
    throw new Error(`Script not found: ${scriptPath}`);
  }

  if (options.bridge?.connected) {
    const result = await options.bridge.send<{ error?: string }>("project.add_autoload", {
      name,
      script_path: scriptPath,
      overwrite,
    });
    if (result && typeof result.error === "string") throw new Error(result.error);
    return { via: "bridge" };
  }

  const projectFile = path.join(dir, "project.godot");
  const content = await readFile(projectFile, "utf-8");
  const config = parseProjectConfig(content);
  if (!config.rawSections["autoload"]) {
    config.rawSections["autoload"] = {};
  }
  const existing = config.rawSections["autoload"][name];
  if (existing !== undefined && !overwrite) {
    throw new Error(
      `Autoload "${name}" already exists (${autoloadValue(existing)}); pass overwrite=true to replace it`
    );
  }
  config.rawSections["autoload"][name] = `"*${scriptPath}"`;
  const newContent = serializeProjectConfig(config.rawSections, config.preamble);
  await writeFile(projectFile, newContent, "utf-8");
  return { via: "file" };
}

export async function removeAutoload(
  projectPath: string,
  name: string,
  options: { bridge?: AutoloadBridge } = {}
): Promise<{ via: "bridge" | "file" }> {
  const dir = expandPath(projectPath);
  if (options.bridge?.connected) {
    const result = await options.bridge.send<{ error?: string }>("project.remove_autoload", { name });
    if (result && typeof result.error === "string") throw new Error(result.error);
    return { via: "bridge" };
  }
  const projectFile = path.join(dir, "project.godot");
  const content = await readFile(projectFile, "utf-8");
  const config = parseProjectConfig(content);
  const section = config.rawSections["autoload"];
  if (!section || section[name] === undefined) {
    throw new Error(`Autoload "${name}" not found`);
  }
  delete section[name];
  const newContent = serializeProjectConfig(config.rawSections, config.preamble);
  await writeFile(projectFile, newContent, "utf-8");
  return { via: "file" };
}

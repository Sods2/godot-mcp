import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getGodotVersion as getVersion } from "../godot-path.js";

function expandPath(p: string): string {
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

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
  recursive: boolean = false
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

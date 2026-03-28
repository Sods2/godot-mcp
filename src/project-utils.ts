import path from "node:path";
import os from "node:os";
import { accessSync, constants } from "node:fs";

export function expandPath(p: string): string {
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

function findProjectRoot(startDir: string): string | undefined {
  let dir = startDir;
  while (true) {
    try {
      accessSync(path.join(dir, "project.godot"), constants.R_OK);
      return dir;
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) return undefined;
      dir = parent;
    }
  }
}

export function resolveProjectPath(explicit?: string): string {
  if (explicit !== undefined && explicit !== "") {
    return expandPath(explicit);
  }

  const envPath = process.env.GODOT_PROJECT_PATH;
  if (envPath) {
    return expandPath(envPath);
  }

  const detected = findProjectRoot(process.cwd());
  if (detected) {
    return detected;
  }

  throw new Error(
    "No project_path provided and could not auto-detect a Godot project. " +
    "Pass project_path explicitly, set the GODOT_PROJECT_PATH environment variable, " +
    "or run from within a Godot project directory."
  );
}

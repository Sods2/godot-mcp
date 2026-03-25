import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

function expandPath(p: string): string {
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export async function getUid(
  projectPath: string,
  filePath: string
): Promise<string | null> {
  const dir = expandPath(projectPath);
  const fullPath = path.join(dir, filePath);
  const uidPath = fullPath + ".uid";

  try {
    const content = await readFile(uidPath, "utf-8");
    const match = content.match(/uid:\/\/[a-z0-9]+/);
    return match ? match[0] : null;
  } catch {
    return null;
  }
}

export async function updateProjectUids(
  godotPath: string,
  projectPath: string,
  _operationsScriptPath?: string
): Promise<string> {
  const dir = expandPath(projectPath);
  // Stub: headless UID resaving requires a bundled GDScript.
  // For now, instruct the user to run Godot manually.
  return `To resave UIDs, run: ${godotPath} --headless --path "${dir}" --editor --quit`;
}

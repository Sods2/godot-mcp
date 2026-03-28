import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expandPath } from "../project-utils.js";

const execFileAsync = promisify(execFile);

function getUidUpdaterPath(): string {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(dir, "../../scripts/uid_updater.gd");
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
  projectPath: string
): Promise<string> {
  const dir = expandPath(projectPath);
  const args = ["--headless", "--path", dir, "-s", getUidUpdaterPath()];

  let raw = "";
  try {
    const { stdout, stderr } = await execFileAsync(godotPath, args, { timeout: 120000 });
    raw = (stdout + "\n" + stderr).trim();
  } catch (e: unknown) {
    const err = e as Error & { stdout?: string; stderr?: string };
    raw = ((err.stdout ?? "") + "\n" + (err.stderr ?? "")).trim();
  }

  // Find the JSON line in the output
  const lines = raw.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("{")) {
      try {
        const result = JSON.parse(trimmed) as { processed: number; errors: number; error_files: string[] };
        let msg = `Updated UIDs: processed ${result.processed} files, ${result.errors} errors`;
        if (result.error_files.length > 0) {
          msg += `\nFailed files:\n${result.error_files.join("\n")}`;
        }
        return msg;
      } catch {
        // not valid JSON, continue
      }
    }
  }

  return `UID update completed but could not parse results.\nRaw output:\n${raw}`;
}

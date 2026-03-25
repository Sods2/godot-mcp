import { execFile } from "node:child_process";
import { access, constants } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PLATFORM_PATHS: Record<string, string[]> = {
  darwin: [
    "/Applications/Godot.app/Contents/MacOS/Godot",
    "/Applications/Godot_v4.5-stable_macos.universal.app/Contents/MacOS/Godot",
    "/Applications/Godot_v4.4-stable_macos.universal.app/Contents/MacOS/Godot",
    "/Applications/Godot_v4.3-stable_macos.universal.app/Contents/MacOS/Godot",
    path.join(
      os.homedir(),
      "Library/Application Support/Steam/steamapps/common/Godot Engine/Godot.app/Contents/MacOS/Godot"
    ),
  ],
  win32: [
    "C:\\Program Files\\Godot\\Godot.exe",
    "C:\\Program Files\\Godot Engine\\Godot.exe",
  ],
  linux: [
    "/usr/bin/godot",
    "/usr/local/bin/godot",
    "/snap/bin/godot",
    path.join(os.homedir(), ".local/bin/godot"),
  ],
};

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function validateGodot(godotPath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(godotPath, ["--version"], {
      timeout: 10000,
    });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export async function findGodotPath(): Promise<string> {
  // 1. Check GODOT_PATH env var
  const envPath = process.env.GODOT_PATH;
  if (envPath) {
    if (await validateGodot(envPath)) {
      return envPath;
    }
    throw new Error(
      `GODOT_PATH is set to "${envPath}" but it is not a valid Godot executable`
    );
  }

  // 2. Try "godot" on PATH
  try {
    const { stdout } = await execFileAsync("godot", ["--version"], {
      timeout: 10000,
    });
    if (stdout.trim().length > 0) {
      return "godot";
    }
  } catch {
    // not on PATH
  }

  // 3. Platform-specific paths
  const candidates = PLATFORM_PATHS[process.platform] ?? [];
  for (const candidate of candidates) {
    if ((await isExecutable(candidate)) && (await validateGodot(candidate))) {
      return candidate;
    }
  }

  throw new Error(
    "Could not find Godot executable. Set the GODOT_PATH environment variable or install Godot to a standard location."
  );
}

export async function getGodotVersion(godotPath: string): Promise<string> {
  const { stdout } = await execFileAsync(godotPath, ["--version"], {
    timeout: 10000,
  });
  return stdout.trim();
}

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
    path.join(os.homedir(), "Applications/Godot.app/Contents/MacOS/Godot"),
    path.join(
      os.homedir(),
      "Applications/Godot_v4.5-stable_macos.universal.app/Contents/MacOS/Godot"
    ),
    path.join(
      os.homedir(),
      "Applications/Godot_v4.4-stable_macos.universal.app/Contents/MacOS/Godot"
    ),
    path.join(
      os.homedir(),
      "Applications/Godot_v4.3-stable_macos.universal.app/Contents/MacOS/Godot"
    ),
    "/opt/homebrew/bin/godot",
    "/usr/local/bin/godot",
    path.join(
      os.homedir(),
      "Library/Application Support/Steam/steamapps/common/Godot Engine/Godot.app/Contents/MacOS/Godot"
    ),
    // Non-standard user locations (e.g. ~/Documents/Claude/Games/Godot.app)
    path.join(os.homedir(), "Documents/Claude/Games/Godot.app/Contents/MacOS/Godot"),
    path.join(os.homedir(), "Downloads/Godot.app/Contents/MacOS/Godot"),
    path.join(os.homedir(), "Desktop/Godot.app/Contents/MacOS/Godot"),
  ],
  win32: [
    "C:\\Program Files\\Godot\\Godot.exe",
    "C:\\Program Files\\Godot Engine\\Godot.exe",
    path.join(os.homedir(), "scoop\\apps\\godot\\current\\Godot.exe"),
  ],
  linux: [
    "/usr/bin/godot",
    "/usr/local/bin/godot",
    "/snap/bin/godot",
    path.join(os.homedir(), ".local/bin/godot"),
    "/opt/godot/godot",
    path.join(
      os.homedir(),
      ".steam/steam/steamapps/common/Godot Engine/godot.x86_64"
    ),
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

async function findGodotInUserDirs(): Promise<string | null> {
  const searchDirs = [
    path.join(os.homedir(), "Documents"),
    path.join(os.homedir(), "Downloads"),
    path.join(os.homedir(), "Desktop"),
  ];
  for (const dir of searchDirs) {
    try {
      const { stdout } = await execFileAsync(
        "find",
        [dir, "-maxdepth", "4", "-name", "Godot*.app", "-type", "d"],
        { timeout: 8000 }
      );
      const appPaths = stdout.trim().split("\n").filter(Boolean);
      for (const appPath of appPaths) {
        const exe = path.join(appPath, "Contents/MacOS/Godot");
        if ((await isExecutable(exe)) && (await validateGodot(exe))) {
          return exe;
        }
      }
    } catch {
      // dir doesn't exist or find timed out — skip
    }
  }
  return null;
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

  // 4. Dynamic search in ~/Documents, ~/Downloads, ~/Desktop (macOS only)
  if (process.platform === "darwin") {
    const found = await findGodotInUserDirs();
    if (found) return found;
  }

  throw new Error(
    "Could not find Godot executable. Set the GODOT_PATH environment variable or install Godot to a standard location.\n" +
    "On macOS, the executable is at: YourGodot.app/Contents/MacOS/Godot\n" +
    "Example: GODOT_PATH=/Users/yourname/Documents/Claude/Games/Godot.app/Contents/MacOS/Godot"
  );
}

export async function getGodotVersion(godotPath: string): Promise<string> {
  const { stdout } = await execFileAsync(godotPath, ["--version"], {
    timeout: 10000,
  });
  return stdout.trim();
}

import { execFile } from "node:child_process";
import { access, constants, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Godot versions with a known stable macOS bundle name, newest first. Installs
 * that don't match (betas, .NET builds, renamed bundles) are picked up by the
 * `Godot*.app` scan in findGodotInAppDirs().
 */
const KNOWN_GODOT_VERSIONS = ["4.7", "4.6", "4.5", "4.4", "4.3"];

const MAC_APP_DIRS = ["/Applications", path.join(os.homedir(), "Applications")];

function macAppCandidates(dir: string): string[] {
  return [
    path.join(dir, "Godot.app/Contents/MacOS/Godot"),
    ...KNOWN_GODOT_VERSIONS.map((version) =>
      path.join(
        dir,
        `Godot_v${version}-stable_macos.universal.app/Contents/MacOS/Godot`
      )
    ),
  ];
}

const PLATFORM_PATHS: Record<string, string[]> = {
  darwin: [
    ...MAC_APP_DIRS.flatMap(macAppCandidates),
    "/opt/homebrew/bin/godot",
    "/usr/local/bin/godot",
    path.join(
      os.homedir(),
      "Library/Application Support/Steam/steamapps/common/Godot Engine/Godot.app/Contents/MacOS/Godot"
    ),
    // Godot bundles under ~/Documents, ~/Downloads and ~/Desktop are found by
    // findGodotInUserDirs(), which prefers the newest version it finds.
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

/** Sort key for a bundle name like "Godot_v4.7.1-stable_macos.universal.app". */
function bundleVersion(name: string): number[] {
  const match = name.match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return [0, 0, 0];
  return [1, 2, 3].map((i) => parseInt(match[i] ?? "0", 10));
}

export function compareVersionsDesc(a: string, b: string): number {
  const [av, bv] = [bundleVersion(a), bundleVersion(b)];
  for (let i = 0; i < 3; i++) {
    if (av[i] !== bv[i]) return bv[i] - av[i];
  }
  return b.localeCompare(a);
}

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Scan the macOS application directories for any `Godot*.app`, newest version
 * first. Catches installs the KNOWN_GODOT_VERSIONS list doesn't name — new
 * releases, betas, .NET builds — without needing a code change.
 */
async function findGodotInAppDirs(): Promise<string | null> {
  for (const dir of MAC_APP_DIRS) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue; // dir doesn't exist
    }
    const bundles = entries
      .filter((name) => /^Godot.*\.app$/i.test(name))
      .sort(compareVersionsDesc);
    for (const bundle of bundles) {
      const exe = path.join(dir, bundle, "Contents/MacOS/Godot");
      if ((await isExecutable(exe)) && (await validateGodot(exe))) {
        return exe;
      }
    }
  }
  return null;
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
        // Depth 6 rather than 4: a bundle kept in a subfolder such as
        // ~/Documents/<work>/<games>/<Godot IDE>/Godot_v4.7.app already sits
        // exactly at the old limit, so one more level of nesting made
        // auto-detect fail silently. The deeper walk costs tens of ms.
        [dir, "-maxdepth", "6", "-name", "Godot*.app", "-type", "d"],
        { timeout: 8000 }
      );
      const appPaths = stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .sort((a, b) => compareVersionsDesc(path.basename(a), path.basename(b)));
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

  // 4. Dynamic search (macOS only): any Godot*.app in the application
  //    directories first, then a deeper sweep of ~/Documents, ~/Downloads
  //    and ~/Desktop.
  if (process.platform === "darwin") {
    const inAppDirs = await findGodotInAppDirs();
    if (inAppDirs) return inAppDirs;

    const inUserDirs = await findGodotInUserDirs();
    if (inUserDirs) return inUserDirs;
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

import { execFile } from "node:child_process";
import { access, constants, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Side-effecting operations, injectable so detection can be unit-tested. */
export interface DetectDeps {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  homedir: string;
  isExecutable(filePath: string): Promise<boolean>;
  /** Directory entries; rejects if the directory doesn't exist. */
  readdir(dir: string): Promise<string[]>;
  /** Runs a program and resolves with its stdout; rejects on failure. */
  run(file: string, args: string[]): Promise<string>;
}

const defaultDeps = (): DetectDeps => ({
  platform: process.platform,
  env: process.env,
  homedir: os.homedir(),
  async isExecutable(filePath) {
    try {
      await access(filePath, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  },
  readdir: (dir) => readdir(dir),
  async run(file, args) {
    const { stdout } = await execFileAsync(file, args, { timeout: 10000 });
    return stdout;
  },
});

/** Sort key for a name like "Godot_v4.7.1-stable_macos.universal.app". */
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

class Detector {
  /** Human-readable descriptions of everything looked at, for the error. */
  readonly searched: string[] = [];
  private readonly p: path.PlatformPath;
  private readonly win: boolean;
  private readonly checked = new Set<string>();

  constructor(private readonly d: DetectDeps) {
    this.win = d.platform === "win32";
    this.p = this.win ? path.win32 : path.posix;
  }

  private note(what: string): void {
    if (!this.searched.includes(what)) this.searched.push(what);
  }

  async validate(exe: string): Promise<boolean> {
    try {
      return (await this.d.run(exe, ["--version"])).trim().length > 0;
    } catch {
      return false;
    }
  }

  /** Returns exe if it exists, is executable and reports a version. */
  private async tryExe(exe: string): Promise<string | null> {
    if (this.checked.has(exe)) return null;
    this.checked.add(exe);
    if ((await this.d.isExecutable(exe)) && (await this.validate(exe))) {
      return exe;
    }
    return null;
  }

  private async list(dir: string): Promise<string[]> {
    try {
      return await this.d.readdir(dir);
    } catch {
      return [];
    }
  }

  /** Try fixed file names inside a directory. */
  private async inDirNamed(dir: string, names: string[]): Promise<string | null> {
    this.note(dir);
    for (const name of names) {
      const hit = await this.tryExe(this.p.join(dir, name));
      if (hit) return hit;
    }
    return null;
  }

  /** Try every entry in dir matching pattern, newest version first. */
  private async inDirMatching(dir: string, pattern: RegExp): Promise<string | null> {
    this.note(`${dir}${this.p.sep}${pattern.source.replace(/^\^/, "")}`.replace(/\.\*/g, "*"));
    const names = (await this.list(dir))
      .filter((n) => pattern.test(n))
      .sort(compareVersionsDesc);
    for (const name of names) {
      const hit = await this.tryExe(this.p.join(dir, name));
      if (hit) return hit;
    }
    return null;
  }

  private exeNames(base: string): string[] {
    return this.win ? [`${base}.exe`, `${base}.cmd`, `${base}.bat`] : [base];
  }

  /** Windows .exe files named Godot*.exe directly in dir. */
  private winExePattern = /^Godot.*\.exe$/i;

  /** Godot*.exe in dir, or in any Godot* subfolder of dir. */
  private async winInstallsUnder(dir: string, folder: RegExp): Promise<string | null> {
    const direct = await this.inDirMatching(dir, this.winExePattern);
    if (direct) return direct;
    const folders = (await this.list(dir))
      .filter((n) => folder.test(n) && !/\.exe$/i.test(n))
      .sort(compareVersionsDesc);
    for (const f of folders) {
      const hit = await this.inDirMatching(this.p.join(dir, f), this.winExePattern);
      if (hit) return hit;
    }
    return null;
  }

  async fromPath(): Promise<string | null> {
    const raw = this.d.env.PATH ?? this.d.env.Path ?? "";
    const dirs = raw.split(this.win ? ";" : ":").filter(Boolean);
    this.note(`PATH (${dirs.length} directories: godot, godot4, Godot_v4*)`);
    const names = [...this.exeNames("godot"), ...this.exeNames("godot4")];
    const pattern = this.win ? /^Godot_v4.*\.exe$/i : /^Godot_v4/i;
    for (const dir of dirs) {
      for (const name of names) {
        const hit = await this.tryExe(this.p.join(dir, name));
        if (hit) return hit;
      }
      const names2 = (await this.list(dir)).filter((n) => pattern.test(n)).sort(compareVersionsDesc);
      for (const n of names2) {
        const hit = await this.tryExe(this.p.join(dir, n));
        if (hit) return hit;
      }
    }
    return null;
  }

  async windows(): Promise<string | null> {
    const { env, homedir } = this.d;
    const pf = [env.ProgramFiles ?? "C:\\Program Files", env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)"];
    for (const dir of pf) {
      const hit = await this.winInstallsUnder(dir, /^Godot/i);
      if (hit) return hit;
    }
    const local = env.LOCALAPPDATA ?? this.p.join(homedir, "AppData\\Local");
    const programs = await this.winInstallsUnder(this.p.join(local, "Programs"), /^Godot/i);
    if (programs) return programs;

    const scoopRoot = env.SCOOP ?? this.p.join(homedir, "scoop");
    for (const dir of [
      this.p.join(scoopRoot, "apps", "godot", "current"),
      this.p.join(scoopRoot, "apps", "godot-mono", "current"),
    ]) {
      const hit = await this.inDirMatching(dir, this.winExePattern);
      if (hit) return hit;
    }
    const shim = await this.inDirNamed(this.p.join(scoopRoot, "shims"), this.exeNames("godot"));
    if (shim) return shim;

    for (const dir of pf) {
      const hit = await this.inDirMatching(
        this.p.join(dir, "Steam", "steamapps", "common", "Godot Engine"),
        this.winExePattern
      );
      if (hit) return hit;
    }

    // Unzipped release: Downloads\Godot_v4*.exe or Downloads\Godot_v4*\Godot_v4*.exe
    const downloads = this.p.join(homedir, "Downloads");
    return this.winInstallsUnder(downloads, /^Godot_v4/i);
  }

  async mac(): Promise<string | null> {
    const { homedir } = this.d;
    const appDirs = ["/Applications", this.p.join(homedir, "Applications")];
    for (const dir of appDirs) {
      this.note(`${dir}/Godot*.app/Contents/MacOS/Godot`);
      const bundles = (await this.list(dir))
        .filter((n) => /^Godot.*\.app$/i.test(n))
        .sort(compareVersionsDesc);
      for (const b of bundles) {
        const hit = await this.tryExe(this.p.join(dir, b, "Contents/MacOS/Godot"));
        if (hit) return hit;
      }
    }
    for (const exe of [
      "/opt/homebrew/bin/godot",
      "/usr/local/bin/godot",
      this.p.join(homedir, "Library/Application Support/Steam/steamapps/common/Godot Engine/Godot.app/Contents/MacOS/Godot"),
    ]) {
      this.note(exe);
      const hit = await this.tryExe(exe);
      if (hit) return hit;
    }
    // Bundles kept under ~/Documents, ~/Downloads or ~/Desktop.
    for (const sub of ["Documents", "Downloads", "Desktop"]) {
      const dir = this.p.join(homedir, sub);
      this.note(`${dir}/**/Godot*.app (depth 6)`);
      let out: string;
      try {
        out = await this.d.run("find", [dir, "-maxdepth", "6", "-name", "Godot*.app", "-type", "d"]);
      } catch {
        continue;
      }
      const apps = out
        .trim()
        .split("\n")
        .filter(Boolean)
        .sort((a, b) => compareVersionsDesc(this.p.basename(a), this.p.basename(b)));
      for (const app of apps) {
        const hit = await this.tryExe(this.p.join(app, "Contents/MacOS/Godot"));
        if (hit) return hit;
      }
    }
    return null;
  }

  async linux(): Promise<string | null> {
    const { homedir } = this.d;
    for (const dir of ["/usr/bin", "/usr/local/bin", this.p.join(homedir, ".local/bin"), "/opt/godot"]) {
      const hit =
        (await this.inDirNamed(dir, ["godot", "godot4"])) ??
        (await this.inDirMatching(dir, /^Godot_v4/i));
      if (hit) return hit;
    }
    // Flatpak (system and user installs) and snap
    for (const exe of [
      "/var/lib/flatpak/exports/bin/org.godotengine.Godot",
      this.p.join(homedir, ".local/share/flatpak/exports/bin/org.godotengine.Godot"),
      "/snap/bin/godot",
      "/snap/bin/godot4",
    ]) {
      this.note(exe);
      const hit = await this.tryExe(exe);
      if (hit) return hit;
    }
    // Steam library folders
    for (const dir of [
      this.p.join(homedir, ".steam/steam/steamapps/common/Godot Engine"),
      this.p.join(homedir, ".local/share/Steam/steamapps/common/Godot Engine"),
    ]) {
      const hit = await this.inDirMatching(dir, /^godot/i);
      if (hit) return hit;
    }
    return null;
  }
}

export async function findGodotPath(deps: DetectDeps = defaultDeps()): Promise<string> {
  const envPath = deps.env.GODOT_PATH;
  const det = new Detector(deps);
  if (envPath) {
    if (await det.validate(envPath)) return envPath;
    throw new Error(
      `GODOT_PATH is set to "${envPath}" but it is not a valid Godot executable`
    );
  }

  const found =
    (await det.fromPath()) ??
    (deps.platform === "win32"
      ? await det.windows()
      : deps.platform === "darwin"
        ? await det.mac()
        : await det.linux());
  if (found) return found;

  throw new Error(
    `Could not find a Godot executable (platform: ${deps.platform}). GODOT_PATH is not set.\n` +
      `Searched:\n${det.searched.map((s) => `  - ${s}`).join("\n")}\n` +
      "Set the GODOT_PATH environment variable to the full path of your Godot executable " +
      "(on macOS: YourGodot.app/Contents/MacOS/Godot)."
  );
}

export async function getGodotVersion(godotPath: string): Promise<string> {
  const { stdout } = await execFileAsync(godotPath, ["--version"], {
    timeout: 10000,
  });
  return stdout.trim();
}

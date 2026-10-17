import { describe, it, expect } from "vitest";
import { findGodotPath, type DetectDeps } from "../godot-path.js";

/** Fake filesystem: `files` are executable paths, dirs derived from them. */
function makeDeps(
  platform: NodeJS.Platform,
  files: string[],
  env: Record<string, string | undefined> = {},
  homedir = platform === "win32" ? "C:\\Users\\me" : "/home/me"
): DetectDeps {
  const sep = platform === "win32" ? "\\" : "/";
  const norm = (p: string) => p.replace(/[\\/]+$/, "");
  return {
    platform,
    env,
    homedir,
    async isExecutable(p) {
      return files.includes(p);
    },
    async readdir(dir) {
      const prefix = norm(dir) + sep;
      const names = new Set<string>();
      for (const f of files) {
        if (f.startsWith(prefix)) names.add(f.slice(prefix.length).split(/[\\/]/)[0]);
      }
      if (names.size === 0) throw new Error("ENOENT");
      return [...names];
    },
    async run(file, args) {
      if (file === "find") return "";
      if (args[0] === "--version" && files.includes(file)) return "4.4.stable\n";
      throw new Error("not executable");
    },
  };
}

describe("findGodotPath", () => {
  it("uses a valid GODOT_PATH", async () => {
    const deps = makeDeps("linux", ["/x/godot"], { GODOT_PATH: "/x/godot" });
    expect(await findGodotPath(deps)).toBe("/x/godot");
  });

  it("rejects an invalid GODOT_PATH without falling back", async () => {
    const deps = makeDeps("linux", ["/usr/bin/godot"], { GODOT_PATH: "/nope" });
    await expect(findGodotPath(deps)).rejects.toThrow(/GODOT_PATH is set to "\/nope"/);
  });

  it("finds godot4 on PATH", async () => {
    const deps = makeDeps("linux", ["/opt/bin/godot4"], { PATH: "/a:/opt/bin" });
    expect(await findGodotPath(deps)).toBe("/opt/bin/godot4");
  });

  it("finds Godot_v4* on PATH, newest first", async () => {
    const deps = makeDeps(
      "linux",
      ["/opt/bin/Godot_v4.2-stable_linux.x86_64", "/opt/bin/Godot_v4.4-stable_linux.x86_64"],
      { PATH: "/opt/bin" }
    );
    expect(await findGodotPath(deps)).toBe("/opt/bin/Godot_v4.4-stable_linux.x86_64");
  });

  it("skips non-executable PATH matches", async () => {
    const deps = makeDeps("linux", ["/usr/local/bin/godot"], { PATH: "/usr/bin" });
    expect(await findGodotPath(deps)).toBe("/usr/local/bin/godot");
  });

  describe("linux", () => {
    it.each([
      "/usr/bin/godot",
      "/home/me/.local/bin/godot",
      "/var/lib/flatpak/exports/bin/org.godotengine.Godot",
      "/home/me/.local/share/flatpak/exports/bin/org.godotengine.Godot",
      "/snap/bin/godot",
      "/home/me/.steam/steam/steamapps/common/Godot Engine/godot.x86_64",
    ])("finds %s", async (exe) => {
      expect(await findGodotPath(makeDeps("linux", [exe]))).toBe(exe);
    });
  });

  describe("macOS", () => {
    it("finds the newest Godot*.app in /Applications", async () => {
      const a = "/Applications/Godot_v4.3-stable_macos.universal.app/Contents/MacOS/Godot";
      const b = "/Applications/Godot_v4.6-stable_macos.universal.app/Contents/MacOS/Godot";
      expect(await findGodotPath(makeDeps("darwin", [a, b]))).toBe(b);
    });

    it("finds ~/Applications/Godot.app", async () => {
      const exe = "/home/me/Applications/Godot.app/Contents/MacOS/Godot";
      expect(await findGodotPath(makeDeps("darwin", [exe]))).toBe(exe);
    });
  });

  describe("windows", () => {
    const home = "C:\\Users\\me";
    const env = {
      ProgramFiles: "C:\\Program Files",
      "ProgramFiles(x86)": "C:\\Program Files (x86)",
      LOCALAPPDATA: `${home}\\AppData\\Local`,
    };

    it.each([
      "C:\\Program Files\\Godot\\Godot_v4.4-stable_win64.exe",
      "C:\\Program Files\\Godot_v4.3\\Godot.exe",
      `${home}\\AppData\\Local\\Programs\\Godot\\Godot.exe`,
      `${home}\\scoop\\apps\\godot\\current\\godot.exe`,
      `${home}\\scoop\\shims\\godot.exe`,
      "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Godot Engine\\godot.windows.opt.tools.64.exe",
      `${home}\\Downloads\\Godot_v4.4-stable_win64.exe`,
      `${home}\\Downloads\\Godot_v4.4-stable_win64\\Godot_v4.4-stable_win64.exe`,
    ])("finds %s", async (exe) => {
      expect(await findGodotPath(makeDeps("win32", [exe], env))).toBe(exe);
    });

    it("finds godot.exe on a ;-separated PATH", async () => {
      const exe = "D:\\tools\\godot.exe";
      const deps = makeDeps("win32", [exe], { ...env, PATH: "C:\\Windows;D:\\tools" });
      expect(await findGodotPath(deps)).toBe(exe);
    });
  });

  it("lists what was searched when nothing is found", async () => {
    const err = await findGodotPath(makeDeps("linux", [], { PATH: "/usr/bin" })).catch((e) => e);
    expect(err.message).toMatch(/Could not find a Godot executable/);
    expect(err.message).toMatch(/Searched:/);
    expect(err.message).toContain("PATH");
    expect(err.message).toContain("/usr/local/bin");
    expect(err.message).toContain("org.godotengine.Godot");
    expect(err.message).toContain("/snap/bin/godot");
    expect(err.message).toContain("Set the GODOT_PATH");
  });

  it("lists Windows locations in the error", async () => {
    const err = await findGodotPath(makeDeps("win32", [])).catch((e) => e);
    expect(err.message).toContain("Program Files");
    expect(err.message).toContain("Programs");
    expect(err.message).toContain("scoop");
    expect(err.message).toContain("Godot Engine");
    expect(err.message).toContain("Downloads");
  });
});

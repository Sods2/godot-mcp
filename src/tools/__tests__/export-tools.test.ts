import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
  rename: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { createMockServer } from "../../__tests__/helpers/mock-server.js";
import { registerExportTools } from "../export-tools.js";

const SAMPLE_PRESETS = `[preset.0]
name="Linux/X11"
platform="Linux/X11"
export_path="build/game.x86_64"

[preset.1]
name="Windows Desktop"
platform="Windows Desktop"
export_path="build/game.exe"
`;

describe("export-tools", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  const godotPath = vi.fn(async () => "/usr/bin/godot");

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = createMockServer();
    registerExportTools(mockServer.server, godotPath);
  });

  describe("godot_list_export_presets", () => {
    it("parses and returns export presets from cfg file", async () => {
      vi.mocked(readFile).mockResolvedValue(SAMPLE_PRESETS as unknown as Buffer);
      const result = await mockServer.callTool("godot_list_export_presets", {
        project_path: "/proj",
      });
      expect(result.isError).toBeUndefined();
      const presets = JSON.parse(result.content[0].text!);
      expect(presets).toHaveLength(2);
      expect(presets[0].name).toBe("Linux/X11");
      expect(presets[1].name).toBe("Windows Desktop");
    });

    it("returns message when no export presets found", async () => {
      vi.mocked(readFile).mockRejectedValue(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" })
      );
      const result = await mockServer.callTool("godot_list_export_presets", {
        project_path: "/proj",
      });
      expect(result.content[0].text).toContain("No export presets found");
    });
  });

  describe("godot_export_project", () => {
    it("calls godot with correct export args for release build", async () => {
      vi.mocked(execFile).mockImplementation(
        (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
          (cb as Function)(null, { stdout: "Export OK", stderr: "" });
          return {} as ReturnType<typeof execFile>;
        }
      );
      const result = await mockServer.callTool("godot_export_project", {
        project_path: "/proj",
        preset: "Linux/X11",
        output_path: "build/game.x86_64",
      });
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text!);
      expect(data.preset).toBe("Linux/X11");
      expect(data.stdout).toBe("Export OK");
      const callArgs = vi.mocked(execFile).mock.calls[0];
      expect(callArgs[1]).toContain("--export-release");
      expect(callArgs[1]).toContain("Linux/X11");
    });

    it("uses --export-debug for debug builds", async () => {
      vi.mocked(execFile).mockImplementation(
        (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
          (cb as Function)(null, { stdout: "", stderr: "" });
          return {} as ReturnType<typeof execFile>;
        }
      );
      await mockServer.callTool("godot_export_project", {
        project_path: "/proj",
        preset: "Linux/X11",
        output_path: "build/game",
        debug: true,
      });
      expect(vi.mocked(execFile).mock.calls[0][1]).toContain("--export-debug");
    });

    it("returns error when godotPath throws", async () => {
      godotPath.mockRejectedValueOnce(new Error("Godot not found"));
      const result = await mockServer.callTool("godot_export_project", {
        project_path: "/proj",
        preset: "Linux",
        output_path: "out",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Godot not found");
    });
  });

  describe("godot_export_mesh_library", () => {
    it("runs godot headless script and parses JSON output", async () => {
      vi.mocked(execFile).mockImplementation(
        (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
          (cb as Function)(null, {
            stdout: 'Some noise\n{"success":true,"output":"res://lib.meshlib"}\n',
            stderr: "",
          });
          return {} as ReturnType<typeof execFile>;
        }
      );
      const result = await mockServer.callTool("godot_export_mesh_library", {
        project_path: "/proj",
        scene_path: "res://meshes/scene.tscn",
        output_path: "res://lib.meshlib",
      });
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text!);
      expect(data.success).toBe(true);
    });

    it("returns raw output when no JSON found", async () => {
      vi.mocked(execFile).mockImplementation(
        (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
          (cb as Function)(null, { stdout: "Export completed", stderr: "" });
          return {} as ReturnType<typeof execFile>;
        }
      );
      const result = await mockServer.callTool("godot_export_mesh_library", {
        project_path: "/proj",
        scene_path: "res://s.tscn",
        output_path: "res://out.meshlib",
      });
      expect(result.content[0].text).toContain("Export completed");
    });
  });
});

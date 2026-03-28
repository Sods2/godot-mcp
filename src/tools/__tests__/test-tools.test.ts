import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { readFile, writeFile, mkdir, access, readdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { createMockServer } from "../../__tests__/helpers/mock-server.js";
import { registerTestTools } from "../test-tools.js";

const GUT_OUTPUT = `
GUT v9.3.0

PASSED  test_player_moves
PASSED  test_player_jumps
FAILED  test_collision

Passed:  2  Failed:  1  Errors:  0  Warnings:  0  Skipped:  0
Total time: 0.42s
`;

const GDUNIT4_OUTPUT = `
[PASSED] TestPlayer.test_initial_position
[PASSED] TestPlayer.test_movement
[FAILED] TestEnemy.test_ai
`;

const BUILTIN_OUTPUT = `
Some Godot noise
{"framework":"builtin","passed":3,"failed":1,"errors":0,"skipped":0,"duration_ms":120,"tests":[{"name":"test_one","suite":"test_player","status":"passed"}]}
`;

describe("test-tools", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  const godotPath = vi.fn(async () => "/usr/bin/godot");

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = createMockServer();
    registerTestTools(mockServer.server, godotPath);
  });

  describe("godot_detect_test_framework", () => {
    it("detects GUT when addons/gut directory exists", async () => {
      vi.mocked(access).mockImplementation(async (p: unknown) => {
        if (String(p).endsWith("gut")) return undefined;
        throw new Error("ENOENT");
      });
      vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
      const result = await mockServer.callTool("godot_detect_test_framework", {
        project_path: "/proj",
      });
      const data = JSON.parse(result.content[0].text!);
      expect(data.framework).toBe("gut");
    });

    it("detects GdUnit4 when addons/gdUnit4 exists and GUT does not", async () => {
      vi.mocked(access).mockImplementation(async (p: unknown) => {
        if (String(p).endsWith("gdUnit4")) return undefined;
        throw new Error("ENOENT");
      });
      const result = await mockServer.callTool("godot_detect_test_framework", {
        project_path: "/proj",
      });
      const data = JSON.parse(result.content[0].text!);
      expect(data.framework).toBe("gdunit4");
    });

    it("falls back to builtin when no framework found", async () => {
      vi.mocked(access).mockRejectedValue(new Error("ENOENT"));
      const result = await mockServer.callTool("godot_detect_test_framework", {
        project_path: "/proj",
      });
      const data = JSON.parse(result.content[0].text!);
      expect(data.framework).toBe("builtin");
    });

    it("reads .gutconfig.json dirs when present", async () => {
      vi.mocked(access).mockImplementation(async (p: unknown) => {
        const ps = String(p);
        if (ps.endsWith("gut") || ps.endsWith(".gutconfig.json")) return undefined;
        throw new Error("ENOENT");
      });
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ dirs: ["res://tests", "res://unit"] }) as unknown as Buffer
      );
      const result = await mockServer.callTool("godot_detect_test_framework", {
        project_path: "/proj",
      });
      const data = JSON.parse(result.content[0].text!);
      expect(data.test_directories).toContain("res://tests");
      expect(data.test_directories).toContain("res://unit");
    });
  });

  describe("godot_list_tests", () => {
    it("scans directory and extracts test methods from gd files", async () => {
      vi.mocked(access).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(readdir).mockResolvedValue(
        ["test_player.gd"] as unknown as ReturnType<typeof readdir> extends Promise<infer T> ? T : never
      );
      vi.mocked(stat).mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
      } as unknown as ReturnType<typeof stat> extends Promise<infer T> ? T : never);
      vi.mocked(readFile).mockResolvedValue(
        `extends GutTest\nfunc test_moves():\n\tpass\nfunc test_jumps():\n\tpass\n` as unknown as Buffer
      );
      const result = await mockServer.callTool("godot_list_tests", {
        project_path: "/proj",
        directory: "res://tests",
      });
      const data = JSON.parse(result.content[0].text!);
      expect(data.test_files).toHaveLength(1);
      expect(data.test_files[0].methods).toContain("test_moves");
      expect(data.test_files[0].methods).toContain("test_jumps");
    });

    it("returns empty test_files when directory does not exist", async () => {
      vi.mocked(access).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(readdir).mockRejectedValue(new Error("ENOENT"));
      const result = await mockServer.callTool("godot_list_tests", {
        project_path: "/proj",
        directory: "res://tests",
      });
      const data = JSON.parse(result.content[0].text!);
      expect(data.test_files).toEqual([]);
    });
  });

  describe("godot_create_test", () => {
    it("generates GUT test skeleton and writes file", async () => {
      vi.mocked(access).mockImplementation(async (p: unknown) => {
        if (String(p).endsWith("gut")) return undefined;
        throw new Error("ENOENT");
      });
      vi.mocked(readFile).mockImplementation(async (p: unknown) => {
        if (String(p).endsWith(".gutconfig.json"))
          throw new Error("ENOENT");
        return `extends Node\nfunc move():\n\tpass\nfunc jump():\n\tpass\n` as unknown as Buffer;
      });
      vi.mocked(mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFile).mockResolvedValue(undefined);
      const result = await mockServer.callTool("godot_create_test", {
        project_path: "/proj",
        source_script: "res://src/player.gd",
      });
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text!);
      expect(data.framework).toBe("gut");
      expect(data.content).toContain("extends GutTest");
      expect(data.content).toContain("test_move");
      expect(data.content).toContain("test_jump");
    });

    it("generates builtin test skeleton when no framework detected", async () => {
      vi.mocked(access).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(readFile).mockResolvedValue(
        `extends Node\nfunc heal():\n\tpass\n` as unknown as Buffer
      );
      vi.mocked(mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFile).mockResolvedValue(undefined);
      const result = await mockServer.callTool("godot_create_test", {
        project_path: "/proj",
        source_script: "res://src/health.gd",
        framework: "builtin",
      });
      const data = JSON.parse(result.content[0].text!);
      expect(data.framework).toBe("builtin");
      expect(data.content).toContain("extends RefCounted");
    });
  });

  describe("godot_run_tests", () => {
    describe("GUT output parsing", () => {
      it("parses GUT output and returns structured results", async () => {
        vi.mocked(access).mockImplementation(async (p: unknown) => {
          if (String(p).endsWith("gut")) return undefined;
          throw new Error("ENOENT");
        });
        vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
        vi.mocked(execFile).mockImplementation(
          (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
            (cb as Function)(null, { stdout: GUT_OUTPUT, stderr: "" });
            return {} as ReturnType<typeof execFile>;
          }
        );
        const result = await mockServer.callTool("godot_run_tests", {
          project_path: "/proj",
        });
        const data = JSON.parse(result.content[0].text!);
        expect(data.framework).toBe("gut");
        expect(data.passed).toBe(2);
        expect(data.failed).toBe(1);
      });
    });

    describe("GdUnit4 output parsing", () => {
      it("parses GdUnit4 output and returns structured results", async () => {
        vi.mocked(access).mockImplementation(async (p: unknown) => {
          if (String(p).endsWith("gdUnit4")) return undefined;
          throw new Error("ENOENT");
        });
        vi.mocked(execFile).mockImplementation(
          (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
            (cb as Function)(null, { stdout: GDUNIT4_OUTPUT, stderr: "" });
            return {} as ReturnType<typeof execFile>;
          }
        );
        const result = await mockServer.callTool("godot_run_tests", {
          project_path: "/proj",
        });
        const data = JSON.parse(result.content[0].text!);
        expect(data.framework).toBe("gdunit4");
        expect(data.passed).toBe(2);
        expect(data.failed).toBe(1);
      });
    });

    describe("Builtin output parsing", () => {
      it("parses builtin JSON output and returns structured results", async () => {
        vi.mocked(access).mockRejectedValue(new Error("ENOENT"));
        vi.mocked(execFile).mockImplementation(
          (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
            (cb as Function)(null, { stdout: BUILTIN_OUTPUT, stderr: "" });
            return {} as ReturnType<typeof execFile>;
          }
        );
        const result = await mockServer.callTool("godot_run_tests", {
          project_path: "/proj",
          framework: "builtin",
        });
        const data = JSON.parse(result.content[0].text!);
        expect(data.framework).toBe("builtin");
        expect(data.passed).toBe(3);
        expect(data.failed).toBe(1);
        expect(data.duration_ms).toBe(120);
      });
    });

    it("sets isError when tests fail", async () => {
      vi.mocked(access).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(execFile).mockImplementation(
        (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
          (cb as Function)(null, {
            stdout:
              '{"framework":"builtin","passed":0,"failed":1,"errors":0,"skipped":0,"duration_ms":10,"tests":[]}',
            stderr: "",
          });
          return {} as ReturnType<typeof execFile>;
        }
      );
      const result = await mockServer.callTool("godot_run_tests", {
        project_path: "/proj",
        framework: "builtin",
      });
      expect(result.isError).toBe(true);
    });
  });
});

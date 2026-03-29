import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
  rename: vi.fn(),
  access: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { readFile, writeFile, mkdir, readdir, stat, unlink, rename } from "node:fs/promises";
import { execFile } from "node:child_process";
import { createMockServer } from "../../__tests__/helpers/mock-server.js";
import { createMockBridge } from "../../__tests__/helpers/mock-bridge.js";
import { registerFileTools } from "../file-tools.js";

const SIMPLE_TSCN = `[gd_scene load_steps=1 format=3]

[node name="Root" type="Node2D"]
`;

const godotPath = vi.fn(async () => "/usr/bin/godot");

describe("file-tools", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockBridge: ReturnType<typeof createMockBridge>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = createMockServer();
    mockBridge = createMockBridge({ connected: false });
    registerFileTools(mockServer.server, mockBridge, godotPath);
  });

  describe("godot_parse_scene", () => {
    it("reads tscn file and returns parsed JSON", async () => {
      vi.mocked(readFile).mockResolvedValue(SIMPLE_TSCN as unknown as Buffer);
      const result = await mockServer.callTool("godot_parse_scene", {
        project_path: "/proj",
        scene_path: "res://main.tscn",
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed.nodes).toBeDefined();
    });

    it("returns error when file read fails", async () => {
      vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
      const result = await mockServer.callTool("godot_parse_scene", {
        project_path: "/proj",
        scene_path: "res://missing.tscn",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("ENOENT");
    });
  });

  describe("godot_create_scene", () => {
    it("creates directory and writes new tscn file", async () => {
      vi.mocked(mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFile).mockResolvedValue(undefined);
      const result = await mockServer.callTool("godot_create_scene", {
        project_path: "/proj",
        scene_path: "res://scenes/player.tscn",
        root_node_type: "CharacterBody2D",
        root_node_name: "Player",
      });
      expect(result.isError).toBeUndefined();
      expect(vi.mocked(mkdir)).toHaveBeenCalledWith(
        expect.stringContaining("scenes"),
        { recursive: true }
      );
      expect(vi.mocked(writeFile)).toHaveBeenCalled();
      expect(result.content[0].text).toContain("CharacterBody2D");
    });

    it("uses scene filename as root node name when not provided", async () => {
      vi.mocked(mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFile).mockResolvedValue(undefined);
      const result = await mockServer.callTool("godot_create_scene", {
        project_path: "/proj",
        scene_path: "res://enemy.tscn",
        root_node_type: "Node2D",
      });
      expect(result.content[0].text).toContain('"enemy"');
    });
  });

  describe("godot_add_node_to_file", () => {
    it("reads scene, adds node, and writes back", async () => {
      vi.mocked(readFile).mockResolvedValue(SIMPLE_TSCN as unknown as Buffer);
      vi.mocked(writeFile).mockResolvedValue(undefined);
      const result = await mockServer.callTool("godot_add_node_to_file", {
        project_path: "/proj",
        scene_path: "res://main.tscn",
        node_type: "Sprite2D",
        node_name: "Icon",
        parent_path: ".",
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Sprite2D");
      expect(vi.mocked(writeFile)).toHaveBeenCalled();
    });

    it("returns error when scene file missing", async () => {
      vi.mocked(readFile).mockRejectedValue(new Error("File not found"));
      const result = await mockServer.callTool("godot_add_node_to_file", {
        project_path: "/proj",
        scene_path: "res://missing.tscn",
        node_type: "Node",
        node_name: "N",
        parent_path: ".",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_set_property_in_file", () => {
    it("reads scene, sets property, and writes back", async () => {
      vi.mocked(readFile).mockResolvedValue(SIMPLE_TSCN as unknown as Buffer);
      vi.mocked(writeFile).mockResolvedValue(undefined);
      const result = await mockServer.callTool("godot_set_property_in_file", {
        project_path: "/proj",
        scene_path: "res://main.tscn",
        node_path: "Root",
        property: "visible",
        value: "false",
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("visible");
    });
  });

  describe("godot_load_sprite_in_file", () => {
    it("adds ext_resource and sets texture property", async () => {
      vi.mocked(readFile).mockResolvedValue(SIMPLE_TSCN as unknown as Buffer);
      vi.mocked(writeFile).mockResolvedValue(undefined);
      const result = await mockServer.callTool("godot_load_sprite_in_file", {
        project_path: "/proj",
        scene_path: "res://main.tscn",
        node_path: "Root",
        texture_path: "res://icon.png",
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("icon.png");
    });
  });

  describe("godot_validate_script", () => {
    it("runs godot --check-only and reports valid script", async () => {
      vi.mocked(execFile).mockImplementation(
        (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
          (cb as Function)(null, { stdout: "", stderr: "" });
          return {} as ReturnType<typeof execFile>;
        }
      );
      const result = await mockServer.callTool("godot_validate_script", {
        project_path: "/proj",
        script_path: "res://player.gd",
      });
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("valid");
      const callArgs = vi.mocked(execFile).mock.calls[0];
      expect(callArgs[1]).toContain("--check-only");
    });

    it("detects errors in output and sets isError", async () => {
      vi.mocked(execFile).mockImplementation(
        (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
          const err = Object.assign(new Error("Command failed"), {
            stdout: "",
            stderr: "ERROR: parse error at line 5",
          });
          (cb as Function)(err);
          return {} as ReturnType<typeof execFile>;
        }
      );
      const result = await mockServer.callTool("godot_validate_script", {
        project_path: "/proj",
        script_path: "res://bad.gd",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("parse error at line 5");
    });

    it("detects SCRIPT ERROR in output even when exit code is 0", async () => {
      vi.mocked(execFile).mockImplementation(
        (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
          (cb as Function)(null, { stdout: "SCRIPT ERROR: 'bad_var' is not declared in the current scope.\n   at: res://bad.gd:10", stderr: "" });
          return {} as ReturnType<typeof execFile>;
        }
      );
      const result = await mockServer.callTool("godot_validate_script", {
        project_path: "/proj",
        script_path: "res://bad.gd",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("SCRIPT ERROR");
    });

    it("detects project-level load error even when exit code is 0", async () => {
      vi.mocked(execFile).mockImplementation(
        (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
          (cb as Function)(null, { stdout: "", stderr: "ERROR: Failed to load resource: res://scenes/main.tscn" });
          return {} as ReturnType<typeof execFile>;
        }
      );
      const result = await mockServer.callTool("godot_validate_script", {
        project_path: "/proj",
        script_path: "res://player.gd",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("project-level errors");
    });
  });

  describe("godot_create_folder", () => {
    it("creates directory at resolved path", async () => {
      vi.mocked(mkdir).mockResolvedValue(undefined);
      const result = await mockServer.callTool("godot_create_folder", {
        project_path: "/proj",
        folder_path: "res://src/enemies",
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("res://src/enemies");
      expect(vi.mocked(mkdir)).toHaveBeenCalledWith(
        expect.stringContaining("enemies"),
        { recursive: true }
      );
    });

    it("returns error when mkdir fails", async () => {
      vi.mocked(mkdir).mockRejectedValue(new Error("Permission denied"));
      const result = await mockServer.callTool("godot_create_folder", {
        project_path: "/proj",
        folder_path: "res://locked",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_list_directory", () => {
    it("lists and sorts entries (directories first, then alphabetical)", async () => {
      const mockEntries = [
        { name: "script.gd", isDirectory: () => false, isFile: () => true },
        { name: "src", isDirectory: () => true, isFile: () => false },
        { name: "assets", isDirectory: () => true, isFile: () => false },
      ];
      vi.mocked(readdir).mockResolvedValue(
        mockEntries as unknown as ReturnType<typeof readdir> extends Promise<infer T> ? T : never
      );
      vi.mocked(stat).mockResolvedValue({
        size: 100,
        mtime: new Date("2025-01-01"),
        isFile: () => true,
        isDirectory: () => false,
      } as unknown as ReturnType<typeof stat> extends Promise<infer T> ? T : never);
      const result = await mockServer.callTool("godot_list_directory", {
        project_path: "/proj",
      });
      const entries = JSON.parse(result.content[0].text!);
      expect(entries[0].name).toBe("assets");
      expect(entries[1].name).toBe("src");
      expect(entries[2].name).toBe("script.gd");
    });

    it("returns error when readdir fails", async () => {
      vi.mocked(readdir).mockRejectedValue(new Error("Not a directory"));
      const result = await mockServer.callTool("godot_list_directory", {
        project_path: "/proj",
        directory: "res://nonexistent",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_delete_file", () => {
    it("unlinks the resolved file path", async () => {
      vi.mocked(unlink).mockResolvedValue(undefined);
      const result = await mockServer.callTool("godot_delete_file", {
        project_path: "/proj",
        path: "res://old_script.gd",
      });
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text!);
      expect(data.success).toBe(true);
      expect(vi.mocked(unlink)).toHaveBeenCalledWith(
        expect.stringContaining("old_script.gd")
      );
    });

    it("returns error when unlink fails", async () => {
      vi.mocked(unlink).mockRejectedValue(new Error("ENOENT: no such file"));
      const result = await mockServer.callTool("godot_delete_file", {
        project_path: "/proj",
        path: "res://missing.gd",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_rename_file", () => {
    it("creates target directory and renames file", async () => {
      vi.mocked(mkdir).mockResolvedValue(undefined);
      vi.mocked(rename).mockResolvedValue(undefined);
      const result = await mockServer.callTool("godot_rename_file", {
        project_path: "/proj",
        path: "res://old.gd",
        new_path: "res://src/new.gd",
      });
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text!);
      expect(data.success).toBe(true);
      expect(data.old_path).toBe("res://old.gd");
      expect(data.new_path).toBe("res://src/new.gd");
    });
  });

  describe("godot_list_resources", () => {
    it("returns resources from recursive scan", async () => {
      vi.mocked(readdir).mockResolvedValue([
        { name: "icon.png", isDirectory: () => false, isFile: () => true },
      ] as unknown as ReturnType<typeof readdir> extends Promise<infer T> ? T : never);
      vi.mocked(stat).mockResolvedValue({
        size: 2048,
        mtime: new Date("2025-01-01"),
        isFile: () => true,
        isDirectory: () => false,
      } as unknown as ReturnType<typeof stat> extends Promise<infer T> ? T : never);
      const result = await mockServer.callTool("godot_list_resources", {
        project_path: "/proj",
        extensions: [".png"],
      });
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text!);
      expect(data.resources.length).toBeGreaterThan(0);
      expect(data.resources[0].type).toBe("png");
    });
  });

  describe("bridge-based tools (godot_import_asset, godot_read_resource, godot_write_resource)", () => {
    beforeEach(() => {
      mockBridge._setConnected(true);
    });

    it("godot_import_asset sends resource.import with paths", async () => {
      mockBridge._setResponse("resource.import", { reimported: ["res://icon.png"] });
      const result = await mockServer.callTool("godot_import_asset", {
        paths: ["res://icon.png"],
      });
      expect(result.isError).toBeUndefined();
      expect(mockBridge._getCalls()[0].method).toBe("resource.import");
    });

    it("godot_read_resource sends resource.read with path", async () => {
      mockBridge._setResponse("resource.read", {
        path: "res://mat.tres",
        properties: {},
      });
      const result = await mockServer.callTool("godot_read_resource", {
        path: "res://mat.tres",
      });
      expect(result.isError).toBeUndefined();
      expect(mockBridge._getCalls()[0].method).toBe("resource.read");
    });

    it("godot_write_resource sends resource.write with path and properties", async () => {
      mockBridge._setResponse("resource.write", { success: true });
      await mockServer.callTool("godot_write_resource", {
        path: "res://mat.tres",
        properties: { albedo_color: "Color(1,0,0,1)" },
      });
      expect(mockBridge._getCalls()[0].method).toBe("resource.write");
      const params = mockBridge._getCalls()[0].params as Record<string, unknown>;
      expect(params.path).toBe("res://mat.tres");
    });

    it("godot_import_asset returns error when bridge throws", async () => {
      mockBridge._setError("resource.import", new Error("Import failed"));
      const result = await mockServer.callTool("godot_import_asset", {
        paths: ["res://bad.png"],
      });
      expect(result.isError).toBe(true);
    });
  });
});

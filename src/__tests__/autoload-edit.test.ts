import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, writeFile, readFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { addAutoload, removeAutoload, getAutoloads } from "../tools/project-tools.js";
import { createMockBridge } from "./helpers/mock-bridge.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "autoload-edit-"));
  await writeFile(path.join(dir, "game.gd"), "extends Node\n");
  await writeFile(
    path.join(dir, "project.godot"),
    'config_version=5\n\n[autoload]\n\nGlobal="*res://game.gd"\n'
  );
});

describe("addAutoload validation", () => {
  it("rejects a missing script", async () => {
    await expect(addAutoload(dir, "Nope", "res://nope.gd")).rejects.toThrow(/not found/);
  });

  it("rejects non-res:// paths and bad names", async () => {
    await expect(addAutoload(dir, "X", "game.gd")).rejects.toThrow(/res:\/\//);
    await expect(addAutoload(dir, "bad name", "res://game.gd")).rejects.toThrow(/Invalid/);
  });

  it("rejects duplicates unless overwrite", async () => {
    await expect(addAutoload(dir, "Global", "res://game.gd")).rejects.toThrow(/already exists/);
    await expect(addAutoload(dir, "Global", "res://game.gd", { overwrite: true })).resolves.toEqual({ via: "file" });
  });
});

describe("addAutoload routing", () => {
  it("falls back to the file when no bridge is connected", async () => {
    const bridge = createMockBridge({ connected: false });
    const r = await addAutoload(dir, "Other", "res://game.gd", { bridge });
    expect(r.via).toBe("file");
    expect(bridge._getCalls()).toHaveLength(0);
    expect((await getAutoloads(dir)).map((a) => a.name)).toContain("Other");
  });

  it("routes through the bridge and leaves project.godot untouched", async () => {
    const bridge = createMockBridge({ connected: true });
    const before = await readFile(path.join(dir, "project.godot"), "utf-8");
    const r = await addAutoload(dir, "Other", "res://game.gd", { bridge, overwrite: true });
    expect(r.via).toBe("bridge");
    expect(bridge._getCalls()[0]).toEqual({
      method: "project.add_autoload",
      params: { name: "Other", script_path: "res://game.gd", overwrite: true },
    });
    expect(await readFile(path.join(dir, "project.godot"), "utf-8")).toBe(before);
  });

  it("surfaces bridge errors", async () => {
    const bridge = createMockBridge({ connected: true });
    bridge._setResponse("project.add_autoload", { error: "boom" });
    await expect(addAutoload(dir, "Other", "res://game.gd", { bridge })).rejects.toThrow("boom");
  });
});

describe("removeAutoload", () => {
  it("removes from the file without a bridge", async () => {
    expect(await removeAutoload(dir, "Global")).toEqual({ via: "file" });
    expect(await getAutoloads(dir)).toEqual([]);
  });

  it("errors on unknown names in file mode", async () => {
    await expect(removeAutoload(dir, "Missing")).rejects.toThrow(/not found/);
  });

  it("routes through the bridge when connected", async () => {
    const bridge = createMockBridge({ connected: true });
    expect(await removeAutoload(dir, "Global", { bridge })).toEqual({ via: "bridge" });
    expect(bridge._getCalls()[0]).toEqual({ method: "project.remove_autoload", params: { name: "Global" } });
    expect((await getAutoloads(dir)).map((a) => a.name)).toEqual(["Global"]);
  });
});

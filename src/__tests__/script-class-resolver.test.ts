import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveScriptRoot, parseScriptHeader } from "../script-class-resolver.js";
import { TscnParser } from "../parsers/tscn-parser.js";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "gdmcp-"));
  await mkdir(path.join(dir, "scripts"));
  await writeFile(path.join(dir, "scripts/wave_manager.gd"), "class_name WaveManager\nextends Node\n");
  await writeFile(path.join(dir, "scripts/boss.gd"), "@tool\nextends Enemy\nclass_name Boss\n");
  await writeFile(path.join(dir, "scripts/enemy.gd"), "class_name Enemy extends CharacterBody2D\n");
  await writeFile(path.join(dir, "scripts/by_path.gd"), 'extends "res://scripts/enemy.gd"\n');
  await writeFile(path.join(dir, "scripts/no_ext.gd"), "class_name NoExt\n");
});
afterAll(async () => rm(dir, { recursive: true, force: true }));

describe("resolveScriptRoot", () => {
  it("returns null for native types", async () => {
    expect(await resolveScriptRoot(dir, "Node2D")).toBeNull();
  });
  it("resolves class_name to script + native base", async () => {
    expect(await resolveScriptRoot(dir, "WaveManager")).toEqual({
      scriptPath: "res://scripts/wave_manager.gd", baseType: "Node",
    });
  });
  it("follows class_name and path extends chains", async () => {
    expect((await resolveScriptRoot(dir, "Boss"))?.baseType).toBe("CharacterBody2D");
    expect(await resolveScriptRoot(dir, "res://scripts/by_path.gd")).toEqual({
      scriptPath: "res://scripts/by_path.gd", baseType: "CharacterBody2D",
    });
  });
  it("errors on missing script path or no extends", async () => {
    await expect(resolveScriptRoot(dir, "res://nope.gd")).rejects.toThrow(/not found/);
    await expect(resolveScriptRoot(dir, "NoExt")).rejects.toThrow(/no 'extends'/);
  });
  it("parses header", () => {
    expect(parseScriptHeader("# c\nclass_name A extends B\n")).toEqual({ className: "A", extendsName: "B" });
  });
  it("produces a valid tscn with script ext_resource", async () => {
    const p = new TscnParser();
    const r = (await resolveScriptRoot(dir, "WaveManager"))!;
    let s = p.createScene(r.baseType, "Waves");
    const a = p.addExtResource(s, "Script", r.scriptPath);
    s = a.scene;
    s.nodes[0].properties.script = `ExtResource("${a.id}")`;
    const out = p.serialize(s);
    expect(out).toContain('[node name="Waves" type="Node"]');
    expect(out).toContain('[ext_resource type="Script" path="res://scripts/wave_manager.gd"');
    expect(out).toContain(`script = ExtResource("${a.id}")`);
    expect(out).not.toContain("WaveManager\"");
  });
});

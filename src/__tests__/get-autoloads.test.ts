import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { getAutoloads } from "../tools/project-tools.js";

describe("getAutoloads", () => {
  it("reports enabled (*) and disabled autoloads with clean paths", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "autoload-"));
    await writeFile(
      path.join(dir, "project.godot"),
      'config_version=5\n\n[autoload]\n\nGlobal="*res://global.gd"\nOff="res://off.gd"\n'
    );
    const result = await getAutoloads(dir);
    expect(result).toEqual([
      { name: "Global", path: "res://global.gd", enabled: true },
      { name: "Off", path: "res://off.gd", enabled: false },
    ]);
  });
});

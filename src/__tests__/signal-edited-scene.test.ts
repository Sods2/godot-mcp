import { describe, it, expect } from "vitest";
import { editedScenePath } from "../tools/signal-tools.js";

describe("editedScenePath", () => {
  it("uses edited_scene over open_scenes[0]", () => {
    expect(editedScenePath({ open_scenes: ["res://main.tscn", "res://level2.tscn"], edited_scene: "res://level2.tscn" })).toBe("res://level2.tscn");
  });
  it("returns null when edited scene is unsaved/none", () => {
    expect(editedScenePath({ open_scenes: ["res://main.tscn"], edited_scene: "" })).toBeNull();
  });
  it("legacy plugin: falls back only when exactly one scene open", () => {
    expect(editedScenePath({ open_scenes: ["res://main.tscn"] })).toBe("res://main.tscn");
    expect(editedScenePath({ open_scenes: ["res://a.tscn", "res://b.tscn"] })).toBeNull();
    expect(editedScenePath({ open_scenes: [""] })).toBeNull();
  });
});

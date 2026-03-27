import { describe, it, expect } from "vitest";
import { parseProjectConfig } from "../project-parser.js";

const SAMPLE_PROJECT = `; Engine configuration file.

[application]
config/name="My Game"
config/description="A cool game"
config/features=PackedStringArray("4.4", "Forward Plus")
run/main_scene="res://main.tscn"
config/icon="res://icon.svg"

[display]
window/size/viewport_width=1280
`;

describe("parseProjectConfig", () => {
  it("should parse full project.godot", () => {
    const config = parseProjectConfig(SAMPLE_PROJECT);
    expect(config.name).toBe("My Game");
    expect(config.description).toBe("A cool game");
    expect(config.mainScene).toBe("res://main.tscn");
    expect(config.icon).toBe("res://icon.svg");
    expect(config.features).toEqual(["4.4", "Forward Plus"]);
  });

  it("should parse minimal config with only config/name", () => {
    const content = `[application]
config/name="Minimal"
`;
    const config = parseProjectConfig(content);
    expect(config.name).toBe("Minimal");
    expect(config.description).toBeUndefined();
    expect(config.mainScene).toBeUndefined();
    expect(config.icon).toBeUndefined();
    expect(config.features).toBeUndefined();
  });

  it("should default name to 'Untitled' when missing", () => {
    const content = `[application]
run/main_scene="res://main.tscn"
`;
    const config = parseProjectConfig(content);
    expect(config.name).toBe("Untitled");
  });

  it("should parse features PackedStringArray", () => {
    const config = parseProjectConfig(SAMPLE_PROJECT);
    expect(config.features).toEqual(["4.4", "Forward Plus"]);
  });

  it("should capture multiple sections in rawSections", () => {
    const config = parseProjectConfig(SAMPLE_PROJECT);
    expect(config.rawSections["application"]).toBeDefined();
    expect(config.rawSections["display"]).toBeDefined();
    expect(config.rawSections["display"]["window/size/viewport_width"]).toBe(
      "1280"
    );
  });

  it("should skip comments and blank lines", () => {
    const content = `; This is a comment

[application]
; Another comment
config/name="Test"
`;
    const config = parseProjectConfig(content);
    expect(config.name).toBe("Test");
  });

  it("should unquote quoted values", () => {
    const content = `[application]
config/name="Quoted Name"
config/description="A \"quoted\" desc"
`;
    const config = parseProjectConfig(content);
    expect(config.name).toBe("Quoted Name");
  });
});

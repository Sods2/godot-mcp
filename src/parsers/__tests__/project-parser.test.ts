import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  parseProjectConfig,
  serializeProjectConfig,
} from "../project-parser.js";
import { addAutoload } from "../../tools/project-tools.js";

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

/** Mirrors the real corruption case from godot-mcp-test (bug #1). */
const PROJECT_WITH_INPUT = `; Engine configuration file.
; It's best edited using the editor UI and not directly,
; since the parameters that go here are not all obvious.
;
; Format:
;   [section] ; section goes between []
;   param=value ; assign values to parameters

config_version=5

[application]

config/name="godot-mcp-test"
run/main_scene="res://main.tscn"
config/features=PackedStringArray("4.7", "GL Compatibility")

[autoload]

GameState="*res://game_state.gd"

[input]

move_left={
"deadzone": 0.2,
"events": [Object(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"pressed":false,"keycode":0,"physical_keycode":65,"key_label":0,"unicode":97,"location":0,"echo":false,"script":null)
, Object(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"pressed":false,"keycode":0,"physical_keycode":4194319,"key_label":0,"unicode":0,"location":0,"echo":false,"script":null)
]
}
move_right={
"deadzone": 0.2,
"events": [Object(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"pressed":false,"keycode":0,"physical_keycode":68,"key_label":0,"unicode":100,"location":0,"echo":false,"script":null)
]
}
jump={
"deadzone": 0.2,
"events": [Object(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"pressed":false,"keycode":0,"physical_keycode":32,"key_label":0,"unicode":32,"location":0,"echo":false,"script":null)
]
}

[rendering]

renderer/rendering_method="gl_compatibility"
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
config/description="A 'quoted' desc"
`;
    const config = parseProjectConfig(content);
    expect(config.name).toBe("Quoted Name");
  });

  it("keeps multi-line [input] action bodies intact", () => {
    const config = parseProjectConfig(PROJECT_WITH_INPUT);
    const moveLeft = config.rawSections["input"]["move_left"];
    expect(moveLeft).toMatch(/^\{[\s\S]*\}$/);
    expect(moveLeft).toContain('"deadzone": 0.2');
    expect(moveLeft).toContain("physical_keycode\":65");
    expect(moveLeft).toContain("physical_keycode\":4194319");
    expect(config.rawSections["input"]["jump"]).toContain(
      "physical_keycode\":32"
    );
  });

  it("keeps header comments and config_version in preamble (not a [] section)", () => {
    const config = parseProjectConfig(PROJECT_WITH_INPUT);
    expect(config.preamble).toContain("; Engine configuration file.");
    expect(config.preamble).toContain("config_version=5");
    expect(config.rawSections[""]).toBeUndefined();
  });
});

describe("serializeProjectConfig / roundtrip", () => {
  it("does not emit a bare [] section", () => {
    const config = parseProjectConfig(PROJECT_WITH_INPUT);
    const out = serializeProjectConfig(config.rawSections, config.preamble);
    expect(out).not.toMatch(/^\[\]/m);
    expect(out).toContain("; Engine configuration file.");
    expect(out).toContain("config_version=5");
  });

  it("preserves multi-line input action bodies through parse → serialize", () => {
    const config = parseProjectConfig(PROJECT_WITH_INPUT);
    const out = serializeProjectConfig(config.rawSections, config.preamble);
    const before = (PROJECT_WITH_INPUT.match(/physical_keycode/g) || []).length;
    const after = (out.match(/physical_keycode/g) || []).length;
    expect(after).toBe(before);
    expect(out).toContain("move_left={");
    expect(out).toContain('"deadzone": 0.2');
    // Truncation symptom from bug #1: opening brace then next key, body gone
    expect(out).not.toMatch(/move_left=\{\nmove_right=/);
    expect(out).toMatch(/move_left=\{\n"deadzone"/);
  });

  it("parse → serialize → parse keeps input map data", () => {
    const once = parseProjectConfig(PROJECT_WITH_INPUT);
    const serialized = serializeProjectConfig(once.rawSections, once.preamble);
    const twice = parseProjectConfig(serialized);
    expect(twice.rawSections["input"]["move_left"]).toBe(
      once.rawSections["input"]["move_left"]
    );
    expect(twice.rawSections["input"]["move_right"]).toBe(
      once.rawSections["input"]["move_right"]
    );
    expect(twice.rawSections["input"]["jump"]).toBe(
      once.rawSections["input"]["jump"]
    );
    expect(twice.rawSections["autoload"]["GameState"]).toBe(
      '"*res://game_state.gd"'
    );
  });
});

describe("addAutoload (bug #1 regression)", () => {
  it("adds an autoload without wiping multi-line [input] actions or header", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "godot-mcp-autoload-"));
    try {
      await writeFile(path.join(dir, "project.godot"), PROJECT_WITH_INPUT, "utf-8");
      await addAutoload(dir, "Extra", "res://extra.gd");
      const out = await readFile(path.join(dir, "project.godot"), "utf-8");

      expect(out).toContain('Extra="*res://extra.gd"');
      expect(out).toContain('GameState="*res://game_state.gd"');
      expect(out).toContain("; Engine configuration file.");
      expect(out).toContain("config_version=5");
      expect(out).not.toMatch(/^\[\]/m);

      const before = (PROJECT_WITH_INPUT.match(/physical_keycode/g) || [])
        .length;
      const after = (out.match(/physical_keycode/g) || []).length;
      expect(after).toBe(before);
      expect(out).toContain('"deadzone": 0.2');
      expect(out).not.toMatch(/move_left=\{\nmove_right=/);
      expect(out).toMatch(/move_left=\{\n"deadzone"/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

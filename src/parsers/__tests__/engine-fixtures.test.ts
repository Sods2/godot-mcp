import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TscnParser } from "../tscn-parser.js";
import { TresParser } from "../tres-parser.js";

/**
 * These fixtures were written by the Godot editor itself (4.5.1, 4.6.3 and
 * 4.7.2 headless, via ResourceSaver), not hand-authored — so they carry the
 * real `unique_id` stamps, `groups` arrays, instance links, `[editable]`
 * sections, `script_class` headers and `binds= [42]` spacing the engine
 * actually emits, including where those differ between versions.
 *
 * The contract they enforce: a file this parser has not been asked to change
 * comes back byte-identical, on every supported version. Anything less shows
 * up as a spurious diff in the user's repo and as churn in PCK patch exports.
 */
const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures"
);

const VERSIONS = readdirSync(FIXTURES).sort();

/** 4.6 introduced per-node `unique_id` and stopped writing `load_steps`. */
const STAMPS_NODE_IDS = new Set(["godot-4.6", "godot-4.7"]);

function read(version: string, file: string): string {
  return readFileSync(path.join(FIXTURES, version, file), "utf-8");
}

describe("engine-written fixtures", () => {
  it("covers every supported Godot version", () => {
    expect(VERSIONS).toEqual(["godot-4.5", "godot-4.6", "godot-4.7"]);
  });

  for (const version of VERSIONS) {
    describe(version, () => {
      const files = readdirSync(path.join(FIXTURES, version)).sort();
      const stampsIds = STAMPS_NODE_IDS.has(version);

      for (const file of files) {
        it(`${file} round-trips byte-identically`, () => {
          const source = read(version, file);
          if (file.endsWith(".tres")) {
            const parser = new TresParser();
            expect(parser.serialize(parser.parse(source))).toBe(source);
          } else {
            const parser = new TscnParser();
            expect(parser.serialize(parser.parse(source))).toBe(source);
          }
        });
      }

      it("preserves groups, instances, connections and editable instances", () => {
        const parser = new TscnParser();
        const scene = parser.parse(read(version, "level.tscn"));

        expect(
          parser.getNodeByPath(scene, "Level/Player")?.extraAttrs?.groups
        ).toBe('["damageable", "player"]');
        expect(parser.getNodeByPath(scene, "Level/Enemy1")?.instance).toMatch(
          /^ExtResource\("/
        );
        expect(scene.editables).toEqual(["Enemy1"]);

        const bound = scene.connections.find((c) => c.binds !== undefined);
        expect(bound?.binds).toBe("[42]");
        expect(bound?.flags).toBe(3);
      });

      it("keeps every ext_resource in a .tres, so no reference is orphaned", () => {
        const parser = new TresParser();
        const source = read(version, "stats.tres");
        const resource = parser.parse(source);

        expect(resource.extResources.map((e) => e.path)).toEqual([
          "res://inner.tres",
          "res://stats.gd",
        ]);
        // every ExtResource("id") in the body must resolve to a declared id
        const declared = new Set(resource.extResources.map((e) => e.id));
        for (const [, value] of Object.entries(resource.resource)) {
          for (const [, id] of value.matchAll(/ExtResource\("([^"]+)"\)/g)) {
            expect(declared).toContain(id);
          }
        }
      });

      it("preserves the script_class header attribute", () => {
        const parser = new TresParser();
        const resource = parser.parse(read(version, "stats.tres"));
        expect(resource.header.extraAttrs?.script_class).toBe('"StatsRes"');
      });

      it(`${stampsIds ? "omits" : "keeps"} load_steps, matching this engine`, () => {
        const source = read(version, "level.tscn");
        const parser = new TscnParser();
        const out = parser.serialize(parser.parse(source));
        if (stampsIds) {
          expect(source).not.toContain("load_steps");
          expect(out).not.toContain("load_steps");
        } else {
          expect(source).toContain("load_steps=");
          expect(out).toContain("load_steps=");
        }
      });

      it(`${stampsIds ? "keeps" : "does not invent"} per-node unique_id`, () => {
        const scene = new TscnParser().parse(read(version, "level.tscn"));
        for (const node of scene.nodes) {
          if (stampsIds) {
            expect(node.extraAttrs?.unique_id).toMatch(/^\d+$/);
          } else {
            expect(node.extraAttrs?.unique_id).toBeUndefined();
          }
        }
      });


      it("keeps a multi-line string property whole", () => {
        const parser = new TscnParser();
        const scene = parser.parse(read(version, "text.tscn"));
        const label = parser.getNodeByPath(scene, "TextRoot/MultiLine");
        expect(label?.properties["text"]).toBe('"0/10\nWood"');
      });

      it("keeps a multi-line dictionary property whole", () => {
        const parser = new TscnParser();
        const scene = parser.parse(read(version, "text.tscn"));
        const node = parser.getNodeByPath(scene, "TextRoot/WithDict");
        expect(node?.properties["metadata/table"]).toContain('"c": [1, 2, 3]');
        expect(node?.properties["metadata/table"]).toMatch(/^\{[\s\S]*\}$/);
      });

      it("survives an edit without disturbing anything else", () => {
        const parser = new TscnParser();
        const source = read(version, "level.tscn");
        let scene = parser.parse(source);
        scene = parser.setProperty(
          scene,
          "Level/Player",
          "position",
          "Vector2(640, 360)"
        );
        const out = parser.serialize(scene);

        // Exactly one line changes: the property that was edited.
        const before = source.split("\n");
        const after = out.split("\n");
        expect(after.length).toBe(before.length);
        expect(before.filter((line, i) => line !== after[i])).toEqual([
          "position = Vector2(100, 200)",
        ]);
      });
    });
  }
});

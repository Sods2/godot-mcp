import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TscnParser } from "../tscn-parser.js";
import { TresParser } from "../tres-parser.js";

/**
 * These fixtures were written by the Godot editor itself (4.6.3 and 4.7.2
 * headless, via ResourceSaver), not hand-authored — so they carry the real
 * `unique_id` stamps, `groups` arrays, instance links, `[editable]` sections
 * and `binds= [42]` spacing the engine actually emits.
 *
 * The contract they enforce: a file this parser has not been asked to change
 * comes back byte-identical. Anything less shows up as a spurious diff in the
 * user's repo and as churn in PCK patch exports.
 */
const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures"
);

const VERSIONS = readdirSync(FIXTURES).sort();

describe("engine-written fixtures", () => {
  it("covers both Godot versions", () => {
    expect(VERSIONS).toEqual(["godot-4.6", "godot-4.7"]);
  });

  for (const version of VERSIONS) {
    describe(version, () => {
      const files = readdirSync(path.join(FIXTURES, version)).sort();

      for (const file of files) {
        const source = readFileSync(path.join(FIXTURES, version, file), "utf-8");

        it(`${file} round-trips byte-identically`, () => {
          if (file.endsWith(".tres")) {
            const parser = new TresParser();
            expect(parser.serialize(parser.parse(source))).toBe(source);
          } else {
            const parser = new TscnParser();
            expect(parser.serialize(parser.parse(source))).toBe(source);
          }
        });
      }

      it("keeps node identity attributes on every node", () => {
        const source = readFileSync(
          path.join(FIXTURES, version, "level.tscn"),
          "utf-8"
        );
        const scene = new TscnParser().parse(source);
        for (const node of scene.nodes) {
          expect(node.extraAttrs?.unique_id).toMatch(/^\d+$/);
        }
      });

      it("preserves groups, instances, connections and editable instances", () => {
        const parser = new TscnParser();
        const source = readFileSync(
          path.join(FIXTURES, version, "level.tscn"),
          "utf-8"
        );
        const scene = parser.parse(source);

        expect(parser.getNodeByPath(scene, "Level/Player")?.extraAttrs?.groups).toBe(
          '["damageable", "player"]'
        );
        expect(parser.getNodeByPath(scene, "Level/Enemy1")?.instance).toMatch(
          /^ExtResource\("/
        );
        expect(scene.editables).toEqual(["Enemy1"]);

        const bound = scene.connections.find((c) => c.binds !== undefined);
        expect(bound?.binds).toBe("[42]");
        expect(bound?.flags).toBe(3);
      });

      it("writes no load_steps, matching the engine", () => {
        const source = readFileSync(
          path.join(FIXTURES, version, "level.tscn"),
          "utf-8"
        );
        expect(source).not.toContain("load_steps");
        const parser = new TscnParser();
        expect(parser.serialize(parser.parse(source))).not.toContain("load_steps");
      });

      it("survives an edit without disturbing anything else", () => {
        const parser = new TscnParser();
        const source = readFileSync(
          path.join(FIXTURES, version, "level.tscn"),
          "utf-8"
        );
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
        const changed = before.filter((line, i) => line !== after[i]);
        expect(changed).toEqual(["position = Vector2(100, 200)"]);
      });
    });
  }
});

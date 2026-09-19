import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TscnParser } from "../tscn-parser.js";
import { TresParser } from "../tres-parser.js";

/**
 * Round-trip invariants over the whole fixture corpus. These are the guard
 * against the "depending on the angle, something is always missed" failure
 * mode: instead of asserting hand-picked cases, they hold every real file to
 * two properties, so a newly added fixture is covered automatically.
 *
 *   1. serialize(parse(x)) === x            — an untouched file is byte-stable
 *   2. parse(serialize(parse(x))) deep-eq parse(x) — no data lost or reordered
 *
 * The `edge-cases/` fixtures target the exact shapes that previously slipped
 * through: a multi-line dictionary in a .tres, a value line that looks like a
 * `[section]` header (BBCode), and a node parented to an unreachable inherited
 * node.
 */
const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures"
);

function allFixtures(): Array<{ rel: string; abs: string }> {
  const out: Array<{ rel: string; abs: string }> = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.name.endsWith(".tscn") || entry.name.endsWith(".tres"))
        out.push({ rel, abs });
    }
  };
  walk(FIXTURES, "");
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

function parserFor(file: string): TscnParser | TresParser {
  return file.endsWith(".tres") ? new TresParser() : new TscnParser();
}

describe("fixture corpus round-trip invariants", () => {
  const fixtures = allFixtures();

  it("finds the corpus", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const { rel, abs } of fixtures) {
    describe(rel, () => {
      const src = readFileSync(abs, "utf-8");

      it("serialize(parse(x)) is byte-identical", () => {
        const p = parserFor(rel);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(p.serialize(p.parse(src) as any)).toBe(src);
      });

      it("parse -> serialize -> parse loses nothing and reorders nothing", () => {
        const p = parserFor(rel);
        const once = p.parse(src);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const twice = p.parse(p.serialize(once as any));
        expect(twice).toEqual(once);
      });
    });
  }
});

describe("edge-case shapes are preserved", () => {
  const read = (f: string) =>
    readFileSync(path.join(FIXTURES, "edge-cases", f), "utf-8");

  it("keeps a multi-line dictionary in a .tres whole", () => {
    const parser = new TresParser();
    const res = parser.parse(read("edge_dict.tres"));
    const data = res.resource["_data"];
    expect(data).toMatch(/^\{[\s\S]*\}$/);
    expect(data).toContain('"wiggle"');
    expect(data).toContain('"jump"');
  });

  it("keeps a value line that looks like a [section] header (BBCode)", () => {
    const parser = new TscnParser();
    const scene = parser.parse(read("edge_bbcode.tscn"));
    const text = parser.getNodeByPath(scene, "BBRoot")?.properties["text"];
    expect(text).toContain("[b]world[/b]");
    expect(text).toContain("[color=red]red[/color]");
    expect(text).toBe('"hello\n[b]world[/b]\n[color=red]red[/color]\nbye"');
  });

  it("emits a node under an unreachable inherited parent in source position", () => {
    const parser = new TscnParser();
    const scene = parser.parse(read("edge_inherited.tscn"));
    // Parent 'InheritedChild' has no [node] block here — it lives in the base.
    const added = parser.getNodeByPath(
      scene,
      "Derived/InheritedChild/AddedUnderInherited"
    );
    expect(added?.parent).toBe("InheritedChild");

    const order = parser
      .serialize(scene)
      .split("\n")
      .filter((l) => l.startsWith("[node"))
      .map((l) => /name="([^"]+)"/.exec(l)![1]);
    expect(order).toEqual(["Derived", "AddedUnderInherited", "Tail"]);
  });
});

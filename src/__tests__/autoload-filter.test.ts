import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAutoloadNames, filterAutoloadErrors, AUTOLOAD_WARNING_NOTE } from "../autoload-filter.js";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "autoload-project");

describe("parseAutoloadNames", () => {
  it("collects keys from [autoload] only", () => {
    const content = readFileSync(path.join(FIXTURE, "project.godot"), "utf-8");
    expect(parseAutoloadNames(content)).toEqual(["GameState", "Plain"]);
  });

  it("returns [] without an [autoload] section", () => {
    expect(parseAutoloadNames('[application]\nconfig/name="X"\n')).toEqual([]);
  });

  it("stops at the next section and handles CRLF", () => {
    expect(parseAutoloadNames('[autoload]\r\nA="*res://a.gd"\r\n[input]\r\nB={}\r\n')).toEqual(["A"]);
  });
});

describe("filterAutoloadErrors", () => {
  const notFound = (n: string) => `SCRIPT ERROR: Parse Error: Identifier not found: ${n}\n          at: GDScript::reload (res://s.gd:4)`;
  const notDeclared = (n: string) => `SCRIPT ERROR: Parse Error: Identifier "${n}" not declared in the current scope.\n          at: GDScript::reload (res://s.gd:4)`;

  it("downgrades both message forms for autoload names", () => {
    for (const out of [notFound("GameState"), notDeclared("GameState")]) {
      const r = filterAutoloadErrors(out, ["GameState"]);
      expect(r.downgraded).toBe(1);
      expect(r.hasErrors).toBe(false);
      expect(r.output).toContain(`WARNING:`);
      expect(r.output).toContain(AUTOLOAD_WARNING_NOTE);
      expect(r.output).not.toMatch(/SCRIPT ERROR/);
    }
  });

  it("keeps real undefined identifiers as errors", () => {
    const out = `${notFound("GameState")}\n${notFound("Bogus")}`;
    const r = filterAutoloadErrors(out, ["GameState"]);
    expect(r.downgraded).toBe(1);
    expect(r.hasErrors).toBe(true);
    expect(r.output).toContain("SCRIPT ERROR: Parse Error: Identifier not found: Bogus");
  });

  it("matches names exactly (no prefix/substring matches)", () => {
    const r = filterAutoloadErrors(notFound("GameStateX"), ["GameState"]);
    expect(r.downgraded).toBe(0);
    expect(r.hasErrors).toBe(true);
  });

  it("leaves unrelated errors untouched", () => {
    const out = "SCRIPT ERROR: Parse Error: Expected expression";
    expect(filterAutoloadErrors(out, ["GameState"])).toEqual({ output: out, downgraded: 0, hasErrors: true });
  });
});

const GODOT = process.env.GODOT_PATH || "godot";
let godotAvailable = false;
try {
  execFileSync(GODOT, ["--version"], { stdio: "ignore", timeout: 10000 });
  godotAvailable = existsSync(FIXTURE);
} catch {
  godotAvailable = false;
}

describe.skipIf(!godotAvailable)("headless integration (real godot)", () => {
  it("downgrades the autoload error and keeps the real one", () => {
    let out = "";
    try {
      out = execFileSync(GODOT, ["--headless", "--path", FIXTURE, "--script", "res://uses_autoload.gd", "--check-only"], { encoding: "utf-8", stdio: "pipe", timeout: 30000 });
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string };
      out = `${err.stdout ?? ""}\n${err.stderr ?? ""}`;
    }
    const r = filterAutoloadErrors(out, parseAutoloadNames(readFileSync(path.join(FIXTURE, "project.godot"), "utf-8")));
    expect(r.output).not.toMatch(/ERROR:.*GameState/);
    expect(r.output).toContain("NotAnAutoload");
    expect(r.hasErrors).toBe(true);
  });
});

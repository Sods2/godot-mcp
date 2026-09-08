import { describe, it, expect } from "vitest";
import { compareVersionsDesc } from "../godot-path.js";

describe("compareVersionsDesc", () => {
  const sorted = (names: string[]) => [...names].sort(compareVersionsDesc);

  it("puts the newest Godot bundle first", () => {
    expect(
      sorted([
        "Godot_v4.5-stable_macos.universal.app",
        "Godot_v4.7.2-stable_macos.universal.app",
        "Godot_v4.6.3-stable_macos.universal.app",
      ])
    ).toEqual([
      "Godot_v4.7.2-stable_macos.universal.app",
      "Godot_v4.6.3-stable_macos.universal.app",
      "Godot_v4.5-stable_macos.universal.app",
    ]);
  });

  it("compares numerically, not lexically", () => {
    // plain string sort would rank 4.7 above 4.10
    expect(
      sorted(["Godot_v4.7-stable.app", "Godot_v4.10-stable.app"])[0]
    ).toBe("Godot_v4.10-stable.app");
  });

  it("orders patch releases within a minor version", () => {
    expect(
      sorted(["Godot_v4.6.1-stable.app", "Godot_v4.6.10-stable.app"])[0]
    ).toBe("Godot_v4.6.10-stable.app");
  });

  it("ranks an unversioned bundle last", () => {
    expect(sorted(["Godot.app", "Godot_v4.6-stable.app"])).toEqual([
      "Godot_v4.6-stable.app",
      "Godot.app",
    ]);
  });
});

import { describe, it, expect } from "vitest";
import { isNativeNodeClass } from "../native-node-classes.js";

describe("isNativeNodeClass", () => {
  it("accepts instantiable Node types", () => {
    expect(isNativeNodeClass("Node2D")).toBe(true);
    expect(isNativeNodeClass("CharacterBody2D")).toBe(true);
    expect(isNativeNodeClass("Node")).toBe(true);
  });

  it("rejects unknown and non-Node types", () => {
    expect(isNativeNodeClass("NotAClass")).toBe(false);
    expect(isNativeNodeClass("Texture2D")).toBe(false);
    expect(isNativeNodeClass("Resource")).toBe(false);
    expect(isNativeNodeClass("")).toBe(false);
  });
});

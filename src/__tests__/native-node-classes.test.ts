import { describe, it, expect } from "vitest";
import {
  isNativeNodeClass,
  isNativeNonNodeClass,
  suggestNativeNodeClass,
  invalidRootNodeTypeMessage,
} from "../native-node-classes.js";

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

describe("isNativeNonNodeClass", () => {
  it("recognizes ClassDB types that are not Nodes", () => {
    expect(isNativeNonNodeClass("Resource")).toBe(true);
    expect(isNativeNonNodeClass("RefCounted")).toBe(true);
    expect(isNativeNonNodeClass("StyleBoxFlat")).toBe(true);
    expect(isNativeNonNodeClass("Texture2D")).toBe(true);
  });

  it("rejects Node types and unknowns", () => {
    expect(isNativeNonNodeClass("Node2D")).toBe(false);
    expect(isNativeNonNodeClass("NotAClass")).toBe(false);
  });
});

describe("suggestNativeNodeClass", () => {
  it("suggests canonical casing for Node types", () => {
    expect(suggestNativeNodeClass("node2d")).toBe("Node2D");
    expect(suggestNativeNodeClass("NODE2D")).toBe("Node2D");
  });

  it("returns undefined when casing already matches or unknown", () => {
    expect(suggestNativeNodeClass("Node2D")).toBeUndefined();
    expect(suggestNativeNodeClass("NotAClass")).toBeUndefined();
  });
});

describe("invalidRootNodeTypeMessage", () => {
  it("requires a non-empty root_node_type", () => {
    expect(invalidRootNodeTypeMessage("")).toBe("root_node_type is required");
    expect(invalidRootNodeTypeMessage("   ")).toBe("root_node_type is required");
  });

  it("says known non-Node ClassDB types are not Node types", () => {
    expect(invalidRootNodeTypeMessage("Resource")).toBe("Resource is not a Node type");
    expect(invalidRootNodeTypeMessage("RefCounted")).toBe("RefCounted is not a Node type");
    expect(invalidRootNodeTypeMessage("StyleBoxFlat")).toBe("StyleBoxFlat is not a Node type");
  });

  it("suggests correct casing for Node types", () => {
    expect(invalidRootNodeTypeMessage("node2d")).toBe(
      "Unknown node type: node2d. Did you mean Node2D?"
    );
  });

  it("falls back to unknown for invented names", () => {
    expect(invalidRootNodeTypeMessage("NotAClass")).toBe("Unknown node type: NotAClass");
  });
});

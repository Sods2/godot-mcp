import { describe, it, expect } from "vitest";
import { TresParser } from "../tres-parser.js";

const SAMPLE_TRES = `[gd_resource type="Environment" load_steps=2 format=3]

[sub_resource type="ProceduralSkyMaterial" id="1_abc"]
sky_top_color = Color(0.2, 0.4, 0.8, 1)

[resource]
background_mode = 2
sky = SubResource("1_abc")
`;

describe("TresParser", () => {
  const parser = new TresParser();

  describe("parse/serialize roundtrip", () => {
    it("should produce equivalent resource after roundtrip", () => {
      const resource = parser.parse(SAMPLE_TRES);
      const serialized = parser.serialize(resource);
      const reparsed = parser.parse(serialized);
      expect(reparsed.header).toEqual(resource.header);
      expect(reparsed.subResources).toEqual(resource.subResources);
      expect(reparsed.resource).toEqual(resource.resource);
    });
  });

  describe("header fields", () => {
    it("should extract type, loadSteps, and format", () => {
      const resource = parser.parse(SAMPLE_TRES);
      expect(resource.header.type).toBe("Environment");
      expect(resource.header.loadSteps).toBe(2);
      expect(resource.header.format).toBe(3);
    });
  });

  describe("sub_resources", () => {
    it("should extract sub_resources with properties", () => {
      const resource = parser.parse(SAMPLE_TRES);
      expect(resource.subResources).toHaveLength(1);
      expect(resource.subResources[0].type).toBe("ProceduralSkyMaterial");
      expect(resource.subResources[0].id).toBe("1_abc");
      expect(resource.subResources[0].properties).toEqual({
        sky_top_color: "Color(0.2, 0.4, 0.8, 1)",
      });
    });
  });

  describe("resource section", () => {
    it("should extract resource properties", () => {
      const resource = parser.parse(SAMPLE_TRES);
      expect(resource.resource).toEqual({
        background_mode: "2",
        sky: 'SubResource("1_abc")',
      });
    });
  });

  describe("serialize with no sub_resources", () => {
    it("should serialize cleanly without sub_resources", () => {
      const resource = parser.parse(SAMPLE_TRES);
      resource.subResources = [];
      resource.resource = { some_prop: "42" };
      const serialized = parser.serialize(resource);
      expect(serialized).not.toContain("[sub_resource");
      expect(serialized).toContain("[resource]");
      expect(serialized).toContain("some_prop = 42");
    });
  });
});

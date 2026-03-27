import { describe, it, expect } from "vitest";
import { TscnParser } from "../tscn-parser.js";

const SAMPLE_TSCN = `[gd_scene load_steps=2 format=3 uid="uid://abc123"]

[ext_resource type="Texture2D" path="res://icon.png" id="1_abc"]

[sub_resource type="RectangleShape2D" id="2_def"]
size = Vector2(32, 64)

[node name="Root" type="Node2D"]

[node name="Sprite" type="Sprite2D" parent="."]
position = Vector2(100, 200)

[connection signal="ready" from="." to="Sprite" method="_on_ready"]
`;

describe("TscnParser", () => {
  const parser = new TscnParser();

  describe("parse/serialize roundtrip", () => {
    it("should produce equivalent scene after roundtrip", () => {
      const scene = parser.parse(SAMPLE_TSCN);
      const serialized = parser.serialize(scene);
      const reparsed = parser.parse(serialized);
      // loadSteps is recalculated by serialize, so compare format and uid only
      expect(reparsed.header.format).toBe(scene.header.format);
      expect(reparsed.header.uid).toBe(scene.header.uid);
      expect(reparsed.extResources).toEqual(scene.extResources);
      expect(reparsed.subResources).toEqual(scene.subResources);
      expect(reparsed.nodes).toEqual(scene.nodes);
      expect(reparsed.connections).toEqual(scene.connections);
    });
  });

  describe("header fields", () => {
    it("should extract loadSteps, format, and uid", () => {
      const scene = parser.parse(SAMPLE_TSCN);
      expect(scene.header.loadSteps).toBe(2);
      expect(scene.header.format).toBe(3);
      expect(scene.header.uid).toBe("uid://abc123");
    });
  });

  describe("ext_resources", () => {
    it("should extract ext_resource without uid", () => {
      const scene = parser.parse(SAMPLE_TSCN);
      expect(scene.extResources).toHaveLength(1);
      expect(scene.extResources[0]).toEqual({
        type: "Texture2D",
        path: "res://icon.png",
        id: "1_abc",
      });
    });

    it("should extract ext_resource with uid", () => {
      const content = `[gd_scene load_steps=2 format=3]

[ext_resource type="Script" path="res://main.gd" id="1_x" uid="uid://xyz"]
`;
      const scene = parser.parse(content);
      expect(scene.extResources[0].uid).toBe("uid://xyz");
    });
  });

  describe("sub_resources", () => {
    it("should extract type, id, and properties", () => {
      const scene = parser.parse(SAMPLE_TSCN);
      expect(scene.subResources).toHaveLength(1);
      expect(scene.subResources[0].type).toBe("RectangleShape2D");
      expect(scene.subResources[0].id).toBe("2_def");
      expect(scene.subResources[0].properties).toEqual({
        size: "Vector2(32, 64)",
      });
    });
  });

  describe("nodes", () => {
    it("should extract root node with no parent", () => {
      const scene = parser.parse(SAMPLE_TSCN);
      const root = scene.nodes[0];
      expect(root.name).toBe("Root");
      expect(root.type).toBe("Node2D");
      expect(root.parent).toBeUndefined();
    });

    it("should extract child with parent='.'", () => {
      const scene = parser.parse(SAMPLE_TSCN);
      const child = scene.nodes[1];
      expect(child.name).toBe("Sprite");
      expect(child.type).toBe("Sprite2D");
      expect(child.parent).toBe(".");
    });

    it("should extract grandchild with nested parent", () => {
      const content = `[gd_scene load_steps=1 format=3]

[node name="Root" type="Node2D"]

[node name="Child" type="Node2D" parent="."]

[node name="GrandChild" type="Node2D" parent="Child"]
`;
      const scene = parser.parse(content);
      const grandchild = scene.nodes[2];
      expect(grandchild.name).toBe("GrandChild");
      expect(grandchild.parent).toBe("Child");
    });
  });

  describe("connections", () => {
    it("should extract connections", () => {
      const scene = parser.parse(SAMPLE_TSCN);
      expect(scene.connections).toHaveLength(1);
      expect(scene.connections[0]).toEqual({
        signal: "ready",
        from: ".",
        to: "Sprite",
        method: "_on_ready",
      });
    });
  });

  describe("addNode", () => {
    it("should add a child to root", () => {
      const scene = parser.parse(SAMPLE_TSCN);
      const updated = parser.addNode(scene, {
        name: "Label",
        type: "Label",
        parent: ".",
      });
      expect(updated.nodes).toHaveLength(3);
      expect(updated.nodes[2].name).toBe("Label");
      expect(updated.nodes[2].parent).toBe(".");
    });

    it("should add a grandchild", () => {
      const scene = parser.parse(SAMPLE_TSCN);
      const updated = parser.addNode(scene, {
        name: "Texture",
        type: "TextureRect",
        parent: "Sprite",
      });
      expect(updated.nodes).toHaveLength(3);
      expect(updated.nodes[2].name).toBe("Texture");
      expect(updated.nodes[2].parent).toBe("Sprite");
    });

    it("should throw on missing parent", () => {
      const scene = parser.parse(SAMPLE_TSCN);
      expect(() =>
        parser.addNode(scene, {
          name: "Orphan",
          type: "Node",
          parent: "NonExistent",
        })
      ).toThrow("Parent node not found: NonExistent");
    });
  });

  describe("removeNode", () => {
    it("should remove a leaf node", () => {
      const scene = parser.parse(SAMPLE_TSCN);
      const updated = parser.removeNode(scene, "Root/Sprite");
      expect(updated.nodes).toHaveLength(1);
      expect(updated.nodes[0].name).toBe("Root");
    });

    it("should remove a node and its children", () => {
      const content = `[gd_scene load_steps=1 format=3]

[node name="Root" type="Node2D"]

[node name="Child" type="Node2D" parent="."]

[node name="GrandChild" type="Node2D" parent="Child"]
`;
      const scene = parser.parse(content);
      const updated = parser.removeNode(scene, "Root/Child");
      expect(updated.nodes).toHaveLength(1);
      expect(updated.nodes[0].name).toBe("Root");
    });

    it("should throw on missing node", () => {
      const scene = parser.parse(SAMPLE_TSCN);
      expect(() => parser.removeNode(scene, "Root/Missing")).toThrow(
        "Node not found: Root/Missing"
      );
    });
  });

  describe("setProperty", () => {
    it("should set a new property", () => {
      const scene = parser.parse(SAMPLE_TSCN);
      const updated = parser.setProperty(
        scene,
        "Root/Sprite",
        "scale",
        "Vector2(2, 2)"
      );
      expect(updated.nodes[1].properties["scale"]).toBe("Vector2(2, 2)");
    });

    it("should overwrite an existing property", () => {
      const scene = parser.parse(SAMPLE_TSCN);
      const updated = parser.setProperty(
        scene,
        "Root/Sprite",
        "position",
        "Vector2(0, 0)"
      );
      expect(updated.nodes[1].properties["position"]).toBe("Vector2(0, 0)");
    });

    it("should throw on missing node", () => {
      const scene = parser.parse(SAMPLE_TSCN);
      expect(() =>
        parser.setProperty(scene, "Root/Missing", "key", "val")
      ).toThrow("Node not found: Root/Missing");
    });
  });

  describe("addExtResource", () => {
    it("should add a new resource and return its id", () => {
      const scene = parser.parse(SAMPLE_TSCN);
      const { scene: updated, id } = parser.addExtResource(
        scene,
        "Script",
        "res://main.gd"
      );
      expect(updated.extResources).toHaveLength(2);
      expect(id).toBeTruthy();
      expect(updated.extResources[1].type).toBe("Script");
      expect(updated.extResources[1].path).toBe("res://main.gd");
    });

    it("should deduplicate same type+path and return existing id", () => {
      const scene = parser.parse(SAMPLE_TSCN);
      const { scene: updated, id } = parser.addExtResource(
        scene,
        "Texture2D",
        "res://icon.png"
      );
      expect(updated.extResources).toHaveLength(1);
      expect(id).toBe("1_abc");
    });
  });

  describe("createScene", () => {
    it("should create a scene with a root node", () => {
      const scene = parser.createScene("Node2D", "MyRoot");
      expect(scene.header.format).toBe(3);
      expect(scene.nodes).toHaveLength(1);
      expect(scene.nodes[0].name).toBe("MyRoot");
      expect(scene.nodes[0].type).toBe("Node2D");
      expect(scene.nodes[0].parent).toBeUndefined();
    });

    it("should default root name to type if not provided", () => {
      const scene = parser.createScene("Control");
      expect(scene.nodes[0].name).toBe("Control");
    });
  });

  describe("getNodeByPath", () => {
    it("should find root by name", () => {
      const scene = parser.parse(SAMPLE_TSCN);
      const root = parser.getNodeByPath(scene, "Root");
      expect(root).toBeDefined();
      expect(root!.name).toBe("Root");
    });

    it("should find child by full path", () => {
      const scene = parser.parse(SAMPLE_TSCN);
      const child = parser.getNodeByPath(scene, "Root/Sprite");
      expect(child).toBeDefined();
      expect(child!.name).toBe("Sprite");
    });
  });

  describe("buildNodePath", () => {
    it("should return name for root node (no parent)", () => {
      const scene = parser.parse(SAMPLE_TSCN);
      const path = parser.buildNodePath(scene.nodes[0], scene.nodes);
      expect(path).toBe("Root");
    });

    it("should return Root/Name for direct child (parent='.')", () => {
      const scene = parser.parse(SAMPLE_TSCN);
      const path = parser.buildNodePath(scene.nodes[1], scene.nodes);
      expect(path).toBe("Root/Sprite");
    });

    it("should return full path for nested child", () => {
      const content = `[gd_scene load_steps=1 format=3]

[node name="Root" type="Node2D"]

[node name="Child" type="Node2D" parent="."]

[node name="GrandChild" type="Node2D" parent="Child"]
`;
      const scene = parser.parse(content);
      const path = parser.buildNodePath(scene.nodes[2], scene.nodes);
      expect(path).toBe("Root/Child/GrandChild");
    });
  });
});

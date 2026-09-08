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


// Godot 4.6+ writes no load_steps, and stamps node identity attributes that let
// the editor track nodes across renames and reparents.
const SAMPLE_TSCN_4_6 = `[gd_scene format=4 uid="uid://abc123"]

[ext_resource type="PackedScene" path="res://enemy.tscn" id="1_abc" uid="uid://xyz"]

[node name="Root" type="Node2D" unique_id=1 owner_uid_path=PackedInt32Array()]

[node name="Sprite" type="Sprite2D" parent="." index="0" groups=["enemies", "physics"] unique_id=2 parent_id_path=PackedInt32Array(1) owner_uid_path=PackedInt32Array(1)]
position = Vector2(100, 200)

[node name="Enemy" parent="." instance=ExtResource("1_abc") unique_id=3 parent_id_path=PackedInt32Array(1)]

[connection signal="ready" from="." to="Sprite" method="_on_ready" from_uid_path=PackedInt32Array(1) to_uid_path=PackedInt32Array(1, 2)]

[editable path="Enemy"]
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
      expect(scene.extResources[0]).toMatchObject({
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
      expect(scene.connections[0]).toMatchObject({
        signal: "ready",
        from: ".",
        to: "Sprite",
        method: "_on_ready",
      });
    });
  });


  describe("Godot 4.6+ scenes", () => {
    it("should preserve node identity attributes through a roundtrip", () => {
      const scene = parser.parse(SAMPLE_TSCN_4_6);
      const out = parser.serialize(scene);

      expect(out).toContain(
        '[node name="Root" type="Node2D" unique_id=1 owner_uid_path=PackedInt32Array()]'
      );
      expect(out).toContain("unique_id=2");
      expect(out).toContain("parent_id_path=PackedInt32Array(1)");
      expect(out).toContain("owner_uid_path=PackedInt32Array(1)");
    });

    it("should preserve connection uid paths through a roundtrip", () => {
      const scene = parser.parse(SAMPLE_TSCN_4_6);
      const out = parser.serialize(scene);
      expect(out).toContain("from_uid_path=PackedInt32Array(1)");
      expect(out).toContain("to_uid_path=PackedInt32Array(1, 2)");
    });

    it("should keep values that contain spaces intact", () => {
      const scene = parser.parse(SAMPLE_TSCN_4_6);
      const sprite = parser.getNodeByPath(scene, "Root/Sprite");
      expect(sprite!.extraAttrs).toEqual({
        index: '"0"',
        groups: '["enemies", "physics"]',
        unique_id: "2",
        parent_id_path: "PackedInt32Array(1)",
        owner_uid_path: "PackedInt32Array(1)",
      });
    });

    it("should keep instance= alongside preserved attributes", () => {
      const scene = parser.parse(SAMPLE_TSCN_4_6);
      const enemy = parser.getNodeByPath(scene, "Root/Enemy");
      expect(enemy!.instance).toBe('ExtResource("1_abc")');
      expect(enemy!.extraAttrs?.unique_id).toBe("3");
      expect(parser.serialize(scene)).toContain(
        '[node name="Enemy" parent="." instance=ExtResource("1_abc") unique_id=3 parent_id_path=PackedInt32Array(1)]'
      );
    });

    it("should survive an edit without losing identity attributes", () => {
      const scene = parser.parse(SAMPLE_TSCN_4_6);
      const edited = parser.setProperty(
        scene,
        "Root/Sprite",
        "position",
        "Vector2(0, 0)"
      );
      const reparsed = parser.parse(parser.serialize(edited));
      const sprite = parser.getNodeByPath(reparsed, "Root/Sprite");
      expect(sprite!.properties["position"]).toBe("Vector2(0, 0)");
      expect(sprite!.extraAttrs).toEqual(
        parser.getNodeByPath(scene, "Root/Sprite")!.extraAttrs
      );
    });

    it("should be stable across a second roundtrip", () => {
      const once = parser.serialize(parser.parse(SAMPLE_TSCN_4_6));
      const twice = parser.serialize(parser.parse(once));
      expect(twice).toBe(once);
    });
  });

  describe("editable instances", () => {
    it("should parse [editable path=...] sections", () => {
      const scene = parser.parse(SAMPLE_TSCN_4_6);
      expect(scene.editables).toEqual(["Enemy"]);
    });

    it("should re-emit editable sections after connections", () => {
      const out = parser.serialize(parser.parse(SAMPLE_TSCN_4_6));
      expect(out).toContain('[editable path="Enemy"]');
      expect(out.indexOf("[editable")).toBeGreaterThan(out.indexOf("[connection"));
    });

    it("should emit nothing when a scene has no editable instances", () => {
      const out = parser.serialize(parser.parse(SAMPLE_TSCN));
      expect(out).not.toContain("[editable");
    });
  });

  describe("load_steps", () => {
    it("should re-emit load_steps when the source had it", () => {
      const out = parser.serialize(parser.parse(SAMPLE_TSCN));
      expect(out).toMatch(/^\[gd_scene load_steps=3 format=3/);
    });

    it("should not add load_steps to a scene that had none", () => {
      const scene = parser.parse(SAMPLE_TSCN_4_6);
      expect(scene.header.loadSteps).toBeUndefined();
      expect(parser.serialize(scene)).not.toContain("load_steps");
    });
  });


  describe("node ordering", () => {
    it("should keep sibling order stable across serialize", () => {
      const content = `[gd_scene load_steps=1 format=3]

[node name="Root" type="Node2D"]

[node name="A" type="Node2D" parent="."]

[node name="B" type="Node2D" parent="."]

[node name="C" type="Node2D" parent="."]
`;
      const scene = parser.parse(content);
      const once = parser.parse(parser.serialize(scene));
      expect(once.nodes.map((n) => n.name)).toEqual(["Root", "A", "B", "C"]);
      const twice = parser.parse(parser.serialize(once));
      expect(twice.nodes.map((n) => n.name)).toEqual(["Root", "A", "B", "C"]);
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

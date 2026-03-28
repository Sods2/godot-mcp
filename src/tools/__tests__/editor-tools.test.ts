import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer } from "../../__tests__/helpers/mock-server.js";
import { createMockBridge } from "../../__tests__/helpers/mock-bridge.js";
import { registerEditorTools } from "../editor-tools.js";

describe("editor-tools", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockBridge: ReturnType<typeof createMockBridge>;

  beforeEach(() => {
    mockServer = createMockServer();
    mockBridge = createMockBridge({ connected: true });
    registerEditorTools(mockServer.server, mockBridge);
  });

  describe("godot_editor_status", () => {
    it("returns connected:false without bridge call when not connected", async () => {
      mockBridge._setConnected(false);
      const result = await mockServer.callTool("godot_editor_status");
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('"connected": false');
      expect(mockBridge._getCalls()).toHaveLength(0);
    });

    it("sends editor.status when connected", async () => {
      mockBridge._setResponse("editor.status", {
        connected: true,
        open_scenes: ["res://main.tscn"],
        playing: false,
      });
      const result = await mockServer.callTool("godot_editor_status");
      expect(result.content[0].text).toContain("open_scenes");
      expect(mockBridge._getCalls()[0].method).toBe("editor.status");
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("editor.status", new Error("Editor closed"));
      const result = await mockServer.callTool("godot_editor_status");
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_get_scene_tree", () => {
    it("sends scene.get_tree with optional params", async () => {
      mockBridge._setResponse("scene.get_tree", {
        root: { name: "Main", type: "Node2D", children: [] },
      });
      const result = await mockServer.callTool("godot_get_scene_tree", {
        max_depth: 3,
        type_filter: "Sprite2D",
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Main");
      const params = mockBridge._getCalls()[0].params as Record<string, unknown>;
      expect(params.max_depth).toBe(3);
      expect(params.type_filter).toBe("Sprite2D");
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("scene.get_tree", new Error("No scene open"));
      const result = await mockServer.callTool("godot_get_scene_tree");
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_get_selected_nodes", () => {
    it("sends scene.get_selected", async () => {
      mockBridge._setResponse("scene.get_selected", {
        nodes: [{ path: "Player", type: "CharacterBody2D" }],
      });
      const result = await mockServer.callTool("godot_get_selected_nodes");
      expect(result.content[0].text).toContain("Player");
      expect(mockBridge._getCalls()[0].method).toBe("scene.get_selected");
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("scene.get_selected", new Error("No editor"));
      const result = await mockServer.callTool("godot_get_selected_nodes");
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_get_node_properties", () => {
    it("sends inspector.get_properties with path", async () => {
      mockBridge._setResponse("inspector.get_properties", {
        path: "Player",
        properties: [{ name: "position", value: "Vector2(0, 0)" }],
      });
      const result = await mockServer.callTool("godot_get_node_properties", {
        node_path: "Player",
      });
      expect(result.content[0].text).toContain("position");
      expect(mockBridge._getCalls()[0].params).toEqual({ path: "Player" });
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("inspector.get_properties", new Error("Node not found"));
      const result = await mockServer.callTool("godot_get_node_properties", {
        node_path: "NonExistent",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_open_scene", () => {
    it("sends scene.open with path param renamed", async () => {
      mockBridge._setResponse("scene.open", { success: true });
      await mockServer.callTool("godot_open_scene", {
        scene_path: "res://main.tscn",
      });
      expect(mockBridge._getCalls()[0].method).toBe("scene.open");
      expect(mockBridge._getCalls()[0].params).toEqual({ path: "res://main.tscn" });
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("scene.open", new Error("File not found"));
      const result = await mockServer.callTool("godot_open_scene", {
        scene_path: "res://missing.tscn",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_reparent_node", () => {
    it("sends scene.reparent_node with path and new_parent", async () => {
      await mockServer.callTool("godot_reparent_node", {
        node_path: "Player/Sprite2D",
        new_parent: "Player/Body",
      });
      expect(mockBridge._getCalls()[0].method).toBe("scene.reparent_node");
      expect(mockBridge._getCalls()[0].params).toEqual({
        path: "Player/Sprite2D",
        new_parent: "Player/Body",
      });
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("scene.reparent_node", new Error("Invalid parent"));
      const result = await mockServer.callTool("godot_reparent_node", {
        node_path: "A",
        new_parent: "B",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_rename_node", () => {
    it("sends scene.rename_node with path and new_name", async () => {
      await mockServer.callTool("godot_rename_node", {
        node_path: "Player",
        new_name: "Hero",
      });
      expect(mockBridge._getCalls()[0].method).toBe("scene.rename_node");
      expect(mockBridge._getCalls()[0].params).toEqual({
        path: "Player",
        new_name: "Hero",
      });
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("scene.rename_node", new Error("Name conflict"));
      const result = await mockServer.callTool("godot_rename_node", {
        node_path: "A",
        new_name: "B",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_duplicate_node", () => {
    it("sends scene.duplicate_node with path and optional new_name", async () => {
      await mockServer.callTool("godot_duplicate_node", {
        node_path: "Enemy",
        new_name: "Enemy2",
      });
      expect(mockBridge._getCalls()[0].method).toBe("scene.duplicate_node");
      expect(mockBridge._getCalls()[0].params).toEqual({
        path: "Enemy",
        new_name: "Enemy2",
      });
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("scene.duplicate_node", new Error("Failed"));
      const result = await mockServer.callTool("godot_duplicate_node", { node_path: "A" });
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_move_node", () => {
    it("sends scene.move_node with path and index", async () => {
      await mockServer.callTool("godot_move_node", {
        node_path: "Player",
        index: 0,
      });
      expect(mockBridge._getCalls()[0].method).toBe("scene.move_node");
      expect(mockBridge._getCalls()[0].params).toEqual({ path: "Player", index: 0 });
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("scene.move_node", new Error("Invalid index"));
      const result = await mockServer.callTool("godot_move_node", {
        node_path: "A",
        index: 99,
      });
      expect(result.isError).toBe(true);
    });
  });
});

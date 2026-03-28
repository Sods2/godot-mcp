import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer } from "../../__tests__/helpers/mock-server.js";
import { createMockBridge } from "../../__tests__/helpers/mock-bridge.js";
import { registerSceneTools } from "../scene-tools.js";

const NOT_CONNECTED_SNIPPET = "Editor plugin not connected";

describe("scene-tools", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockBridge: ReturnType<typeof createMockBridge>;

  describe("when bridge is connected", () => {
    beforeEach(() => {
      mockServer = createMockServer();
      mockBridge = createMockBridge({ connected: true });
      registerSceneTools(mockServer.server, mockBridge);
    });

    describe("godot_add_node", () => {
      it("sends scene.add_node with required params and defaults", async () => {
        mockBridge._setResponse("scene.add_node", {
          success: true,
          path: "Sprite2D",
        });
        const result = await mockServer.callTool("godot_add_node", {
          project_path: "/proj",
          scene_path: "res://main.tscn",
          node_type: "Sprite2D",
          node_name: "Sprite",
        });
        expect(result.isError).toBeUndefined();
        const params = mockBridge._getCalls()[0].params as Record<string, unknown>;
        expect(params.type).toBe("Sprite2D");
        expect(params.name).toBe("Sprite");
        expect(params.parent).toBe(".");
        expect(params.properties).toBeUndefined();
      });

      it("parses properties JSON and forwards", async () => {
        const props = JSON.stringify({ position: "Vector2(100, 200)" });
        await mockServer.callTool("godot_add_node", {
          project_path: "/proj",
          scene_path: "res://main.tscn",
          node_type: "Sprite2D",
          node_name: "S",
          properties: props,
        });
        const params = mockBridge._getCalls()[0].params as Record<string, unknown>;
        expect((params.properties as Record<string, string>)["position"]).toBe(
          "Vector2(100, 200)"
        );
      });

      it("returns error when bridge throws", async () => {
        mockBridge._setError("scene.add_node", new Error("Failed to add"));
        const result = await mockServer.callTool("godot_add_node", {
          project_path: "/proj",
          scene_path: "res://main.tscn",
          node_type: "Node",
          node_name: "N",
        });
        expect(result.isError).toBe(true);
      });
    });

    describe("godot_remove_node", () => {
      it("sends scene.remove_node with path", async () => {
        await mockServer.callTool("godot_remove_node", { path: "Player" });
        expect(mockBridge._getCalls()[0].method).toBe("scene.remove_node");
        expect(mockBridge._getCalls()[0].params).toEqual({ path: "Player" });
      });

      it("returns error when bridge throws", async () => {
        mockBridge._setError("scene.remove_node", new Error("Node not found"));
        const result = await mockServer.callTool("godot_remove_node", { path: "X" });
        expect(result.isError).toBe(true);
      });
    });

    describe("godot_set_property", () => {
      it("sends inspector.set_property with path, property, and value", async () => {
        await mockServer.callTool("godot_set_property", {
          path: "Player",
          property: "position",
          value: { x: 100, y: 200 },
        });
        expect(mockBridge._getCalls()[0].method).toBe("inspector.set_property");
        const params = mockBridge._getCalls()[0].params as Record<string, unknown>;
        expect(params.path).toBe("Player");
        expect(params.property).toBe("position");
      });

      it("returns error when bridge throws", async () => {
        mockBridge._setError("inspector.set_property", new Error("Invalid property"));
        const result = await mockServer.callTool("godot_set_property", {
          path: "P",
          property: "bad",
          value: null,
        });
        expect(result.isError).toBe(true);
      });
    });

    describe("godot_save_scene", () => {
      it("sends scene.save when connected", async () => {
        mockBridge._setResponse("scene.save", { success: true, path: "res://main.tscn" });
        const result = await mockServer.callTool("godot_save_scene");
        expect(result.isError).toBeUndefined();
        expect(mockBridge._getCalls()[0].method).toBe("scene.save");
      });

      it("returns error when bridge throws on save", async () => {
        mockBridge._setError("scene.save", new Error("Save failed"));
        const result = await mockServer.callTool("godot_save_scene");
        expect(result.isError).toBe(true);
      });
    });
  });

  describe("when bridge is disconnected", () => {
    beforeEach(() => {
      mockServer = createMockServer();
      mockBridge = createMockBridge({ connected: false });
      registerSceneTools(mockServer.server, mockBridge);
    });

    it("godot_add_node returns error with guidance message", async () => {
      const result = await mockServer.callTool("godot_add_node", {
        project_path: "/proj",
        scene_path: "res://main.tscn",
        node_type: "Node",
        node_name: "N",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(NOT_CONNECTED_SNIPPET);
      expect(mockBridge._getCalls()).toHaveLength(0);
    });

    it("godot_remove_node returns error with guidance message", async () => {
      const result = await mockServer.callTool("godot_remove_node", { path: "P" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(NOT_CONNECTED_SNIPPET);
    });

    it("godot_set_property returns error with guidance message", async () => {
      const result = await mockServer.callTool("godot_set_property", {
        path: "P",
        property: "x",
        value: 1,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(NOT_CONNECTED_SNIPPET);
    });

    it("godot_save_scene returns soft message (not error) when disconnected", async () => {
      const result = await mockServer.callTool("godot_save_scene");
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("already on disk");
      expect(mockBridge._getCalls()).toHaveLength(0);
    });
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer } from "../../__tests__/helpers/mock-server.js";
import { createMockBridge } from "../../__tests__/helpers/mock-bridge.js";
import { registerAnimationTools } from "../animation-tools.js";

describe("animation-tools", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockBridge: ReturnType<typeof createMockBridge>;

  beforeEach(() => {
    mockServer = createMockServer();
    mockBridge = createMockBridge({ connected: true });
    registerAnimationTools(mockServer.server, mockBridge);
  });

  describe("godot_list_animations", () => {
    it("sends animation.list with node path", async () => {
      mockBridge._setResponse("animation.list", {
        node: "AnimationPlayer",
        animations: [{ name: "idle", length: 1.0, track_count: 2 }],
      });
      const result = await mockServer.callTool("godot_list_animations", {
        node_path: "AnimationPlayer",
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("idle");
      expect(mockBridge._getCalls()[0].method).toBe("animation.list");
      expect(mockBridge._getCalls()[0].params).toEqual({ path: "AnimationPlayer" });
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("animation.list", new Error("Node not AnimationPlayer"));
      const result = await mockServer.callTool("godot_list_animations", {
        node_path: "Sprite2D",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Node not AnimationPlayer");
    });
  });

  describe("godot_get_animation", () => {
    it("sends animation.get with path and name", async () => {
      mockBridge._setResponse("animation.get", {
        name: "walk",
        length: 0.5,
        loop_mode: 1,
        tracks: [],
      });
      const result = await mockServer.callTool("godot_get_animation", {
        node_path: "AnimationPlayer",
        animation_name: "walk",
      });
      expect(result.content[0].text).toContain('"walk"');
      expect(mockBridge._getCalls()[0].method).toBe("animation.get");
      expect(mockBridge._getCalls()[0].params).toEqual({
        path: "AnimationPlayer",
        animation_name: "walk",
      });
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("animation.get", new Error("Animation not found"));
      const result = await mockServer.callTool("godot_get_animation", {
        node_path: "AnimationPlayer",
        animation_name: "nonexistent",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_create_animation", () => {
    it("sends animation.create with required params and defaults", async () => {
      mockBridge._setResponse("animation.create", {
        success: true,
        animation_name: "run",
        track_count: 0,
      });
      const result = await mockServer.callTool("godot_create_animation", {
        node_path: "AnimationPlayer",
        animation_name: "run",
        length: 1.0,
      });
      expect(result.isError).toBeUndefined();
      const params = mockBridge._getCalls()[0].params as Record<string, unknown>;
      expect(params.path).toBe("AnimationPlayer");
      expect(params.animation_name).toBe("run");
      expect(params.length).toBe(1.0);
      expect(params.loop_mode).toBe(0);
      expect(params.tracks).toEqual([]);
    });

    it("parses tracks JSON and forwards with loop_mode", async () => {
      const tracks = JSON.stringify([{ path: "Sprite2D:position", keys: [] }]);
      await mockServer.callTool("godot_create_animation", {
        node_path: "AnimationPlayer",
        animation_name: "jump",
        length: 0.3,
        loop_mode: 2,
        tracks,
      });
      const params = mockBridge._getCalls()[0].params as Record<string, unknown>;
      expect(params.loop_mode).toBe(2);
      expect((params.tracks as unknown[]).length).toBe(1);
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("animation.create", new Error("Animation exists"));
      const result = await mockServer.callTool("godot_create_animation", {
        node_path: "AnimationPlayer",
        animation_name: "idle",
        length: 1.0,
      });
      expect(result.isError).toBe(true);
    });

    it("returns error when tracks JSON is invalid", async () => {
      const result = await mockServer.callTool("godot_create_animation", {
        path: "AnimationPlayer",
        animation_name: "test",
        length: 1.0,
        tracks: "not valid json{{{",
      });
      expect(result.isError).toBe(true);
    });
  });
});

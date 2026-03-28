import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer } from "../../__tests__/helpers/mock-server.js";
import { createMockBridge } from "../../__tests__/helpers/mock-bridge.js";
import { registerScriptTools } from "../script-tools.js";

describe("script-tools", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockBridge: ReturnType<typeof createMockBridge>;

  beforeEach(() => {
    mockServer = createMockServer();
    mockBridge = createMockBridge({ connected: true });
    registerScriptTools(mockServer.server, mockBridge);
  });

  describe("godot_get_current_script", () => {
    it("sends script.get_current and returns result", async () => {
      mockBridge._setResponse("script.get_current", {
        path: "res://player.gd",
        source: "extends CharacterBody2D\n",
        cursor_line: 5,
      });
      const result = await mockServer.callTool("godot_get_current_script");
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("player.gd");
      expect(mockBridge._getCalls()[0].method).toBe("script.get_current");
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("script.get_current", new Error("No script open"));
      const result = await mockServer.callTool("godot_get_current_script");
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_get_selected_code", () => {
    it("sends script.get_selected_code and returns result", async () => {
      mockBridge._setResponse("script.get_selected_code", {
        selected_text: "func _ready():\n\tpass",
      });
      const result = await mockServer.callTool("godot_get_selected_code");
      expect(result.content[0].text).toContain("_ready");
      expect(mockBridge._getCalls()[0].method).toBe("script.get_selected_code");
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("script.get_selected_code", new Error("No editor"));
      const result = await mockServer.callTool("godot_get_selected_code");
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_insert_code", () => {
    it("sends script.insert_at_cursor with text", async () => {
      mockBridge._setResponse("script.insert_at_cursor", { success: true });
      const result = await mockServer.callTool("godot_insert_code", {
        text: "print('hello')",
      });
      expect(result.isError).toBeUndefined();
      expect(mockBridge._getCalls()[0].method).toBe("script.insert_at_cursor");
      expect(mockBridge._getCalls()[0].params).toEqual({ text: "print('hello')" });
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("script.insert_at_cursor", new Error("No cursor"));
      const result = await mockServer.callTool("godot_insert_code", {
        text: "code",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_get_open_scripts", () => {
    it("sends script.get_open and returns list", async () => {
      mockBridge._setResponse("script.get_open", {
        scripts: ["res://player.gd", "res://enemy.gd"],
      });
      const result = await mockServer.callTool("godot_get_open_scripts");
      expect(result.content[0].text).toContain("enemy.gd");
      expect(mockBridge._getCalls()[0].method).toBe("script.get_open");
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("script.get_open", new Error("No editor"));
      const result = await mockServer.callTool("godot_get_open_scripts");
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_create_script", () => {
    it("sends script.create_and_attach with required params", async () => {
      mockBridge._setResponse("script.create_and_attach", {
        success: true,
        script_path: "res://player.gd",
      });
      const result = await mockServer.callTool("godot_create_script", {
        node_path: "Player",
        script_path: "res://player.gd",
      });
      expect(result.isError).toBeUndefined();
      const params = mockBridge._getCalls()[0].params as Record<string, unknown>;
      expect(params.node_path).toBe("Player");
      expect(params.script_path).toBe("res://player.gd");
      expect(params.template).toBeUndefined();
    });

    it("forwards optional template", async () => {
      await mockServer.callTool("godot_create_script", {
        node_path: "Player",
        script_path: "res://player.gd",
        template: "extends CharacterBody2D\n",
      });
      const params = mockBridge._getCalls()[0].params as Record<string, unknown>;
      expect(params.template).toBe("extends CharacterBody2D\n");
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("script.create_and_attach", new Error("Node not found"));
      const result = await mockServer.callTool("godot_create_script", {
        node_path: "X",
        script_path: "res://x.gd",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_detach_script", () => {
    it("sends script.detach with node_path", async () => {
      mockBridge._setResponse("script.detach", { success: true });
      await mockServer.callTool("godot_detach_script", { node_path: "Player" });
      expect(mockBridge._getCalls()[0].method).toBe("script.detach");
      expect(mockBridge._getCalls()[0].params).toEqual({ node_path: "Player" });
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("script.detach", new Error("No script"));
      const result = await mockServer.callTool("godot_detach_script", {
        node_path: "Player",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_get_script_for_node", () => {
    it("sends script.get_for_node with path", async () => {
      mockBridge._setResponse("script.get_for_node", {
        script_path: "res://player.gd",
      });
      const result = await mockServer.callTool("godot_get_script_for_node", {
        node_path: "Player",
      });
      expect(result.content[0].text).toContain("player.gd");
      expect(mockBridge._getCalls()[0].params).toEqual({ path: "Player" });
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("script.get_for_node", new Error("Node not found"));
      const result = await mockServer.callTool("godot_get_script_for_node", {
        node_path: "X",
      });
      expect(result.isError).toBe(true);
    });
  });
});

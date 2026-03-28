import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer } from "../../__tests__/helpers/mock-server.js";
import { createMockBridge } from "../../__tests__/helpers/mock-bridge.js";
import { registerSignalTools } from "../signal-tools.js";

describe("signal-tools", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockBridge: ReturnType<typeof createMockBridge>;

  beforeEach(() => {
    mockServer = createMockServer();
    mockBridge = createMockBridge({ connected: true });
    registerSignalTools(mockServer.server, mockBridge);
  });

  describe("godot_list_signals", () => {
    it("sends signal.list with node path", async () => {
      mockBridge._setResponse("signal.list", {
        node: "Player",
        signals: [{ name: "health_changed", args: [{ name: "new_health", type: "int" }] }],
      });
      const result = await mockServer.callTool("godot_list_signals", {
        path: "Player",
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("health_changed");
      expect(mockBridge._getCalls()[0].method).toBe("signal.list");
      expect(mockBridge._getCalls()[0].params).toEqual({ path: "Player" });
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("signal.list", new Error("Node not found"));
      const result = await mockServer.callTool("godot_list_signals", {
        path: "NonExistent",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Node not found");
    });
  });

  describe("godot_connect_signal", () => {
    it("sends signal.connect with all required params", async () => {
      mockBridge._setResponse("signal.connect", { success: true });
      const result = await mockServer.callTool("godot_connect_signal", {
        from_path: "Button",
        signal_name: "pressed",
        to_path: "Player",
        method: "_on_button_pressed",
      });
      expect(result.isError).toBeUndefined();
      const calls = mockBridge._getCalls();
      expect(calls[0].method).toBe("signal.connect");
      expect(calls[0].params).toEqual({
        from_path: "Button",
        signal_name: "pressed",
        to_path: "Player",
        method: "_on_button_pressed",
        flags: undefined,
      });
    });

    it("forwards optional flags parameter", async () => {
      await mockServer.callTool("godot_connect_signal", {
        from_path: "Button",
        signal_name: "pressed",
        to_path: "Player",
        method: "_on_button_pressed",
        flags: 1,
      });
      expect((mockBridge._getCalls()[0].params as Record<string, unknown>).flags).toBe(1);
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("signal.connect", new Error("Already connected"));
      const result = await mockServer.callTool("godot_connect_signal", {
        from_path: "A",
        signal_name: "sig",
        to_path: "B",
        method: "method",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_disconnect_signal", () => {
    it("sends signal.disconnect with all params", async () => {
      await mockServer.callTool("godot_disconnect_signal", {
        from_path: "Button",
        signal_name: "pressed",
        to_path: "Player",
        method: "_on_button_pressed",
      });
      expect(mockBridge._getCalls()[0].method).toBe("signal.disconnect");
      expect(mockBridge._getCalls()[0].params).toEqual({
        from_path: "Button",
        signal_name: "pressed",
        to_path: "Player",
        method: "_on_button_pressed",
      });
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("signal.disconnect", new Error("Not connected"));
      const result = await mockServer.callTool("godot_disconnect_signal", {
        from_path: "A",
        signal_name: "sig",
        to_path: "B",
        method: "m",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_list_connections", () => {
    it("sends signal.list_connections with empty path when not provided", async () => {
      mockBridge._setResponse("signal.list_connections", {
        connections: [
          { signal: "pressed", from: "Button", to: "Player", method: "_on_pressed", flags: 0 },
        ],
      });
      const result = await mockServer.callTool("godot_list_connections");
      expect(result.content[0].text).toContain("pressed");
      expect((mockBridge._getCalls()[0].params as Record<string, unknown>).path).toBe("");
    });

    it("sends path when provided", async () => {
      await mockServer.callTool("godot_list_connections", { path: "Player" });
      expect((mockBridge._getCalls()[0].params as Record<string, unknown>).path).toBe("Player");
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("signal.list_connections", new Error("Bridge error"));
      const result = await mockServer.callTool("godot_list_connections");
      expect(result.isError).toBe(true);
    });
  });
});

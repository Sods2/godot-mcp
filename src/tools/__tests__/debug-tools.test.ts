import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer } from "../../__tests__/helpers/mock-server.js";
import { createMockBridge } from "../../__tests__/helpers/mock-bridge.js";
import { registerDebugTools } from "../debug-tools.js";

describe("debug-tools", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockBridge: ReturnType<typeof createMockBridge>;

  beforeEach(() => {
    mockServer = createMockServer();
    mockBridge = createMockBridge({ connected: true });
    registerDebugTools(mockServer.server, mockBridge);
  });

  describe("godot_set_breakpoint", () => {
    it("sends debug.set_breakpoint with file and line", async () => {
      mockBridge._setResponse("debug.set_breakpoint", {
        success: true,
        file: "res://main.gd",
        line: 42,
      });
      const result = await mockServer.callTool("godot_set_breakpoint", {
        file: "res://main.gd",
        line: 42,
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('"success": true');
      const calls = mockBridge._getCalls();
      expect(calls[0].method).toBe("debug.set_breakpoint");
      expect(calls[0].params).toEqual({ file: "res://main.gd", line: 42 });
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("debug.set_breakpoint", new Error("Not paused"));
      const result = await mockServer.callTool("godot_set_breakpoint", {
        file: "res://main.gd",
        line: 1,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Not paused");
    });
  });

  describe("godot_remove_breakpoint", () => {
    it("sends debug.remove_breakpoint with file and line", async () => {
      const result = await mockServer.callTool("godot_remove_breakpoint", {
        file: "res://main.gd",
        line: 42,
      });
      expect(result.isError).toBeUndefined();
      expect(mockBridge._getCalls()[0].method).toBe("debug.remove_breakpoint");
      expect(mockBridge._getCalls()[0].params).toEqual({
        file: "res://main.gd",
        line: 42,
      });
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("debug.remove_breakpoint", new Error("Bridge error"));
      const result = await mockServer.callTool("godot_remove_breakpoint", {
        file: "res://main.gd",
        line: 1,
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_list_breakpoints", () => {
    it("sends debug.list_breakpoints and returns result", async () => {
      mockBridge._setResponse("debug.list_breakpoints", {
        breakpoints: [{ file: "res://main.gd", line: 10 }],
      });
      const result = await mockServer.callTool("godot_list_breakpoints");
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('"res://main.gd"');
      expect(mockBridge._getCalls()[0].method).toBe("debug.list_breakpoints");
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("debug.list_breakpoints", new Error("No session"));
      const result = await mockServer.callTool("godot_list_breakpoints");
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_get_stack_trace", () => {
    it("sends debug.get_stack_trace and returns result", async () => {
      mockBridge._setResponse("debug.get_stack_trace", {
        frames: [{ file: "res://player.gd", line: 5, function: "_process" }],
      });
      const result = await mockServer.callTool("godot_get_stack_trace");
      expect(result.content[0].text).toContain("_process");
      expect(mockBridge._getCalls()[0].method).toBe("debug.get_stack_trace");
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("debug.get_stack_trace", new Error("Not paused"));
      const result = await mockServer.callTool("godot_get_stack_trace");
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_get_locals", () => {
    it("sends debug.get_locals and returns result", async () => {
      mockBridge._setResponse("debug.get_locals", {
        locals: [{ name: "speed", value: "200" }],
      });
      const result = await mockServer.callTool("godot_get_locals");
      expect(result.content[0].text).toContain("speed");
      expect(mockBridge._getCalls()[0].method).toBe("debug.get_locals");
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("debug.get_locals", new Error("Not paused"));
      const result = await mockServer.callTool("godot_get_locals");
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_step_over", () => {
    it("sends debug.step_over", async () => {
      await mockServer.callTool("godot_step_over");
      expect(mockBridge._getCalls()[0].method).toBe("debug.step_over");
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("debug.step_over", new Error("Not paused"));
      const result = await mockServer.callTool("godot_step_over");
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_step_into", () => {
    it("sends debug.step_into", async () => {
      await mockServer.callTool("godot_step_into");
      expect(mockBridge._getCalls()[0].method).toBe("debug.step_into");
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("debug.step_into", new Error("Not paused"));
      const result = await mockServer.callTool("godot_step_into");
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_step_out", () => {
    it("sends debug.step_out", async () => {
      await mockServer.callTool("godot_step_out");
      expect(mockBridge._getCalls()[0].method).toBe("debug.step_out");
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("debug.step_out", new Error("Not paused"));
      const result = await mockServer.callTool("godot_step_out");
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_continue", () => {
    it("sends debug.continue_execution", async () => {
      await mockServer.callTool("godot_continue");
      expect(mockBridge._getCalls()[0].method).toBe("debug.continue_execution");
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("debug.continue_execution", new Error("Not paused"));
      const result = await mockServer.callTool("godot_continue");
      expect(result.isError).toBe(true);
    });
  });
});

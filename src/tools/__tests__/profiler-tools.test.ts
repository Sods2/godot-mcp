import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer } from "../../__tests__/helpers/mock-server.js";
import { createMockBridge } from "../../__tests__/helpers/mock-bridge.js";
import { registerProfilerTools } from "../profiler-tools.js";

describe("profiler-tools", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockBridge: ReturnType<typeof createMockBridge>;

  beforeEach(() => {
    mockServer = createMockServer();
    mockBridge = createMockBridge({ connected: true });
    registerProfilerTools(mockServer.server, mockBridge);
  });

  describe("godot_start_profiler", () => {
    it("sends profiler.start and returns result", async () => {
      mockBridge._setResponse("profiler.start", { success: true });
      const result = await mockServer.callTool("godot_start_profiler");
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('"success": true');
      expect(mockBridge._getCalls()[0].method).toBe("profiler.start");
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("profiler.start", new Error("Not running"));
      const result = await mockServer.callTool("godot_start_profiler");
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Not running");
    });
  });

  describe("godot_stop_profiler", () => {
    it("sends profiler.stop and returns result", async () => {
      mockBridge._setResponse("profiler.stop", {
        success: true,
        frame_count: 60,
      });
      const result = await mockServer.callTool("godot_stop_profiler");
      expect(result.content[0].text).toContain("frame_count");
      expect(mockBridge._getCalls()[0].method).toBe("profiler.stop");
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("profiler.stop", new Error("Not profiling"));
      const result = await mockServer.callTool("godot_stop_profiler");
      expect(result.isError).toBe(true);
    });
  });

  describe("godot_get_profiler_data", () => {
    it("sends profiler.get_data and returns result", async () => {
      mockBridge._setResponse("profiler.get_data", {
        frames: [{ time_ms: 16.7, calls: [] }],
      });
      const result = await mockServer.callTool("godot_get_profiler_data");
      expect(result.content[0].text).toContain("frames");
      expect(mockBridge._getCalls()[0].method).toBe("profiler.get_data");
    });

    it("returns error when bridge throws", async () => {
      mockBridge._setError("profiler.get_data", new Error("No data"));
      const result = await mockServer.callTool("godot_get_profiler_data");
      expect(result.isError).toBe(true);
    });
  });
});

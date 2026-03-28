import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockServer } from "../../__tests__/helpers/mock-server.js";
import { createMockBridge } from "../../__tests__/helpers/mock-bridge.js";
import { createMockProcessManager } from "../../__tests__/helpers/mock-process-manager.js";
import { registerRunTools } from "../run-tools.js";

const godotPath = async () => "/usr/bin/godot";

describe("run-tools", () => {
  describe("when bridge is connected", () => {
    let mockServer: ReturnType<typeof createMockServer>;
    let mockBridge: ReturnType<typeof createMockBridge>;
    let mockPM: ReturnType<typeof createMockProcessManager>;

    beforeEach(() => {
      mockServer = createMockServer();
      mockBridge = createMockBridge({ connected: true });
      mockPM = createMockProcessManager();
      registerRunTools(mockServer.server, mockPM, mockBridge, godotPath);
    });

    describe("godot_run_scene", () => {
      it("uses bridge.run.play when connected", async () => {
        mockBridge._setResponse("run.play", { success: true, playing: true });
        const result = await mockServer.callTool("godot_run_scene", {
          project_path: "/proj",
        });
        expect(result.isError).toBeUndefined();
        expect(mockBridge._getCalls()[0].method).toBe("run.play");
        expect(vi.mocked(mockPM.runProject)).not.toHaveBeenCalled();
      });

      it("forwards scene param to bridge", async () => {
        await mockServer.callTool("godot_run_scene", {
          project_path: "/proj",
          scene: "res://main.tscn",
        });
        expect(
          (mockBridge._getCalls()[0].params as Record<string, unknown>).scene
        ).toBe("res://main.tscn");
      });

      it("returns error when bridge throws", async () => {
        mockBridge._setError("run.play", new Error("Already playing"));
        const result = await mockServer.callTool("godot_run_scene", {
          project_path: "/proj",
        });
        expect(result.isError).toBe(true);
      });
    });

    describe("godot_stop_scene", () => {
      it("uses bridge.run.stop when connected", async () => {
        mockBridge._setResponse("run.stop", { success: true });
        await mockServer.callTool("godot_stop_scene");
        expect(mockBridge._getCalls()[0].method).toBe("run.stop");
        expect(vi.mocked(mockPM.stopProject)).not.toHaveBeenCalled();
      });

      it("returns error when bridge throws", async () => {
        mockBridge._setError("run.stop", new Error("Not running"));
        const result = await mockServer.callTool("godot_stop_scene");
        expect(result.isError).toBe(true);
      });
    });

    describe("godot_get_output", () => {
      it("uses bridge.run.get_output when connected", async () => {
        mockBridge._setResponse("run.get_output", {
          output: ["line1"],
          total_lines: 1,
        });
        const result = await mockServer.callTool("godot_get_output");
        expect(result.content[0].text).toContain("line1");
        expect(mockBridge._getCalls()[0].method).toBe("run.get_output");
      });

      it("returns error when bridge throws", async () => {
        mockBridge._setError("run.get_output", new Error("No output"));
        const result = await mockServer.callTool("godot_get_output");
        expect(result.isError).toBe(true);
      });
    });

    describe("godot_is_running", () => {
      it("uses bridge.run.is_running when connected", async () => {
        mockBridge._setResponse("run.is_running", { running: true });
        const result = await mockServer.callTool("godot_is_running");
        expect(result.content[0].text).toContain('"running": true');
        expect(mockBridge._getCalls()[0].method).toBe("run.is_running");
      });

      it("returns error when bridge throws", async () => {
        mockBridge._setError("run.is_running", new Error("Bridge error"));
        const result = await mockServer.callTool("godot_is_running");
        expect(result.isError).toBe(true);
      });
    });
  });

  describe("when bridge is disconnected", () => {
    let mockServer: ReturnType<typeof createMockServer>;
    let mockBridge: ReturnType<typeof createMockBridge>;
    let mockPM: ReturnType<typeof createMockProcessManager>;

    beforeEach(() => {
      mockServer = createMockServer();
      mockBridge = createMockBridge({ connected: false });
      mockPM = createMockProcessManager();
      registerRunTools(mockServer.server, mockPM, mockBridge, godotPath);
    });

    describe("godot_run_scene", () => {
      it("falls back to processManager.runProject", async () => {
        await mockServer.callTool("godot_run_scene", {
          project_path: "/proj",
          scene: "res://main.tscn",
        });
        expect(vi.mocked(mockPM.runProject)).toHaveBeenCalledWith(
          "/usr/bin/godot",
          "/proj",
          "res://main.tscn"
        );
        expect(mockBridge._getCalls()).toHaveLength(0);
      });

      it("returns error when processManager throws", async () => {
        vi.mocked(mockPM.runProject).mockRejectedValueOnce(
          new Error("Godot not found")
        );
        const result = await mockServer.callTool("godot_run_scene", {
          project_path: "/proj",
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Godot not found");
      });
    });

    describe("godot_stop_scene", () => {
      it("falls back to processManager.stopProject", async () => {
        vi.mocked(mockPM.stopProject).mockResolvedValueOnce({
          output: ["out"],
          errors: [],
        });
        const result = await mockServer.callTool("godot_stop_scene");
        expect(vi.mocked(mockPM.stopProject)).toHaveBeenCalled();
        expect(result.content[0].text).toContain('"stopped": true');
      });
    });

    describe("godot_get_output", () => {
      it("falls back to processManager.getDebugOutput", async () => {
        vi.mocked(mockPM.getDebugOutput).mockReturnValueOnce({
          output: ["line0", "line1", "line2"],
          errors: [],
        });
        const result = await mockServer.callTool("godot_get_output");
        const data = JSON.parse(result.content[0].text!);
        expect(data.output).toEqual(["line0", "line1", "line2"]);
        expect(data.total_lines).toBe(3);
      });

      it("slices output by since_line when using fallback", async () => {
        vi.mocked(mockPM.getDebugOutput).mockReturnValueOnce({
          output: ["line0", "line1", "line2"],
          errors: [],
        });
        const result = await mockServer.callTool("godot_get_output", {
          since_line: 1,
        });
        const data = JSON.parse(result.content[0].text!);
        expect(data.output).toEqual(["line1", "line2"]);
      });
    });

    describe("godot_is_running", () => {
      it("falls back to processManager.isRunning", async () => {
        vi.mocked(mockPM.isRunning).mockReturnValueOnce(true);
        const result = await mockServer.callTool("godot_is_running");
        const data = JSON.parse(result.content[0].text!);
        expect(data.running).toBe(true);
      });
    });
  });
});

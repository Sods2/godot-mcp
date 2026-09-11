import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer } from "../../__tests__/helpers/mock-server.js";
import { createMockBridge } from "../../__tests__/helpers/mock-bridge.js";
import { registerScreenshotTools } from "../screenshot-tools.js";

describe("screenshot-tools", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockBridge: ReturnType<typeof createMockBridge>;

  beforeEach(() => {
    mockServer = createMockServer();
    mockBridge = createMockBridge({ connected: true });
    registerScreenshotTools(mockServer.server, mockBridge);
  });

  describe("godot_take_screenshot", () => {
    it("sends screenshot.viewport and returns image content", async () => {
      mockBridge._setResponse("screenshot.viewport", {
        data: "base64encodedpngdata",
      });
      const result = await mockServer.callTool("godot_take_screenshot");
      expect(result.isError).toBeUndefined();
      expect(result.content[0].type).toBe("image");
      expect(result.content[0].data).toBe("base64encodedpngdata");
      expect(result.content[0].mimeType).toBe("image/png");
      expect(mockBridge._getCalls()[0].method).toBe("screenshot.viewport");
    });

    it("returns text error when bridge throws", async () => {
      mockBridge._setError("screenshot.viewport", new Error("No viewport"));
      const result = await mockServer.callTool("godot_take_screenshot");
      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("No viewport");
    });
  });

  describe("godot_take_game_screenshot", () => {
    it("sends screenshot.game and returns image content", async () => {
      mockBridge._setResponse("screenshot.game", {
        data: "gameframepngdata",
      });
      const result = await mockServer.callTool("godot_take_game_screenshot");
      expect(result.isError).toBeUndefined();
      expect(result.content[0].type).toBe("image");
      expect(result.content[0].data).toBe("gameframepngdata");
      expect(result.content[0].mimeType).toBe("image/png");
      expect(mockBridge._getCalls()[0].method).toBe("screenshot.game");
    });

    it("returns text error when bridge throws", async () => {
      mockBridge._setError("screenshot.game", new Error("Game not running"));
      const result = await mockServer.callTool("godot_take_game_screenshot");
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Game not running");
    });
  });
});

describe("screenshot error handling", () => {
  // The bridge reports failures as { error } in the result. Building an image
  // block from that produces data: undefined, which fails MCP schema
  // validation and kills the call instead of reporting the message.
  it("returns a readable error when the bridge reports one", async () => {
    const mockServer = createMockServer();
    const mockBridge = createMockBridge({ connected: true });
    registerScreenshotTools(mockServer.server, mockBridge);
    mockBridge._setResponse("screenshot.game", {
      error: "No game is currently running",
    });

    const result = await mockServer.callTool("godot_take_game_screenshot", {});
    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("No game is currently running");
  });

  it("returns an error rather than an empty image block", async () => {
    const mockServer = createMockServer();
    const mockBridge = createMockBridge({ connected: true });
    registerScreenshotTools(mockServer.server, mockBridge);
    mockBridge._setResponse("screenshot.viewport", { success: true });

    const result = await mockServer.callTool("godot_take_screenshot", {});
    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe("text");
  });

  it("returns an image block when the bridge returns data", async () => {
    const mockServer = createMockServer();
    const mockBridge = createMockBridge({ connected: true });
    registerScreenshotTools(mockServer.server, mockBridge);
    mockBridge._setResponse("screenshot.viewport", { data: "aGk=", success: true });

    const result = await mockServer.callTool("godot_take_screenshot", {});
    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe("image");
  });
});

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BridgeConnection } from "../connection.js";
import type { ScreenshotResponse } from "../types/bridge-responses.js";

export function registerScreenshotTools(
  server: McpServer,
  bridge: BridgeConnection
): void {
  server.tool(
    "godot_take_screenshot",
    "Take a screenshot of the Godot viewport",
    {},
    async () => {
      try {
        const result = await bridge.send<ScreenshotResponse>("screenshot.viewport");
        return {
          content: [
            {
              type: "image" as const,
              data: result.data,
              mimeType: "image/png",
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "godot_take_game_screenshot",
    "Capture the running Godot game window as a base64 PNG image",
    {},
    async () => {
      try {
        const result = await bridge.send<ScreenshotResponse>("screenshot.game");
        return {
          content: [
            {
              type: "image" as const,
              data: result.data,
              mimeType: "image/png",
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}

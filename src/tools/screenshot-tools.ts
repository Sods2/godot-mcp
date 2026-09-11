import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BridgeConnection } from "../connection.js";
import type { ScreenshotResponse } from "../types/bridge-responses.js";

/**
 * The bridge reports failures as `{ error }` in the result rather than as a
 * JSON-RPC error. Building an image block from that yields `data: undefined`,
 * which is not a valid MCP content block and fails the whole call at the
 * protocol level instead of surfacing the message.
 */
function imageResult(result: ScreenshotResponse & { error?: string }) {
  if (result.error || !result.data) {
    return {
      content: [
        { type: "text" as const, text: `Error: ${result.error ?? "no image data returned"}` },
      ],
      isError: true,
    };
  }
  return {
    content: [
      { type: "image" as const, data: result.data, mimeType: "image/png" },
    ],
  };
}

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
        const result = await bridge.send<ScreenshotResponse & { error?: string }>(
          "screenshot.viewport"
        );
        return imageResult(result);
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
        const result = await bridge.send<ScreenshotResponse & { error?: string }>(
          "screenshot.game"
        );
        return imageResult(result);
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}

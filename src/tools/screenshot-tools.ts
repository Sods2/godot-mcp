import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BridgeConnection } from "../connection.js";

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
        const result = (await bridge.send("screenshot.viewport")) as {
          data: string;
        };
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

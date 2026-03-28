import { vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

interface RegisteredTool {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
    isError?: boolean;
  }>;
}

export function createMockServer() {
  const tools = new Map<string, RegisteredTool>();

  const server = {
    tool: vi.fn(
      (name: string, description: string, schema: unknown, handler: unknown) => {
        tools.set(name, {
          name,
          description,
          schema: schema as Record<string, unknown>,
          handler: handler as RegisteredTool["handler"],
        });
      }
    ),
  } as unknown as McpServer;

  return {
    server,
    getTools() {
      return new Map(tools);
    },
    getToolNames() {
      return [...tools.keys()];
    },
    async callTool(name: string, args: Record<string, unknown> = {}) {
      const t = tools.get(name);
      if (!t) throw new Error(`Tool "${name}" not registered`);
      return t.handler(args);
    },
  };
}

export type MockServer = ReturnType<typeof createMockServer>;

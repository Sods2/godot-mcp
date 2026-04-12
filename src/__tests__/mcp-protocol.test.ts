import { describe, it, expect, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMockBridge } from "./helpers/mock-bridge.js";
import { registerDebugTools } from "../tools/debug-tools.js";
import { registerEditorTools } from "../tools/editor-tools.js";
import { registerScriptTools } from "../tools/script-tools.js";

describe("mcp-protocol", () => {
  let server: McpServer;
  let client: Client;
  let mockBridge: ReturnType<typeof createMockBridge>;

  beforeEach(async () => {
    mockBridge = createMockBridge({ connected: true });
    server = new McpServer({ name: "godot-mcp-test", version: "0.0.1" });

    // Register a subset of tools for protocol-level testing
    registerDebugTools(server, mockBridge);
    registerEditorTools(server, mockBridge);
    registerScriptTools(server, mockBridge);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-client", version: "0.0.1" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  it("tools/list returns registered tools", async () => {
    const response = await client.listTools();
    const names = response.tools.map((t) => t.name);
    expect(names).toContain("godot_set_breakpoint");
    expect(names).toContain("godot_editor_status");
    expect(names).toContain("godot_get_current_script");
    expect(response.tools.length).toBeGreaterThanOrEqual(3);
  });

  it("each tool in tools/list has a name and description", async () => {
    const response = await client.listTools();
    for (const tool of response.tools) {
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.description!.length).toBeGreaterThan(0);
    }
  });

  it("tools/call invokes the correct handler and returns content", async () => {
    mockBridge._setResponse("debug.list_breakpoints", {
      breakpoints: [{ file: "res://main.gd", line: 10 }],
    });
    const response = await client.callTool({
      name: "godot_list_breakpoints",
      arguments: {},
    });
    expect(response.content).toBeDefined();
    const content = response.content as Array<{ type: string; text: string }>;
    expect(content[0].type).toBe("text");
    const text = content[0].text;
    expect(text).toContain("res://main.gd");
  });

  it("tools/call passes parameters to the handler", async () => {
    mockBridge._setResponse("debug.set_breakpoint", {
      success: true,
      file: "res://player.gd",
      line: 15,
    });
    await client.callTool({
      name: "godot_set_breakpoint",
      arguments: { file: "res://player.gd", line: 15 },
    });
    const calls = mockBridge._getCalls();
    expect(calls[0].method).toBe("debug.set_breakpoint");
    expect((calls[0].params as Record<string, unknown>).file).toBe(
      "res://player.gd"
    );
    expect((calls[0].params as Record<string, unknown>).line).toBe(15);
  });

  it("editor_status returns connected:false without bridge call when not connected", async () => {
    mockBridge._setConnected(false);
    const response = await client.callTool({
      name: "godot_editor_status",
      arguments: {},
    });
    const content = response.content as Array<{ type: string; text: string }>;
    const text = content[0].text;
    const data = JSON.parse(text);
    expect(data.connected).toBe(false);
    expect(mockBridge._getCalls()).toHaveLength(0);
  });
});

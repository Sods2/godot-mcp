import { describe, it, expect } from "vitest";
import { SERVER_VERSION, outdatedAddonMessage } from "../addon-version.js";
import { withAddonWarning } from "../addon-warning.js";
import { createMockServer } from "./helpers/mock-server.js";
import { createMockBridge } from "./helpers/mock-bridge.js";
import { registerSceneTools } from "../tools/scene-tools.js";

function setup() {
  const mock = createMockServer();
  const bridge = createMockBridge({ connected: true });
  registerSceneTools(withAddonWarning(mock.server, bridge), bridge);
  return { mock, bridge };
}
const texts = (r: { content: Array<{ text?: string }> }) => r.content.map((c) => c.text ?? "").join("\n");
const statusCalls = (b: ReturnType<typeof setup>["bridge"]) => b._getCalls().filter((c) => c.method === "editor.status").length;

describe("first-call addon warning", () => {
  it("warns once on the first bridge tool call, then stays silent", async () => {
    const { mock, bridge } = setup();
    bridge._setResponse("editor.status", { connected: true, open_scenes: [] });
    const first = await mock.callTool("godot_remove_node", { node_path: "Foo" });
    expect(first.isError).toBeUndefined();
    expect(texts(first)).toMatch(/update the godot addon/i);
    const second = await mock.callTool("godot_remove_node", { node_path: "Foo" });
    expect(texts(second)).not.toMatch(/update the godot addon/i);
    expect(statusCalls(bridge)).toBe(1);
  });

  it("does not warn when versions match", async () => {
    const { mock, bridge } = setup();
    bridge._setResponse("editor.status", { connected: true, edited_scene: "", addon_version: SERVER_VERSION });
    const r = await mock.callTool("godot_remove_node", { node_path: "Foo" });
    expect(texts(r)).not.toMatch(/addon/i);
    await mock.callTool("godot_remove_node", { node_path: "Foo" });
    expect(statusCalls(bridge)).toBe(1);
  });

  it("warns when the addon rejects editor.status as unknown", async () => {
    const { mock, bridge } = setup();
    bridge._setError("editor.status", new Error(outdatedAddonMessage("unknown command")));
    const r = await mock.callTool("godot_remove_node", { node_path: "Foo" });
    expect(texts(r)).toMatch(/update the godot addon/i);
  });
});

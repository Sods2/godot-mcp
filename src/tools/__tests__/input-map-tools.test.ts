import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer } from "../../__tests__/helpers/mock-server.js";
import { createMockBridge } from "../../__tests__/helpers/mock-bridge.js";
import { registerInputMapTools, inputEventSchema } from "../input-map-tools.js";

describe("input-map-tools", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockBridge: ReturnType<typeof createMockBridge>;

  beforeEach(() => {
    mockServer = createMockServer();
    mockBridge = createMockBridge({ connected: true });
    registerInputMapTools(mockServer.server, mockBridge);
  });

  it("lists actions via input_map.list", async () => {
    mockBridge._setResponse("input_map.list", { actions: [{ action: "jump", deadzone: 0.5, events: [] }], count: 1 });
    const r = await mockServer.callTool("godot_list_input_actions", {});
    expect(r.isError).toBeUndefined();
    expect(r.content[0].text).toContain("jump");
    expect(mockBridge._getCalls()[0]).toMatchObject({ method: "input_map.list", params: { include_builtin: false } });
  });

  it("adds an action with inline events (repro_8 shape)", async () => {
    mockBridge._setResponse("input_map.add_action", { success: true, action: "dash", created: true, event_count: 1 });
    const r = await mockServer.callTool("godot_add_input_action", {
      action: "dash",
      deadzone: 0.2,
      events: [{ type: "key", physical_keycode: 4194325 }],
    });
    expect(r.isError).toBeUndefined();
    const p = mockBridge._getCalls()[0].params as Record<string, unknown>;
    expect(p.action).toBe("dash");
    expect(p.deadzone).toBe(0.2);
    expect(p.overwrite).toBe(false);
    expect(p.events).toEqual([{ type: "key", physical_keycode: 4194325 }]);
  });

  // The mock server skips zod validation, so exercise the event schema directly.
  it("event schema defaults type to key and accepts mouse buttons", () => {
    expect(inputEventSchema.parse({ keycode: 32 })).toEqual({ type: "key", keycode: 32 });
    expect(inputEventSchema.parse({ type: "mouse_button", button_index: 1 })).toEqual({ type: "mouse_button", button_index: 1 });
  });

  it("event schema rejects key events without a keycode", () => {
    expect(inputEventSchema.safeParse({ type: "key" }).success).toBe(false);
    expect(inputEventSchema.safeParse({ type: "bogus", keycode: 1 }).success).toBe(false);
  });

  it("surfaces bridge-reported error dicts as tool errors", async () => {
    mockBridge._setResponse("input_map.remove_action", { error: "Action not found: nope" });
    const r = await mockServer.callTool("godot_remove_input_action", { action: "nope" });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("Action not found");
  });

  it("removes an action", async () => {
    mockBridge._setResponse("input_map.remove_action", { success: true, action: "dash", removed: true });
    const r = await mockServer.callTool("godot_remove_input_action", { action: "dash" });
    expect(r.isError).toBeUndefined();
    expect(mockBridge._getCalls()[0]).toMatchObject({ method: "input_map.remove_action", params: { action: "dash" } });
  });

  it("add_input_event merges event and events, requires one", async () => {
    mockBridge._setResponse("input_map.add_event", { success: true });
    const bad = await mockServer.callTool("godot_add_input_event", { action: "jump" });
    expect(bad.isError).toBe(true);
    await mockServer.callTool("godot_add_input_event", { action: "jump", event: { type: "key", keycode: 87 } });
    expect(mockBridge._getCalls()[0].params).toEqual({ action: "jump", events: [{ type: "key", keycode: 87 }] });
  });

  it("returns error when bridge throws", async () => {
    mockBridge._setError("input_map.list", new Error("Not connected"));
    const r = await mockServer.callTool("godot_list_input_actions", {});
    expect(r.isError).toBe(true);
  });
});

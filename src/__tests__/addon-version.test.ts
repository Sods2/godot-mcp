import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as net from "node:net";
import { checkAddonStatus, SERVER_VERSION } from "../addon-version.js";
import { BridgeConnection } from "../connection.js";
import { createMockServer } from "./helpers/mock-server.js";
import { createMockBridge } from "./helpers/mock-bridge.js";
import { registerEditorTools } from "../tools/editor-tools.js";

describe("checkAddonStatus", () => {
  it("accepts a matching addon", () => {
    expect(checkAddonStatus({ addon_version: SERVER_VERSION, edited_scene: "" })).toBeNull();
  });
  it("warns when addon_version is missing", () => {
    expect(checkAddonStatus({ edited_scene: "" })).toMatch(/update the godot addon/i);
  });
  it("warns on version mismatch", () => {
    const w = checkAddonStatus({ addon_version: "0.0.1", edited_scene: "" });
    expect(w).toContain("0.0.1");
    expect(w).toContain(SERVER_VERSION);
  });
  it("warns when edited_scene is missing", () => {
    expect(checkAddonStatus({ addon_version: SERVER_VERSION })).toContain("edited_scene");
  });
});

describe("godot_editor_status addon warning", () => {
  it("adds a warning for an old addon", async () => {
    const server = createMockServer();
    const bridge = createMockBridge({ connected: true });
    registerEditorTools(server.server, bridge);
    bridge._setResponse("editor.status", { connected: true, open_scenes: [], is_playing: false });
    const result = await server.callTool("godot_editor_status");
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text).warning).toMatch(/Godot addon/);
  });
  it("has no warning for a matching addon", async () => {
    const server = createMockServer();
    const bridge = createMockBridge({ connected: true });
    registerEditorTools(server.server, bridge);
    bridge._setResponse("editor.status", { connected: true, open_scenes: [], edited_scene: "", addon_version: SERVER_VERSION });
    const result = await server.callTool("godot_editor_status");
    expect(JSON.parse(result.content[0].text).warning).toBeUndefined();
  });
});

describe("BridgeConnection unknown method", () => {
  let srv: net.Server;
  let conn: BridgeConnection;
  beforeEach(async () => {
    srv = net.createServer((sock) => {
      sock.on("data", (d) => {
        const body = JSON.parse(d.toString().split("\r\n\r\n")[1]);
        const out = JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "Unknown method: " + body.method } });
        sock.write(`Content-Length: ${Buffer.byteLength(out)}\r\n\r\n${out}`);
      });
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    conn = new BridgeConnection("127.0.0.1", (srv.address() as net.AddressInfo).port);
    conn.connect();
    for (let i = 0; i < 50 && !conn.connected; i++) await new Promise((r) => setTimeout(r, 20));
  });
  afterEach(() => {
    conn.close();
    srv.close();
  });
  it("turns -32601 into an update-the-addon error", async () => {
    await expect(conn.send("scene.new_thing")).rejects.toThrow(/outdated.*scene\.new_thing.*Update the Godot addon/s);
  });
});

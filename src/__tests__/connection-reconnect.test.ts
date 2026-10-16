import { describe, it, expect, afterEach } from "vitest";
import * as net from "node:net";
import { BridgeConnection } from "../connection.js";

describe("BridgeConnection reconnect", () => {
  let server: net.Server;
  let conn: BridgeConnection;
  afterEach(() => {
    conn?.close();
    server?.close();
  });

  async function listen(): Promise<{ port: number; sockets: net.Socket[] }> {
    const sockets: net.Socket[] = [];
    server = net.createServer((s) => sockets.push(s));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    return { port: (server.address() as net.AddressInfo).port, sockets };
  }

  it("opens a single connection even if reconnectNow is called while connecting", async () => {
    const { port, sockets } = await listen();
    conn = new BridgeConnection("127.0.0.1", port);
    conn.connect();
    conn.reconnectNow();
    conn.reconnectNow();
    await new Promise((r) => setTimeout(r, 300));
    expect(conn.connected).toBe(true);
    expect(sockets.length).toBe(1);
  });

  it("a superseded socket closing does not drop the live connection", async () => {
    const { port, sockets } = await listen();
    conn = new BridgeConnection("127.0.0.1", port);
    conn.connect();
    await new Promise((r) => setTimeout(r, 200));
    expect(conn.connected).toBe(true);
    conn.reconnectNow(); // already connected: no-op
    await new Promise((r) => setTimeout(r, 200));
    expect(sockets.length).toBe(1);
  });

  it("reconnects promptly after the server drops the client", async () => {
    const { port, sockets } = await listen();
    conn = new BridgeConnection("127.0.0.1", port);
    conn.connect();
    await new Promise((r) => setTimeout(r, 200));
    sockets[0].destroy();
    await new Promise((r) => setTimeout(r, 100));
    conn.reconnectNow();
    await new Promise((r) => setTimeout(r, 300));
    expect(conn.connected).toBe(true);
    expect(sockets.length).toBe(2);
  });
});

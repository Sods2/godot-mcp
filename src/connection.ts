import * as net from "node:net";

const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 30000;
const BACKOFF_FACTOR = 2;
const DEFAULT_PORT = 6008;
const DEFAULT_HOST = "127.0.0.1";
const REQUEST_TIMEOUT_MS = 10000;

interface PendingRequest {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class BridgeConnection {
  private socket: net.Socket | null = null;
  private retryMs = INITIAL_RETRY_MS;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private closing = false;
  private buffer = Buffer.alloc(0);
  private pending = new Map<string | number, PendingRequest>();
  private nextId = 1;

  constructor(
    private host = DEFAULT_HOST,
    private port = DEFAULT_PORT
  ) {}

  connect(): void {
    this.closing = false;
    this.attempt();
  }

  get connected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  async send<T = unknown>(method: string, params: unknown = {}): Promise<T> {
    if (!this.connected) {
      throw new Error(
        "EditorPlugin not connected (is godot_mcp_bridge addon enabled in your project?)"
      );
    }
    const id = this.nextId++;
    const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    const body = Buffer.from(msg, "utf-8");
    const header = `Content-Length: ${body.length}\r\n\r\n`;
    const frame = Buffer.concat([Buffer.from(header, "ascii"), body]);
    this.socket!.write(frame);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timeout for method: ${method}`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  close(): void {
    this.closing = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  private attempt(): void {
    if (this.closing) return;
    const socket = net.createConnection({
      host: this.host,
      port: this.port,
    });
    socket.on("connect", () => {
      this.socket = socket;
      this.retryMs = INITIAL_RETRY_MS;
    });
    socket.on("data", (chunk) => this.onData(chunk));
    socket.on("close", () => {
      this.socket = null;
      this.scheduleReconnect();
    });
    socket.on("error", () => socket.destroy());
  }

  private scheduleReconnect(): void {
    if (this.closing) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.attempt();
    }, this.retryMs);
    this.retryMs = Math.min(this.retryMs * BACKOFF_FACTOR, MAX_RETRY_MS);
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;
      const header = this.buffer.subarray(0, headerEnd).toString("ascii");
      const lengthLine = header
        .split("\r\n")
        .find((l) => l.startsWith("Content-Length: "));
      if (!lengthLine) {
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }
      const contentLength = parseInt(lengthLine.slice(16), 10);
      const msgStart = headerEnd + 4;
      const msgEnd = msgStart + contentLength;
      if (this.buffer.length < msgEnd) break;
      const body = this.buffer.subarray(msgStart, msgEnd).toString("utf-8");
      this.buffer = this.buffer.subarray(msgEnd);
      try {
        const response = JSON.parse(body);
        const pending = this.pending.get(response.id);
        if (pending) {
          this.pending.delete(response.id);
          clearTimeout(pending.timer);
          if (response.error) pending.reject(new Error(response.error.message));
          else pending.resolve(response.result);
        }
      } catch {
        // malformed JSON, skip
      }
    }
  }
}

export const bridge = new BridgeConnection();
bridge.connect();

function cleanup() {
  bridge.close();
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("beforeExit", cleanup);

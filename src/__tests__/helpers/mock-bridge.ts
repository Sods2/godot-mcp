import { vi } from "vitest";
import type { BridgeConnection } from "../../connection.js";

export function createMockBridge(options: { connected?: boolean } = {}) {
  let isConnected = options.connected ?? true;
  const responses = new Map<string, unknown>();
  const errors = new Map<string, Error>();
  const calls: Array<{ method: string; params: unknown }> = [];

  const mock = {
    get connected() {
      return isConnected;
    },
    connect: vi.fn(async () => {}),
    close: vi.fn(() => {}),
    send: vi.fn(async <T>(method: string, params: unknown = {}): Promise<T> => {
      calls.push({ method, params });
      if (errors.has(method)) throw errors.get(method)!;
      if (responses.has(method)) return responses.get(method) as T;
      return { success: true } as T;
    }),
    _setConnected(value: boolean) {
      isConnected = value;
    },
    _setResponse(method: string, response: unknown) {
      responses.set(method, response);
    },
    _setError(method: string, error: Error) {
      errors.set(method, error);
    },
    _getCalls() {
      return [...calls];
    },
    _reset() {
      calls.length = 0;
      responses.clear();
      errors.clear();
    },
  };

  return mock as typeof mock & BridgeConnection;
}

export type MockBridge = ReturnType<typeof createMockBridge>;

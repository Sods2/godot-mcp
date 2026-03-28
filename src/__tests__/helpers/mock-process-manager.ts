import { vi } from "vitest";
import type { ProcessManager } from "../../process-manager.js";

export function createMockProcessManager() {
  return {
    launchEditor: vi.fn(async (_godotPath: string, _projectPath: string) => {}),
    runProject: vi.fn(
      async (_godotPath: string, _projectPath: string, _scene?: string) => {}
    ),
    stopProject: vi.fn(async () => ({
      output: [] as string[],
      errors: [] as string[],
    })),
    getDebugOutput: vi.fn(() => ({
      output: [] as string[],
      errors: [] as string[],
    })),
    isRunning: vi.fn(() => false),
  } as unknown as ProcessManager;
}

export type MockProcessManager = ReturnType<typeof createMockProcessManager>;

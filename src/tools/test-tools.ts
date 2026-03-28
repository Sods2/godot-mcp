import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile, writeFile, mkdir, access, readdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expandPath, resolveProjectPath } from "../project-utils.js";
import { cleanOutput } from "../output-utils.js";

const execFileAsync = promisify(execFile);

function resolveResPath(projectPath: string, resPath: string): string {
  const project = expandPath(projectPath);
  const relative = resPath.replace(/^res:\/\//, "");
  return path.join(project, relative);
}

function resPathFromAbsolute(projectPath: string, absPath: string): string {
  const project = expandPath(projectPath);
  const rel = path.relative(project, absPath);
  return "res://" + rel.replace(/\\/g, "/");
}

// Path to the bundled GDScript test runner shipped with the MCP server
function getBuiltinRunnerPath(): string {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(dir, "../../scripts/mcp_test_runner.gd");
}

type Framework = "gut" | "gdunit4" | "builtin";

interface DetectedFramework {
  framework: Framework;
  test_directories: string[];
  config_path?: string;
}

async function detectFramework(projectPath: string): Promise<DetectedFramework> {
  const proj = expandPath(projectPath);

  // Check for GUT
  try {
    await access(path.join(proj, "addons", "gut"));
    const testDirs: string[] = ["res://tests", "res://test"];
    let configPath: string | undefined;
    try {
      const gutConfig = path.join(proj, ".gutconfig.json");
      await access(gutConfig);
      const raw = JSON.parse(await readFile(gutConfig, "utf-8")) as Record<string, unknown>;
      configPath = gutConfig;
      if (raw.dirs && Array.isArray(raw.dirs)) {
        return { framework: "gut", test_directories: raw.dirs as string[], config_path: configPath };
      }
    } catch {
      // no config file
    }
    return { framework: "gut", test_directories: testDirs, config_path: configPath };
  } catch {
    // not GUT
  }

  // Check for GdUnit4
  try {
    await access(path.join(proj, "addons", "gdUnit4"));
    return { framework: "gdunit4", test_directories: ["res://test", "res://tests"] };
  } catch {
    // not GdUnit4
  }

  return { framework: "builtin", test_directories: ["res://tests", "res://test"] };
}

async function findGdFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  let names: string[];
  try {
    names = await readdir(dir) as string[];
  } catch {
    return files;
  }
  for (const name of names) {
    const full = path.join(dir, name);
    try {
      const s = await stat(full);
      if (s.isDirectory()) {
        files.push(...(await findGdFiles(full)));
      } else if (s.isFile() && name.endsWith(".gd") &&
                 (name.startsWith("test_") || name.endsWith("_test.gd"))) {
        files.push(full);
      }
    } catch {
      // skip unreadable entries
    }
  }
  return files;
}

async function extractTestMethods(filePath: string): Promise<{ methods: string[]; extends: string }> {
  const content = await readFile(filePath, "utf-8");
  const methods: string[] = [];
  let extendsClass = "";
  for (const line of content.split("\n")) {
    const extMatch = line.match(/^extends\s+(\S+)/);
    if (extMatch) extendsClass = extMatch[1];
    const methMatch = line.match(/^func\s+(test_\w+)\s*\(/);
    if (methMatch) methods.push(methMatch[1]);
  }
  return { methods, extends: extendsClass };
}

// --- GUT output parser ---
interface TestResult {
  name: string;
  suite: string;
  status: "passed" | "failed" | "error" | "skipped";
  message?: string;
  duration_ms?: number;
}

interface RunResults {
  framework: string;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  duration_ms: number;
  tests: TestResult[];
  raw_output: string;
}

function parseGutOutput(output: string): Omit<RunResults, "framework" | "raw_output"> {
  const tests: TestResult[] = [];
  let passed = 0;
  let failed = 0;
  let errors = 0;
  let skipped = 0;
  let duration_ms = 0;

  for (const line of output.split("\n")) {
    // Individual test result lines (GUT 9.x): "   [PASS]  test_something" or "   [FAIL]  test_something"
    const passLine = line.match(/\[PASS\]\s+(test_\w+)/);
    if (passLine) {
      tests.push({ name: passLine[1], suite: "", status: "passed" });
      continue;
    }
    const failLine = line.match(/\[FAIL\]\s+(test_\w+)/);
    if (failLine) {
      tests.push({ name: failLine[1], suite: "", status: "failed" });
      continue;
    }
    // Per-line summary fields: "Passed:  40", "Failed:  0", etc.
    const passedLine = line.match(/^\s*Passed:\s*(\d+)/i);
    if (passedLine) { passed = parseInt(passedLine[1]); continue; }
    const failedLine = line.match(/^\s*Failed:\s*(\d+)/i);
    if (failedLine) { failed = parseInt(failedLine[1]); continue; }
    const errorsLine = line.match(/^\s*Errors:\s*(\d+)/i);
    if (errorsLine) { errors = parseInt(errorsLine[1]); continue; }
    const skippedLine = line.match(/^\s*Skipped:\s*(\d+)/i);
    if (skippedLine) { skipped = parseInt(skippedLine[1]); continue; }
    // Duration: "Elapsed:  1.37s" or "Total time: 0.42s"
    const timeMatch = line.match(/(?:Elapsed|Total time):\s*([\d.]+)s/i);
    if (timeMatch) { duration_ms = Math.round(parseFloat(timeMatch[1]) * 1000); continue; }
  }

  // Fallback: if summary counts not found but individual test lines were parsed, derive from them
  if (passed === 0 && failed === 0 && tests.length > 0) {
    passed = tests.filter(t => t.status === "passed").length;
    failed = tests.filter(t => t.status === "failed").length;
  }

  return { passed, failed, errors, skipped, duration_ms, tests };
}

function parseGdUnit4Output(output: string): Omit<RunResults, "framework" | "raw_output"> {
  const tests: TestResult[] = [];
  let passed = 0;
  let failed = 0;
  let errors = 0;
  const skipped = 0;
  const duration_ms = 0;

  for (const line of output.split("\n")) {
    // GdUnit4 format: "[PASSED] suite_name.test_method"
    const passLine = line.match(/\[PASSED\]\s+(\S+)\.(\w+)/);
    if (passLine) {
      passed++;
      tests.push({ name: passLine[2], suite: passLine[1], status: "passed" });
      continue;
    }
    const failLine = line.match(/\[FAILED\]\s+(\S+)\.(\w+)/);
    if (failLine) {
      failed++;
      tests.push({ name: failLine[2], suite: failLine[1], status: "failed" });
      continue;
    }
    const errorLine = line.match(/\[ERROR\]\s+(\S+)\.(\w+)/);
    if (errorLine) {
      errors++;
      tests.push({ name: errorLine[2], suite: errorLine[1], status: "error" });
      continue;
    }
    // Summary
    const summary = line.match(/(\d+) tests? passed.*?(\d+) tests? failed/i);
    if (summary) {
      passed = parseInt(summary[1]);
      failed = parseInt(summary[2]);
    }
  }

  return { passed, failed, errors, skipped, duration_ms, tests };
}

function parseBuiltinOutput(output: string): Omit<RunResults, "framework" | "raw_output"> {
  const empty = { passed: 0, failed: 0, errors: 0, skipped: 0, duration_ms: 0, tests: [] as TestResult[] };
  // Find the JSON line (last non-empty line from print())
  const lines = output.split("\n").map(l => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith("{")) {
      try {
        const parsed = JSON.parse(lines[i]) as RunResults;
        return {
          passed: parsed.passed ?? 0,
          failed: parsed.failed ?? 0,
          errors: parsed.errors ?? 0,
          skipped: parsed.skipped ?? 0,
          duration_ms: parsed.duration_ms ?? 0,
          tests: parsed.tests ?? [],
        };
      } catch {
        break;
      }
    }
  }
  return empty;
}

function generateTestContent(
  framework: Framework,
  className: string,
  sourceFileName: string,
  methods: string[]
): string {
  const methodStubs = methods
    .filter(m => !m.startsWith("_") && m !== "test_")
    .map(m => `func test_${m}() -> void:\n\tpass # TODO: implement`)
    .join("\n\n");

  if (framework === "gut") {
    return [
      `extends GutTest`,
      ``,
      `# Tests for ${sourceFileName}`,
      ``,
      `func before_each() -> void:`,
      `\tpass`,
      ``,
      `func after_each() -> void:`,
      `\tpass`,
      ``,
      methodStubs || `func test_example() -> void:\n\tassert_eq(1, 1)`,
    ].join("\n") + "\n";
  }

  if (framework === "gdunit4") {
    return [
      `extends GdUnitTestSuite`,
      ``,
      `# Tests for ${sourceFileName}`,
      ``,
      `func before() -> void:`,
      `\tpass`,
      ``,
      `func after() -> void:`,
      `\tpass`,
      ``,
      methodStubs || `func test_example() -> void:\n\tassert_that(true).is_true()`,
    ].join("\n") + "\n";
  }

  // builtin
  return [
    `extends RefCounted`,
    ``,
    `# Tests for ${sourceFileName}`,
    `# Run with: godot --headless --path <project> -s <mcp_runner>`,
    ``,
    `func before_all() -> void:`,
    `\tpass`,
    ``,
    `func before_each() -> void:`,
    `\tpass`,
    ``,
    `func after_each() -> void:`,
    `\tpass`,
    ``,
    `func after_all() -> void:`,
    `\tpass`,
    ``,
    methodStubs || `func test_example() -> void:\n\tassert(true)`,
  ].join("\n") + "\n";
}

export function registerTestTools(
  server: McpServer,
  godotPath: () => Promise<string>
): void {
  server.tool(
    "godot_detect_test_framework",
    "Detect which GDScript test framework (GUT, GdUnit4, or built-in) is installed in a Godot project",
    {
      project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
    },
    async ({ project_path }) => {
      try {
        const projectDir = resolveProjectPath(project_path);
        const result = await detectFramework(projectDir);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e: unknown) {
        return {
          content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "godot_list_tests",
    "List all GDScript test files and their test methods in a Godot project",
    {
      project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
      directory: z
        .string()
        .optional()
        .describe('Specific directory to scan (e.g. "res://tests"). Defaults to framework-detected directories.'),
    },
    async ({ project_path, directory }) => {
      try {
        const projectDir = resolveProjectPath(project_path);
        let scanDirs: string[];

        if (directory) {
          scanDirs = [directory];
        } else {
          const detected = await detectFramework(projectDir);
          scanDirs = detected.test_directories;
        }

        const testFiles: Array<{ path: string; methods: string[]; extends: string }> = [];

        for (const dir of scanDirs) {
          const absDir = resolveResPath(projectDir, dir.startsWith("res://") ? dir : `res://${dir}`);
          const files = await findGdFiles(absDir);
          for (const f of files) {
            const { methods, extends: ext } = await extractTestMethods(f);
            if (methods.length > 0) {
              testFiles.push({
                path: resPathFromAbsolute(projectDir, f),
                methods,
                extends: ext,
              });
            }
          }
        }

        return {
          content: [{ type: "text", text: JSON.stringify({ test_files: testFiles }, null, 2) }],
        };
      } catch (e: unknown) {
        return {
          content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "godot_create_test",
    "Generate a GDScript test file skeleton for a given source script, following the project's test framework conventions",
    {
      project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
      source_script: z
        .string()
        .describe('Source script to test, e.g. "res://src/player.gd"'),
      test_path: z
        .string()
        .optional()
        .describe("Output path for the test file (auto-generated if omitted)"),
      framework: z
        .enum(["gut", "gdunit4", "builtin"])
        .optional()
        .describe("Force a specific framework instead of auto-detecting"),
    },
    async ({ project_path, source_script, test_path, framework }) => {
      try {
        const projectDir = resolveProjectPath(project_path);
        const detected = await detectFramework(projectDir);
        const fw: Framework = framework ?? detected.framework;

        const sourceAbs = resolveResPath(projectDir, source_script);
        const sourceFile = path.basename(sourceAbs, ".gd");

        // Extract public methods from source (non-underscore, non-lifecycle)
        const sourceMethods: string[] = [];
        try {
          const src = await readFile(sourceAbs, "utf-8");
          for (const line of src.split("\n")) {
            const m = line.match(/^func\s+([a-zA-Z]\w*)\s*\(/);
            if (m && !m[1].startsWith("_")) sourceMethods.push(m[1]);
          }
        } catch {
          // source script might not exist yet — generate empty stubs
        }

        // Determine test file path
        let outPath: string;
        if (test_path) {
          outPath = resolveResPath(projectDir, test_path);
        } else {
          const testDir = detected.test_directories[0] ?? "res://tests";
          const testDirAbs = resolveResPath(projectDir, testDir);
          const prefix = fw === "gdunit4" ? "" : "test_";
          const suffix = fw === "gdunit4" ? "_test" : "";
          outPath = path.join(testDirAbs, `${prefix}${sourceFile}${suffix}.gd`);
        }

        const content = generateTestContent(fw, sourceFile, source_script, sourceMethods);

        await mkdir(path.dirname(outPath), { recursive: true });
        await writeFile(outPath, content, "utf-8");

        const resOut = resPathFromAbsolute(projectDir, outPath);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ path: resOut, framework: fw, content }, null, 2),
            },
          ],
        };
      } catch (e: unknown) {
        return {
          content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "godot_run_tests",
    "Run GDScript tests headlessly and return results. Auto-detects GUT or GdUnit4, or uses the built-in runner.",
    {
      project_path: z.string().optional().describe("Path to the Godot project directory (auto-detected if omitted)"),
      path_filter: z
        .string()
        .optional()
        .describe('Run tests only in this directory or file, e.g. "res://tests/test_player.gd"'),
      test_filter: z
        .string()
        .optional()
        .describe("Filter tests by method name substring (built-in runner only)"),
      test_method: z
        .string()
        .optional()
        .describe("Run only this specific test method (exact name match)"),
      framework: z
        .enum(["gut", "gdunit4", "builtin"])
        .optional()
        .describe("Force a specific framework instead of auto-detecting"),
      timeout: z
        .number()
        .optional()
        .describe("Timeout in seconds (default: 60)"),
    },
    async ({ project_path, path_filter, test_filter, test_method, framework, timeout }) => {
      try {
        const projectDir = resolveProjectPath(project_path);
        const gp = await godotPath();
        const proj = projectDir;
        const timeoutMs = (timeout ?? 60) * 1000;

        const detected = await detectFramework(projectDir);
        const fw: Framework = framework ?? detected.framework;

        let args: string[];
        let raw = "";

        if (fw === "gut") {
          if (test_filter) {
            return {
              content: [{ type: "text", text: "Error: test_filter is not supported for GUT. Use path_filter to run a specific test file (e.g. path_filter: \"res://tests/test_player.gd\"). test_filter is only supported with the built-in runner." }],
              isError: true,
            };
          }
          const dir = path_filter ?? detected.test_directories[0] ?? "res://tests";
          args = [
            "--headless",
            "--path", proj,
            "-s", "addons/gut/gut_cmdln.gd",
            `-gdir=${dir}`,
            "-ginclude_subdirs",
            "-gexit",
            "-glog=2",
          ];
          if (test_method) args.push(`-gtest=${test_method}`);
        } else if (fw === "gdunit4") {
          const target = path_filter ?? detected.test_directories[0] ?? "res://test";
          args = [
            "--headless",
            "--path", proj,
            "-s", "addons/gdUnit4/bin/GdUnitCmdTool.gd",
            "--add", target,
          ];
        } else {
          // builtin
          const runnerPath = getBuiltinRunnerPath();
          const testDir = path_filter ?? detected.test_directories[0] ?? "res://tests";
          const userArgs = [`--test-dir=${testDir}`];
          if (test_filter) userArgs.push(`--test-filter=${test_filter}`);
          if (test_method) userArgs.push(`--test-method=${test_method}`);
          args = [
            "--headless",
            "--path", proj,
            "-s", runnerPath,
            "--", ...userArgs,
          ];
        }

        try {
          const { stdout, stderr } = await execFileAsync(gp, args, { timeout: timeoutMs });
          raw = cleanOutput((stdout + "\n" + stderr).trim());
        } catch (e: unknown) {
          const err = e as Error & { stdout?: string; stderr?: string };
          raw = cleanOutput(((err.stdout ?? "") + "\n" + (err.stderr ?? "")).trim());
          // A non-zero exit code from the test runner just means tests failed — don't throw
        }

        let parsed: Omit<RunResults, "framework" | "raw_output">;
        if (fw === "gut") {
          parsed = parseGutOutput(raw);
        } else if (fw === "gdunit4") {
          parsed = parseGdUnit4Output(raw);
        } else {
          parsed = parseBuiltinOutput(raw);
        }

        const result: RunResults = { framework: fw, raw_output: raw, ...parsed };

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.failed > 0 || result.errors > 0,
        };
      } catch (e: unknown) {
        return {
          content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}

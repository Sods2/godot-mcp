import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export interface ResolvedScriptRoot {
  /** res:// path of the script to attach to the root node. */
  scriptPath: string;
  /** Native engine class the script ultimately extends (used for type=). */
  baseType: string;
}

const SKIP_DIRS = new Set([".godot", ".git", "node_modules", ".import"]);

async function listGdFiles(dir: string, out: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  if (!Array.isArray(entries)) return out;
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) await listGdFiles(path.join(dir, e.name), out);
    } else if (e.name.endsWith(".gd")) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

function toResPath(projectDir: string, abs: string): string {
  return "res://" + path.relative(projectDir, abs).split(path.sep).join("/");
}

function toAbsPath(projectDir: string, resPath: string): string {
  return path.join(projectDir, resPath.replace(/^res:\/\//, ""));
}

/** Parse `class_name` and `extends` from GDScript source (Godot 4 syntax). */
export function parseScriptHeader(src: string): { className?: string; extendsName?: string } {
  const result: { className?: string; extendsName?: string } = {};
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line || line.startsWith("@")) {
      // annotations like @tool may share a line with class_name/extends
      const rest = line.replace(/^(@\w+(\([^)]*\))?\s*)+/, "");
      if (!rest) continue;
      parseLine(rest, result);
      continue;
    }
    parseLine(line, result);
  }
  return result;
}

function parseLine(line: string, result: { className?: string; extendsName?: string }): void {
  const cn = line.match(/^class_name\s+([A-Za-z_]\w*)(?:\s+extends\s+(.+))?/);
  if (cn) {
    result.className ??= cn[1];
    if (cn[2] && !result.extendsName) result.extendsName = cn[2].trim();
    return;
  }
  const ex = line.match(/^extends\s+(.+)/);
  if (ex && !result.extendsName) result.extendsName = ex[1].trim();
}

/**
 * If `rootType` names a GDScript (a res:// .gd path or a project class_name),
 * return the script path and the native base type to write as type=.
 * Returns null when `rootType` is not a project script (i.e. a native class).
 */
export async function resolveScriptRoot(
  projectDir: string,
  rootType: string
): Promise<ResolvedScriptRoot | null> {
  const files = await listGdFiles(projectDir);
  const headers = new Map<string, { className?: string; extendsName?: string }>();
  const byClass = new Map<string, string>(); // class_name -> abs path
  for (const f of files) {
    try {
      const h = parseScriptHeader(await readFile(f, "utf-8"));
      headers.set(f, h);
      if (h.className && !byClass.has(h.className)) byClass.set(h.className, f);
    } catch {
      /* unreadable file: ignore */
    }
  }

  let start: string | undefined;
  if (/\.gd$/i.test(rootType)) {
    start = toAbsPath(projectDir, rootType);
    if (!headers.has(start)) {
      throw new Error(`Script not found: ${rootType}`);
    }
  } else {
    start = byClass.get(rootType);
    if (!start) return null;
  }

  // Walk the extends chain until we reach a native class.
  let cur = start;
  const seen = new Set<string>();
  for (;;) {
    if (seen.has(cur)) throw new Error(`Cyclic extends chain starting at ${toResPath(projectDir, start)}`);
    seen.add(cur);
    const ext = headers.get(cur)?.extendsName;
    if (!ext) {
      throw new Error(
        `${toResPath(projectDir, cur)} has no 'extends'; a scene root script must extend a Node type`
      );
    }
    const quoted = ext.match(/^["'](.+)["']$/);
    if (quoted) {
      const next = toAbsPath(projectDir, quoted[1]);
      if (!headers.has(next)) throw new Error(`extends target not found: ${quoted[1]}`);
      cur = next;
      continue;
    }
    const name = ext.split(".")[0];
    const next = byClass.get(name);
    if (next) {
      cur = next;
      continue;
    }
    return { scriptPath: toResPath(projectDir, start), baseType: name };
  }
}

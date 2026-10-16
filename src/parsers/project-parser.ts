import { parseProperties, scanValueLine, splitSections } from "./section-io.js";

export interface GodotProjectConfig {
  name: string;
  description?: string;
  version?: string;
  features?: string[];
  mainScene?: string;
  icon?: string;
  /** Comments and top-level keys (e.g. config_version) before the first [section]. */
  preamble: string;
  rawSections: Record<string, Record<string, string>>;
}

function unquote(val: string): string {
  return val.replace(/^"(.*)"$/, "$1");
}

/**
 * Split off everything before the first top-level `[section]` header so
 * comments and `config_version=N` are not stuffed into an empty-named section
 * (which previously serialized as `[]` and wiped the header).
 */
function splitPreamble(content: string): { preamble: string; rest: string } {
  const lines = content.split("\n");
  let depth = 0;
  let inString = false;
  let preambleEnd = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const atTopLevel = depth <= 0 && !inString;
    if (atTopLevel && /^\[.+\]$/.test(trimmed)) {
      preambleEnd = i;
      break;
    }
    const scan = scanValueLine(line, inString);
    depth += scan.depth;
    inString = scan.inString;
  }

  const preamble = lines.slice(0, preambleEnd).join("\n");
  const rest = lines.slice(preambleEnd).join("\n");
  return { preamble, rest };
}

export function parseProjectConfig(content: string): GodotProjectConfig {
  const { preamble, rest } = splitPreamble(content);
  const rawSections: Record<string, Record<string, string>> = {};

  for (const section of splitSections(rest)) {
    // Headers in project.godot are plain `[name]` (no attributes).
    const name = section.header.replace(/^\s*\[/, "").replace(/\]\s*$/, "");
    if (!name) continue;
    rawSections[name] = parseProperties(section.body);
  }

  const app = rawSections["application"] || {};

  const name = app["config/name"] ? unquote(app["config/name"]) : "Untitled";

  const description = app["config/description"]
    ? unquote(app["config/description"])
    : undefined;

  const version = app["config/version"]
    ? unquote(app["config/version"])
    : undefined;

  const mainScene = app["run/main_scene"]
    ? unquote(app["run/main_scene"])
    : undefined;

  const icon = app["config/icon"] ? unquote(app["config/icon"]) : undefined;

  let features: string[] | undefined;
  const featuresVal = app["config/features"];
  if (featuresVal) {
    const featuresMatch = featuresVal.match(/PackedStringArray\(([^)]*)\)/);
    if (featuresMatch) {
      features = featuresMatch[1]
        .split(",")
        .map((f) => f.trim().replace(/^"(.*)"$/, "$1"))
        .filter(Boolean);
    }
  }

  return {
    name,
    description,
    version,
    features,
    mainScene,
    icon,
    preamble,
    rawSections,
  };
}

/**
 * Serialize rawSections back to project.godot text.
 * Multi-line values (e.g. `[input]` action `{ ... }` blocks) are emitted
 * intact because they are stored with embedded newlines.
 */
export function serializeProjectConfig(
  rawSections: Record<string, Record<string, string>>,
  preamble: string = ""
): string {
  const lines: string[] = [];

  for (const [section, entries] of Object.entries(rawSections)) {
    // Never emit a bare `[]` — that was the corruption symptom when
    // config_version landed in an empty-named section.
    if (!section) continue;
    lines.push(`[${section}]`);
    lines.push(""); // Godot leaves a blank line after each [section] header
    for (const [key, value] of Object.entries(entries)) {
      lines.push(`${key}=${value}`);
    }
    lines.push("");
  }

  const body = lines.join("\n");
  if (!preamble) return body;

  // Keep a single trailing newline on the preamble, then a blank line before
  // the first section (Godot's usual layout).
  let head = preamble.replace(/\s+$/, "");
  return `${head}\n\n${body}`;
}

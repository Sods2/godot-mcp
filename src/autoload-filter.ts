export const AUTOLOAD_WARNING_NOTE = "autoload, not registered in headless mode";

/** Extract autoload names from the [autoload] section of a project.godot file. */
export function parseAutoloadNames(projectGodot: string): string[] {
  const names: string[] = [];
  let inSection = false;
  for (const line of projectGodot.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(";")) continue;
    const section = trimmed.match(/^\[(.+)\]$/);
    if (section) {
      inSection = section[1] === "autoload";
      continue;
    }
    if (!inSection) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq).trim();
    if (name) names.push(name);
  }
  return names;
}

export interface AutoloadFilterResult {
  output: string;
  /** Number of errors downgraded to warnings. */
  downgraded: number;
  /** True if error indicators remain after downgrading. */
  hasErrors: boolean;
}

const ERROR_PREFIX = /^\s*(?:SCRIPT ERROR|ERROR):\s*(?:Parse Error:\s*)?/i;
const NOT_FOUND = /Identifier not found:\s*([A-Za-z_]\w*)\s*$/;
const NOT_DECLARED = /Identifier "([A-Za-z_]\w*)" not declared in the current scope/;
const ERROR_INDICATOR = /SCRIPT ERROR|Parse Error|FATAL:|ERROR:/i;

/**
 * Downgrade "Identifier not found: X" / "Identifier "X" not declared" errors to
 * warnings when X is a registered autoload (headless --check-only does not
 * register autoloads). All other lines are left untouched.
 */
export function filterAutoloadErrors(output: string, autoloads: string[]): AutoloadFilterResult {
  const known = new Set(autoloads);
  let downgraded = 0;
  const lines = output.split("\n").map((line) => {
    if (!ERROR_PREFIX.test(line)) return line;
    const name = (line.match(NOT_FOUND) ?? line.match(NOT_DECLARED))?.[1];
    if (!name || !known.has(name)) return line;
    downgraded++;
    return `WARNING: ${line.replace(ERROR_PREFIX, "")} (${AUTOLOAD_WARNING_NOTE})`;
  });
  const result = lines.join("\n");
  return { output: result, downgraded, hasErrors: ERROR_INDICATOR.test(result) };
}

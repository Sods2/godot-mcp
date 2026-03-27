export interface GodotProjectConfig {
  name: string;
  description?: string;
  version?: string;
  features?: string[];
  mainScene?: string;
  icon?: string;
  rawSections: Record<string, Record<string, string>>;
}

function unquote(val: string): string {
  return val.replace(/^"(.*)"$/, "$1");
}

export function parseProjectConfig(content: string): GodotProjectConfig {
  const rawSections: Record<string, Record<string, string>> = {};
  let currentSection = "";

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(";")) continue;

    const sectionMatch = trimmed.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!rawSections[currentSection]) {
        rawSections[currentSection] = {};
      }
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!rawSections[currentSection]) {
      rawSections[currentSection] = {};
    }
    rawSections[currentSection][key] = value;
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

  const icon = app["config/icon"]
    ? unquote(app["config/icon"])
    : undefined;

  let features: string[] | undefined;
  const featuresVal = app["config/features"];
  if (featuresVal) {
    const featuresMatch = featuresVal.match(
      /PackedStringArray\(([^)]*)\)/
    );
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
    rawSections,
  };
}

export function serializeProjectConfig(
  rawSections: Record<string, Record<string, string>>
): string {
  const lines: string[] = [];
  for (const [section, entries] of Object.entries(rawSections)) {
    lines.push(`[${section}]`);
    for (const [key, value] of Object.entries(entries)) {
      lines.push(`${key}=${value}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

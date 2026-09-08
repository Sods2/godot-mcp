import type { SubResource } from "./tscn-parser.js";
import {
  collectExtraAttrs,
  parseAttrs,
  serializeExtraAttrs,
} from "./section-attrs.js";

const RESOURCE_HEADER_ATTRS: ReadonlySet<string> = new Set([
  "type",
  "load_steps",
  "format",
]);

export interface TresResource {
  header: {
    type: string;
    /** Only set when the source file had it — Godot 4.6+ no longer writes it. */
    loadSteps?: number;
    format: number;
    extraAttrs?: Record<string, string>;
  };
  subResources: SubResource[];
  resource: Record<string, string>;
}

function parseProperties(body: string): Record<string, string> {
  const props: Record<string, string> = {};
  if (!body) return props;

  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(";")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    props[key] = value;
  }
  return props;
}

function splitSections(
  content: string
): Array<{ header: string; body: string }> {
  const sections: Array<{ header: string; body: string }> = [];
  const lines = content.split("\n");
  let currentHeader = "";
  let currentBody: string[] = [];

  for (const line of lines) {
    if (line.startsWith("[") && line.endsWith("]")) {
      if (currentHeader) {
        sections.push({
          header: currentHeader,
          body: currentBody.join("\n").trim(),
        });
      }
      currentHeader = line;
      currentBody = [];
    } else if (currentHeader) {
      currentBody.push(line);
    }
  }

  if (currentHeader) {
    sections.push({
      header: currentHeader,
      body: currentBody.join("\n").trim(),
    });
  }

  return sections;
}

export class TresParser {
  parse(content: string): TresResource {
    const resource: TresResource = {
      header: { type: "", format: 3 },
      subResources: [],
      resource: {},
    };

    const sections = splitSections(content);

    for (const section of sections) {
      const headerMatch = section.header.match(/^\[(\w+)(.*)\]$/);
      if (!headerMatch) continue;

      const tag = headerMatch[1];
      const { values: attrs, raw } = parseAttrs(headerMatch[2]);
      const props = parseProperties(section.body);

      switch (tag) {
        case "gd_resource": {
          resource.header.type = attrs.type || "";
          // Godot 4.6+ omits load_steps; only round-trip it if it was there.
          if (attrs.load_steps !== undefined) {
            resource.header.loadSteps = parseInt(attrs.load_steps, 10);
          }
          resource.header.format = parseInt(attrs.format || "3", 10);
          const headerExtra = collectExtraAttrs(raw, RESOURCE_HEADER_ATTRS);
          if (headerExtra) resource.header.extraAttrs = headerExtra;
          break;
        }
        case "sub_resource": {
          resource.subResources.push({
            type: attrs.type || "",
            id: attrs.id || "",
            properties: props,
          });
          break;
        }
        case "resource": {
          resource.resource = props;
          break;
        }
      }
    }

    return resource;
  }

  serialize(resource: TresResource): string {
    const lines: string[] = [];

    let header = `[gd_resource type="${resource.header.type}"`;
    if (resource.header.loadSteps !== undefined) {
      header += ` load_steps=${resource.subResources.length + 1}`;
    }
    header += ` format=${resource.header.format}`;
    header += serializeExtraAttrs(resource.header.extraAttrs);
    header += "]";
    lines.push(header);

    for (const sub of resource.subResources) {
      lines.push("");
      lines.push(`[sub_resource type="${sub.type}" id="${sub.id}"]`);
      for (const [key, val] of Object.entries(sub.properties)) {
        lines.push(`${key} = ${val}`);
      }
    }

    if (Object.keys(resource.resource).length > 0) {
      lines.push("");
      lines.push("[resource]");
      for (const [key, val] of Object.entries(resource.resource)) {
        lines.push(`${key} = ${val}`);
      }
    }

    lines.push("");
    return lines.join("\n");
  }
}

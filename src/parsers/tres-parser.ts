import type { SubResource } from "./tscn-parser.js";

export interface TresResource {
  header: { type: string; loadSteps: number; format: number };
  subResources: SubResource[];
  resource: Record<string, string>;
}

function parseHeaderAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w+)=("(?:[^"\\]|\\.)*"|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) {
    let val = m[2];
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    attrs[m[1]] = val;
  }
  return attrs;
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
      header: { type: "", loadSteps: 1, format: 3 },
      subResources: [],
      resource: {},
    };

    const sections = splitSections(content);

    for (const section of sections) {
      const headerMatch = section.header.match(/^\[(\w+)(.*)\]$/);
      if (!headerMatch) continue;

      const tag = headerMatch[1];
      const attrs = parseHeaderAttrs(headerMatch[2]);
      const props = parseProperties(section.body);

      switch (tag) {
        case "gd_resource": {
          resource.header.type = attrs.type || "";
          resource.header.loadSteps = parseInt(attrs.load_steps || "1", 10);
          resource.header.format = parseInt(attrs.format || "3", 10);
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
    const loadSteps = resource.subResources.length + 1;

    lines.push(
      `[gd_resource type="${resource.header.type}" load_steps=${loadSteps} format=${resource.header.format}]`
    );

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

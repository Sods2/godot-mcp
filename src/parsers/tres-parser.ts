import {
  serializeSubResource,
  type ExtResource,
  type SubResource,
} from "./tscn-parser.js";
import {
  collectExtraAttrs,
  parseAttrs,
  serializeAttrs,
} from "./section-attrs.js";
import { parseProperties, splitSections } from "./section-io.js";

const RESOURCE_HEADER_ATTRS: ReadonlySet<string> = new Set([
  "type",
  "load_steps",
  "format",
]);
const EXT_RESOURCE_ATTRS: ReadonlySet<string> = new Set([
  "type",
  "path",
  "id",
  "uid",
]);
const SUB_RESOURCE_ATTRS: ReadonlySet<string> = new Set(["type", "id"]);

export interface TresResource {
  header: {
    type: string;
    /** Only set when the source file had it — Godot 4.6+ no longer writes it. */
    loadSteps?: number;
    format: number;
    extraAttrs?: Record<string, string>;
    /** Attribute order as written in the source file. */
    attrOrder?: string[];
  };
  /**
   * `[ext_resource]` sections. Dropping these orphans every `ExtResource("id")`
   * reference in the body, so a re-serialized resource would fail to load.
   */
  extResources: ExtResource[];
  subResources: SubResource[];
  resource: Record<string, string>;
}

export class TresParser {
  parse(content: string): TresResource {
    const resource: TresResource = {
      header: { type: "", format: 3 },
      extResources: [],
      subResources: [],
      resource: {},
    };

    const sections = splitSections(content);

    for (const section of sections) {
      const headerMatch = section.header.match(/^\[(\w+)(.*)\]$/);
      if (!headerMatch) continue;

      const tag = headerMatch[1];
      const { values: attrs, raw } = parseAttrs(headerMatch[2]);
      const attrOrder = Object.keys(raw);
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
          resource.header.attrOrder = attrOrder;
          break;
        }
        case "ext_resource": {
          const ext: ExtResource = {
            type: attrs.type || "",
            path: attrs.path || "",
            id: attrs.id || "",
          };
          if (attrs.uid) ext.uid = attrs.uid;
          const extExtra = collectExtraAttrs(raw, EXT_RESOURCE_ATTRS);
          if (extExtra) ext.extraAttrs = extExtra;
          ext.attrOrder = attrOrder;
          resource.extResources.push(ext);
          break;
        }
        case "sub_resource": {
          const sub: SubResource = {
            type: attrs.type || "",
            id: attrs.id || "",
            properties: props,
          };
          const subExtra = collectExtraAttrs(raw, SUB_RESOURCE_ATTRS);
          if (subExtra) sub.extraAttrs = subExtra;
          sub.attrOrder = attrOrder;
          resource.subResources.push(sub);
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

    lines.push(
      "[gd_resource" +
        serializeAttrs(
          [
            ["type", `"${resource.header.type}"`],
            // Godot 4.6+ omits load_steps; write back exactly what the source
            // had rather than recomputing (see the .tscn serializer).
            [
              "load_steps",
              resource.header.loadSteps !== undefined
                ? `${resource.header.loadSteps}`
                : undefined,
            ],
            ["format", `${resource.header.format}`],
          ],
          resource.header.extraAttrs,
          resource.header.attrOrder
        ) +
        "]"
    );

    if (resource.extResources.length > 0) {
      lines.push("");
      for (const ext of resource.extResources) {
        lines.push(
          "[ext_resource" +
            serializeAttrs(
              [
                ["type", `"${ext.type}"`],
                ["path", `"${ext.path}"`],
                ["id", `"${ext.id}"`],
                ["uid", ext.uid ? `"${ext.uid}"` : undefined],
              ],
              ext.extraAttrs,
              ext.attrOrder
            ) +
            "]"
        );
      }
    }

    for (const sub of resource.subResources) {
      lines.push("");
      lines.push(serializeSubResource(sub));
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

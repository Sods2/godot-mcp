import {
  collectExtraAttrs,
  parseAttrs,
  serializeAttrs,
} from "./section-attrs.js";
import { parseProperties, splitSections } from "./section-io.js";

const SCENE_HEADER_ATTRS: ReadonlySet<string> = new Set([
  "load_steps",
  "format",
  "uid",
]);
const EXT_RESOURCE_ATTRS: ReadonlySet<string> = new Set([
  "type",
  "path",
  "id",
  "uid",
]);
const SUB_RESOURCE_ATTRS: ReadonlySet<string> = new Set(["type", "id"]);
const NODE_ATTRS: ReadonlySet<string> = new Set([
  "name",
  "type",
  "parent",
  "instance",
]);
const CONNECTION_ATTRS: ReadonlySet<string> = new Set([
  "signal",
  "from",
  "to",
  "method",
  "flags",
  "binds",
  "unbinds",
]);

export interface TscnHeader {
  /** Only set when the source file had it — Godot 4.6+ no longer writes it. */
  loadSteps?: number;
  format: number;
  uid?: string;
  extraAttrs?: Record<string, string>;
  /** Attribute order as written in the source file. */
  attrOrder?: string[];
}

export interface ExtResource {
  type: string;
  path: string;
  id: string;
  uid?: string;
  extraAttrs?: Record<string, string>;
  /** Attribute order as written in the source file. */
  attrOrder?: string[];
}

export interface SubResource {
  type: string;
  id: string;
  properties: Record<string, string>;
  extraAttrs?: Record<string, string>;
  /** Attribute order as written in the source file. */
  attrOrder?: string[];
}

export interface SceneNode {
  name: string;
  type?: string;
  parent?: string;
  instance?: string;
  properties: Record<string, string>;
  /**
   * Attributes with no dedicated field, preserved verbatim: `unique_id`,
   * `parent_id_path`, `owner_uid_path` (Godot 4.6+), plus `groups`, `index`,
   * `owner`, `node_paths` and `instance_placeholder`.
   */
  extraAttrs?: Record<string, string>;
  /** Attribute order as written in the source file. */
  attrOrder?: string[];
}

export interface Connection {
  signal: string;
  from: string;
  to: string;
  method: string;
  flags?: number;
  binds?: string;
  unbinds?: number;
  /** Preserved verbatim: `from_uid_path` / `to_uid_path` (Godot 4.6+). */
  extraAttrs?: Record<string, string>;
  /** Attribute order as written in the source file. */
  attrOrder?: string[];
}

export interface TscnScene {
  header: TscnHeader;
  extResources: ExtResource[];
  subResources: SubResource[];
  nodes: SceneNode[];
  connections: Connection[];
  /** Node paths from `[editable path="..."]` sections. */
  editables: string[];
}

export function serializeSubResource(sub: SubResource): string {
  return (
    "[sub_resource" +
    serializeAttrs(
      [
        ["type", `"${sub.type}"`],
        ["id", `"${sub.id}"`],
      ],
      sub.extraAttrs,
      sub.attrOrder
    ) +
    "]"
  );
}

function randomHex(len: number): string {
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}

export class TscnParser {
  parse(content: string): TscnScene {
    const scene: TscnScene = {
      header: { format: 3 },
      extResources: [],
      subResources: [],
      nodes: [],
      connections: [],
      editables: [],
    };

    const sections = splitSections(content);

    for (const section of sections) {
      const headerMatch = section.header.match(/^\[(\w+)(.*)\]$/);
      if (!headerMatch) continue;

      const tag = headerMatch[1];
      const attrStr = headerMatch[2];
      const { values: attrs, raw } = parseAttrs(attrStr);
      const attrOrder = Object.keys(raw);
      const props = parseProperties(section.body);

      switch (tag) {
        case "gd_scene": {
          scene.header.format = parseInt(attrs.format || "3", 10);
          // Godot 4.6+ omits load_steps; only round-trip it if it was there.
          if (attrs.load_steps !== undefined) {
            scene.header.loadSteps = parseInt(attrs.load_steps, 10);
          }
          if (attrs.uid) scene.header.uid = attrs.uid;
          const headerExtra = collectExtraAttrs(raw, SCENE_HEADER_ATTRS);
          if (headerExtra) scene.header.extraAttrs = headerExtra;
          scene.header.attrOrder = attrOrder;
          break;
        }
        case "ext_resource": {
          const ext: ExtResource = {
            type: attrs.type || "",
            path: attrs.path || "",
            id: attrs.id || "",
          };
          if (attrs.uid) ext.uid = attrs.uid;
          const extra = collectExtraAttrs(raw, EXT_RESOURCE_ATTRS);
          if (extra) ext.extraAttrs = extra;
          ext.attrOrder = attrOrder;
          scene.extResources.push(ext);
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
          scene.subResources.push(sub);
          break;
        }
        case "node": {
          const node: SceneNode = {
            name: attrs.name || "",
            properties: props,
          };
          if (attrs.type) node.type = attrs.type;
          if (attrs.parent !== undefined) node.parent = attrs.parent;
          if (attrs.instance !== undefined) node.instance = attrs.instance;
          const extra = collectExtraAttrs(raw, NODE_ATTRS);
          if (extra) node.extraAttrs = extra;
          node.attrOrder = attrOrder;
          scene.nodes.push(node);
          break;
        }
        case "connection": {
          const conn: Connection = {
            signal: attrs.signal || "",
            from: attrs.from || "",
            to: attrs.to || "",
            method: attrs.method || "",
          };
          if (attrs.flags) conn.flags = parseInt(attrs.flags, 10);
          if (attrs.binds) conn.binds = attrs.binds;
          if (attrs.unbinds) conn.unbinds = parseInt(attrs.unbinds, 10);
          const extra = collectExtraAttrs(raw, CONNECTION_ATTRS);
          if (extra) conn.extraAttrs = extra;
          conn.attrOrder = attrOrder;
          scene.connections.push(conn);
          break;
        }
        case "editable": {
          if (attrs.path !== undefined) scene.editables.push(attrs.path);
          break;
        }
      }
    }

    return scene;
  }

  serialize(scene: TscnScene): string {
    const lines: string[] = [];

    // Blank-line placement below matches Godot's own writer: ext_resource,
    // connection and editable sections are each written as one contiguous
    // block, while sub_resource and node sections are separated individually.
    lines.push(
      "[gd_scene" +
        serializeAttrs(
          [
            // Godot 4.6+ omits load_steps; write back exactly what the source
            // had. It is only a preload hint, and hand-authored scenes can
            // carry a value that disagrees with the section count — recomputing
            // would rewrite a line nobody asked us to touch. addExtResource()
            // keeps it in step when resources are actually added.
            [
              "load_steps",
              scene.header.loadSteps !== undefined
                ? `${scene.header.loadSteps}`
                : undefined,
            ],
            ["format", `${scene.header.format}`],
            ["uid", scene.header.uid ? `"${scene.header.uid}"` : undefined],
          ],
          scene.header.extraAttrs,
          scene.header.attrOrder
        ) +
        "]"
    );

    if (scene.extResources.length > 0) {
      lines.push("");
      for (const ext of scene.extResources) {
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

    for (const sub of scene.subResources) {
      lines.push("");
      lines.push(serializeSubResource(sub));
      for (const [key, val] of Object.entries(sub.properties)) {
        lines.push(`${key} = ${val}`);
      }
    }

    for (const node of this.sortNodes(scene.nodes)) {
      lines.push("");
      lines.push(
        "[node" +
          serializeAttrs(
            [
              ["name", `"${node.name}"`],
              ["type", node.type ? `"${node.type}"` : undefined],
              ["parent", node.parent !== undefined ? `"${node.parent}"` : undefined],
              ["instance", node.instance],
            ],
            node.extraAttrs,
            node.attrOrder
          ) +
          "]"
      );
      for (const [key, val] of Object.entries(node.properties)) {
        lines.push(`${key} = ${val}`);
      }
    }

    if (scene.connections.length > 0) {
      lines.push("");
      for (const conn of scene.connections) {
        lines.push(
          "[connection" +
            serializeAttrs(
              [
                ["signal", `"${conn.signal}"`],
                ["from", `"${conn.from}"`],
                ["to", `"${conn.to}"`],
                ["method", `"${conn.method}"`],
                ["flags", conn.flags !== undefined ? `${conn.flags}` : undefined],
                // Godot writes a space after `binds=`; keep it so untouched
                // scenes round-trip byte-identically.
                ["binds", conn.binds !== undefined ? ` ${conn.binds}` : undefined],
                [
                  "unbinds",
                  conn.unbinds !== undefined ? `${conn.unbinds}` : undefined,
                ],
              ],
              conn.extraAttrs,
              conn.attrOrder
            ) +
            "]"
        );
      }
    }

    if (scene.editables.length > 0) {
      lines.push("");
      for (const editablePath of scene.editables) {
        lines.push(`[editable path="${editablePath}"]`);
      }
    }

    lines.push("");
    return lines.join("\n");
  }

  addNode(
    scene: TscnScene,
    opts: {
      name: string;
      type: string;
      parent: string;
      properties?: Record<string, string>;
    }
  ): TscnScene {
    if (opts.parent === ".") {
      const hasRoot = scene.nodes.some((n) => n.parent === undefined);
      if (!hasRoot) {
        throw new Error("Scene has no root node");
      }
    } else {
      const fullParent = this.resolveFullPath(scene.nodes, opts.parent);
      const parentExists = scene.nodes.some(
        (n) => this.buildNodePath(n, scene.nodes) === fullParent
      );
      if (!parentExists) {
        throw new Error(`Parent node not found: ${opts.parent}`);
      }
    }

    const newNode: SceneNode = {
      name: opts.name,
      type: opts.type,
      parent: opts.parent,
      properties: opts.properties ?? {},
    };

    return {
      ...scene,
      nodes: [...scene.nodes, newNode],
    };
  }

  removeNode(scene: TscnScene, nodePath: string): TscnScene {
    const targetIdx = this.findNodeIndex(scene, nodePath);
    if (targetIdx === -1) {
      throw new Error(`Node not found: ${nodePath}`);
    }

    const resolvedPath = this.buildNodePath(scene.nodes[targetIdx], scene.nodes);
    const pathsToRemove = new Set<string>();
    pathsToRemove.add(resolvedPath);

    for (const node of scene.nodes) {
      const np = this.buildNodePath(node, scene.nodes);
      if (np.startsWith(resolvedPath + "/")) {
        pathsToRemove.add(np);
      }
    }

    const remainingNodes = scene.nodes.filter((node) => {
      const np = this.buildNodePath(node, scene.nodes);
      return !pathsToRemove.has(np);
    });

    return {
      ...scene,
      nodes: remainingNodes,
    };
  }

  setProperty(
    scene: TscnScene,
    nodePath: string,
    key: string,
    value: string
  ): TscnScene {
    const nodeIndex = this.findNodeIndex(scene, nodePath);

    if (nodeIndex === -1) {
      throw new Error(`Node not found: ${nodePath}`);
    }

    const nodes = [...scene.nodes];
    nodes[nodeIndex] = {
      ...nodes[nodeIndex],
      properties: {
        ...nodes[nodeIndex].properties,
        [key]: value,
      },
    };

    return { ...scene, nodes };
  }

  addExtResource(
    scene: TscnScene,
    type: string,
    path: string
  ): { scene: TscnScene; id: string } {
    const existing = scene.extResources.find(
      (r) => r.type === type && r.path === path
    );
    if (existing) return { scene, id: existing.id };

    const id = `${scene.extResources.length + 1}_${randomHex(3)}`;
    const newScene: TscnScene = {
      ...scene,
      header:
        scene.header.loadSteps !== undefined
          ? { ...scene.header, loadSteps: scene.header.loadSteps + 1 }
          : scene.header,
      extResources: [...scene.extResources, { type, path, id }],
    };
    return { scene: newScene, id };
  }

  createScene(rootNodeType: string, rootNodeName?: string): TscnScene {
    const name = rootNodeName ?? rootNodeType;
    return {
      // No load_steps: Godot omits it when there is nothing to preload, on
      // every version. It is added back by addExtResource() only if a scene
      // that already declared one gains a resource.
      header: { format: 3 },
      extResources: [],
      subResources: [],
      nodes: [
        {
          name,
          type: rootNodeType,
          properties: {},
        },
      ],
      connections: [],
      editables: [],
    };
  }

  addConnection(
    scene: TscnScene,
    conn: Connection
  ): TscnScene {
    return {
      ...scene,
      connections: [...scene.connections, conn],
    };
  }

  removeConnection(
    scene: TscnScene,
    signal: string,
    from: string,
    to: string,
    method: string
  ): TscnScene {
    return {
      ...scene,
      connections: scene.connections.filter(
        (c) =>
          !(c.signal === signal && c.from === from && c.to === to && c.method === method)
      ),
    };
  }

  private findNodeIndex(scene: TscnScene, nodePath: string): number {
    let idx = scene.nodes.findIndex(
      (node) => this.buildNodePath(node, scene.nodes) === nodePath
    );
    if (idx === -1) {
      const root = scene.nodes.find((n) => n.parent === undefined);
      if (root) {
        const withRoot = `${root.name}/${nodePath}`;
        idx = scene.nodes.findIndex(
          (node) => this.buildNodePath(node, scene.nodes) === withRoot
        );
      }
    }
    return idx;
  }

  getNodeByPath(scene: TscnScene, nodePath: string): SceneNode | undefined {
    const idx = this.findNodeIndex(scene, nodePath);
    return idx === -1 ? undefined : scene.nodes[idx];
  }

  buildNodePath(node: SceneNode, allNodes: SceneNode[]): string {
    if (node.parent === undefined) {
      return node.name;
    }

    if (node.parent === ".") {
      const root = allNodes.find((n) => n.parent === undefined);
      return root ? `${root.name}/${node.name}` : node.name;
    }

    const root = allNodes.find((n) => n.parent === undefined);
    if (root) {
      return `${root.name}/${node.parent}/${node.name}`;
    }
    return `${node.parent}/${node.name}`;
  }

  private resolveFullPath(allNodes: SceneNode[], parentField: string): string {
    const root = allNodes.find((n) => n.parent === undefined);
    if (root) {
      return `${root.name}/${parentField}`;
    }
    return parentField;
  }

  private sortNodes(nodes: SceneNode[]): SceneNode[] {
    const root = nodes.find((n) => n.parent === undefined);
    if (!root) return nodes;

    // Every path that actually exists as a node in this file. A parent that is
    // not in here is unreachable *within this file* — it lives in an inherited
    // or instanced base scene, or the path is malformed. Such a node must be
    // emitted in its source position, not deferred to the end, which would
    // reorder a valid inherited scene.
    const nodePaths = new Set(nodes.map((n) => this.buildNodePath(n, nodes)));

    const sorted: SceneNode[] = [root];
    let remaining = nodes.filter((n) => n !== root);
    const added = new Set<string>();
    added.add(root.name);

    // Walk forward and keep the leftovers in source order, so siblings stay
    // where the author put them instead of flipping on every serialize.
    let changed = true;
    while (changed && remaining.length > 0) {
      changed = false;
      const deferred: SceneNode[] = [];

      for (const node of remaining) {
        const parentPath =
          node.parent === "."
            ? root.name
            : `${root.name}/${node.parent}`;
        // Emit when the parent is already placed, or when it can never be
        // placed (unreachable) — deferring the latter is what moved it away
        // from its source position.
        if (added.has(parentPath) || !nodePaths.has(parentPath)) {
          sorted.push(node);
          added.add(this.buildNodePath(node, nodes));
          changed = true;
        } else {
          deferred.push(node);
        }
      }

      remaining = deferred;
    }

    // Anything still left implies a parent cycle; keep it in source order.
    sorted.push(...remaining);
    return sorted;
  }
}

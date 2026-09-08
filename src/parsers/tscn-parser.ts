import {
  collectExtraAttrs,
  parseAttrs,
  serializeExtraAttrs,
} from "./section-attrs.js";

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
}

export interface ExtResource {
  type: string;
  path: string;
  id: string;
  uid?: string;
  extraAttrs?: Record<string, string>;
}

export interface SubResource {
  type: string;
  id: string;
  properties: Record<string, string>;
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

function randomHex(len: number): string {
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}

function countBraceDepth(s: string): number {
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (const ch of s) {
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
  }
  return depth;
}

function parseProperties(body: string): Record<string, string> {
  const props: Record<string, string> = {};
  if (!body) return props;

  let currentKey: string | null = null;
  let currentValue = "";
  let depth = 0;

  for (const line of body.split("\n")) {
    const trimmed = line.trim();

    if (currentKey !== null) {
      // Accumulating a multi-line value (dict or array)
      currentValue += "\n" + line;
      depth += countBraceDepth(trimmed);
      if (depth <= 0) {
        props[currentKey] = currentValue.trim();
        currentKey = null;
        currentValue = "";
        depth = 0;
      }
      continue;
    }

    if (!trimmed || trimmed.startsWith(";")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();

    const d = countBraceDepth(value);
    if (d > 0) {
      // Value opens a multi-line block
      currentKey = key;
      currentValue = value;
      depth = d;
    } else {
      props[key] = value;
    }
  }

  // Handle unclosed block (malformed .tscn)
  if (currentKey !== null) {
    props[currentKey] = currentValue.trim();
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
          scene.extResources.push(ext);
          break;
        }
        case "sub_resource": {
          scene.subResources.push({
            type: attrs.type || "",
            id: attrs.id || "",
            properties: props,
          });
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

    let header = "[gd_scene";
    if (scene.header.loadSteps !== undefined) {
      const loadSteps =
        scene.extResources.length + scene.subResources.length + 1;
      header += ` load_steps=${loadSteps}`;
    }
    header += ` format=${scene.header.format}`;
    if (scene.header.uid) header += ` uid="${scene.header.uid}"`;
    header += serializeExtraAttrs(scene.header.extraAttrs);
    header += "]";
    lines.push(header);

    for (const ext of scene.extResources) {
      lines.push("");
      let line = `[ext_resource type="${ext.type}" path="${ext.path}" id="${ext.id}"`;
      if (ext.uid) line += ` uid="${ext.uid}"`;
      line += serializeExtraAttrs(ext.extraAttrs);
      line += "]";
      lines.push(line);
    }

    for (const sub of scene.subResources) {
      lines.push("");
      lines.push(`[sub_resource type="${sub.type}" id="${sub.id}"]`);
      for (const [key, val] of Object.entries(sub.properties)) {
        lines.push(`${key} = ${val}`);
      }
    }

    const sorted = this.sortNodes(scene.nodes);

    for (const node of sorted) {
      lines.push("");
      let nodeLine = `[node name="${node.name}"`;
      if (node.type) nodeLine += ` type="${node.type}"`;
      if (node.parent !== undefined) nodeLine += ` parent="${node.parent}"`;
      if (node.instance) nodeLine += ` instance=${node.instance}`;
      nodeLine += serializeExtraAttrs(node.extraAttrs);
      nodeLine += "]";
      lines.push(nodeLine);
      for (const [key, val] of Object.entries(node.properties)) {
        lines.push(`${key} = ${val}`);
      }
    }

    for (const conn of scene.connections) {
      lines.push("");
      let connLine = `[connection signal="${conn.signal}" from="${conn.from}" to="${conn.to}" method="${conn.method}"`;
      if (conn.flags !== undefined) connLine += ` flags=${conn.flags}`;
      if (conn.binds !== undefined) connLine += ` binds=${conn.binds}`;
      if (conn.unbinds !== undefined) connLine += ` unbinds=${conn.unbinds}`;
      connLine += serializeExtraAttrs(conn.extraAttrs);
      connLine += "]";
      lines.push(connLine);
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
      extResources: [...scene.extResources, { type, path, id }],
    };
    return { scene: newScene, id };
  }

  createScene(rootNodeType: string, rootNodeName?: string): TscnScene {
    const name = rootNodeName ?? rootNodeType;
    return {
      header: { loadSteps: 1, format: 3 },
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
        const parentAdded =
          node.parent === "."
            ? added.has(root.name)
            : added.has(`${root.name}/${node.parent}`);

        if (parentAdded) {
          sorted.push(node);
          added.add(this.buildNodePath(node, nodes));
          changed = true;
        } else {
          deferred.push(node);
        }
      }

      remaining = deferred;
    }

    sorted.push(...remaining);
    return sorted;
  }
}

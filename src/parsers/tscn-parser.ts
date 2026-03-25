export interface TscnHeader {
  loadSteps: number;
  format: number;
  uid?: string;
}

export interface ExtResource {
  type: string;
  path: string;
  id: string;
  uid?: string;
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
}

export interface Connection {
  signal: string;
  from: string;
  to: string;
  method: string;
}

export interface TscnScene {
  header: TscnHeader;
  extResources: ExtResource[];
  subResources: SubResource[];
  nodes: SceneNode[];
  connections: Connection[];
}

function randomHex(len: number): string {
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
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

export class TscnParser {
  parse(content: string): TscnScene {
    const scene: TscnScene = {
      header: { loadSteps: 1, format: 3 },
      extResources: [],
      subResources: [],
      nodes: [],
      connections: [],
    };

    const sections = splitSections(content);

    for (const section of sections) {
      const headerMatch = section.header.match(/^\[(\w+)(.*)\]$/);
      if (!headerMatch) continue;

      const tag = headerMatch[1];
      const attrStr = headerMatch[2];
      const attrs = parseHeaderAttrs(attrStr);
      const props = parseProperties(section.body);

      switch (tag) {
        case "gd_scene": {
          scene.header.format = parseInt(attrs.format || "3", 10);
          scene.header.loadSteps = parseInt(attrs.load_steps || "1", 10);
          if (attrs.uid) scene.header.uid = attrs.uid;
          break;
        }
        case "ext_resource": {
          const ext: ExtResource = {
            type: attrs.type || "",
            path: attrs.path || "",
            id: attrs.id || "",
          };
          if (attrs.uid) ext.uid = attrs.uid;
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
          scene.nodes.push(node);
          break;
        }
        case "connection": {
          scene.connections.push({
            signal: attrs.signal || "",
            from: attrs.from || "",
            to: attrs.to || "",
            method: attrs.method || "",
          });
          break;
        }
      }
    }

    return scene;
  }

  serialize(scene: TscnScene): string {
    const lines: string[] = [];
    const loadSteps =
      scene.extResources.length + scene.subResources.length + 1;

    let header = `[gd_scene load_steps=${loadSteps} format=${scene.header.format}`;
    if (scene.header.uid) header += ` uid="${scene.header.uid}"`;
    header += "]";
    lines.push(header);

    for (const ext of scene.extResources) {
      lines.push("");
      let line = `[ext_resource type="${ext.type}" path="${ext.path}" id="${ext.id}"`;
      if (ext.uid) line += ` uid="${ext.uid}"`;
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
      nodeLine += "]";
      lines.push(nodeLine);
      for (const [key, val] of Object.entries(node.properties)) {
        lines.push(`${key} = ${val}`);
      }
    }

    for (const conn of scene.connections) {
      lines.push("");
      lines.push(
        `[connection signal="${conn.signal}" from="${conn.from}" to="${conn.to}" method="${conn.method}"]`
      );
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
    const target = this.getNodeByPath(scene, nodePath);
    if (!target) {
      throw new Error(`Node not found: ${nodePath}`);
    }

    const pathsToRemove = new Set<string>();
    pathsToRemove.add(nodePath);

    for (const node of scene.nodes) {
      const np = this.buildNodePath(node, scene.nodes);
      if (np.startsWith(nodePath + "/")) {
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
    const nodeIndex = scene.nodes.findIndex(
      (node) => this.buildNodePath(node, scene.nodes) === nodePath
    );

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
    };
  }

  getNodeByPath(scene: TscnScene, nodePath: string): SceneNode | undefined {
    return scene.nodes.find(
      (node) => this.buildNodePath(node, scene.nodes) === nodePath
    );
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
    const remaining = nodes.filter((n) => n !== root);
    const added = new Set<string>();
    added.add(root.name);

    let changed = true;
    while (changed && remaining.length > 0) {
      changed = false;
      for (let i = remaining.length - 1; i >= 0; i--) {
        const node = remaining[i];
        const fullPath = this.buildNodePath(node, nodes);

        let parentAdded = false;
        if (node.parent === ".") {
          parentAdded = added.has(root.name);
        } else {
          parentAdded = added.has(`${root.name}/${node.parent}`);
        }

        if (parentAdded) {
          sorted.push(node);
          added.add(fullPath);
          remaining.splice(i, 1);
          changed = true;
        }
      }
    }

    sorted.push(...remaining);
    return sorted;
  }
}

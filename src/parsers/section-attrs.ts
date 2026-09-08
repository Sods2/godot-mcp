/**
 * Shared parsing of the `key=value` attribute list in a `.tscn` / `.tres`
 * section header, e.g. the part after `node` in
 * `[node name="Sprite" type="Sprite2D" parent="."]`.
 */

export interface ParsedAttrs {
  /** Attribute values with any surrounding quotes stripped. */
  values: Record<string, string>;
  /** Attribute values exactly as written in the file, for byte-faithful re-emission. */
  raw: Record<string, string>;
}

/**
 * Split an attribute list into `key` / raw `value` pairs, in source order.
 *
 * A value can be a quoted string, a bare token, or a constructor or array
 * expression containing spaces — `PackedInt32Array(1, 2)`, `["a", "b"]`,
 * `PackedStringArray("a", "b")` — so quotes and bracket depth have to be
 * tracked rather than splitting on whitespace.
 */
export function parseAttrs(attrStr: string): ParsedAttrs {
  const values: Record<string, string> = {};
  const raw: Record<string, string> = {};

  let i = 0;
  while (i < attrStr.length) {
    while (i < attrStr.length && /\s/.test(attrStr[i])) i++;

    const keyStart = i;
    while (i < attrStr.length && /\w/.test(attrStr[i])) i++;
    if (i === keyStart) {
      // Not the start of a key — skip the character and resynchronize.
      i++;
      continue;
    }
    const key = attrStr.slice(keyStart, i);

    while (i < attrStr.length && /\s/.test(attrStr[i])) i++;
    if (attrStr[i] !== "=") continue;
    i++;
    while (i < attrStr.length && /\s/.test(attrStr[i])) i++;

    const valueStart = i;
    let depth = 0;
    let inString = false;
    let escaped = false;
    while (i < attrStr.length) {
      const ch = attrStr[i];
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (inString) {
        if (ch === '"') inString = false;
      } else if (ch === '"') {
        inString = true;
      } else if (ch === "(" || ch === "[" || ch === "{") {
        depth++;
      } else if (ch === ")" || ch === "]" || ch === "}") {
        if (depth === 0) break;
        depth--;
      } else if (depth === 0 && /\s/.test(ch)) {
        break;
      }
      i++;
    }

    if (i > valueStart) {
      const value = attrStr.slice(valueStart, i);
      raw[key] = value;
      values[key] = unquote(value);
    }
  }

  return { values, raw };
}

/** Strip the surrounding quotes of a raw attribute value, if it has any. */
export function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Collect the attributes this parser has no dedicated field for, so they can be
 * carried through a parse/serialize round trip untouched. Godot 4.6 added
 * `unique_id`, `parent_id_path`, `owner_uid_path` and the `[connection]`
 * `*_uid_path` attributes, which encode node identity across renames and
 * reparents — dropping them silently reverts a scene to 4.5 semantics.
 *
 * Returns undefined when there are none, so an untouched scene compares equal.
 */
export function collectExtraAttrs(
  raw: Record<string, string>,
  known: ReadonlySet<string>
): Record<string, string> | undefined {
  const extra: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!known.has(key)) extra[key] = value;
  }
  return Object.keys(extra).length > 0 ? extra : undefined;
}

/** Re-emit preserved attributes, in the order they appeared in the source. */
export function serializeExtraAttrs(
  extra: Record<string, string> | undefined
): string {
  if (!extra) return "";
  return Object.entries(extra)
    .map(([key, value]) => ` ${key}=${value}`)
    .join("");
}

/**
 * Build a section header's attribute list.
 *
 * `order` is the attribute order the file was written with; emitting in that
 * order keeps an untouched section byte-identical, without this parser having
 * to hardcode a per-version guess at Godot's own ordering (4.6 writes
 * `unique_id` before `instance`, for instance). Attributes with no recorded
 * position — a node this parser created — follow in `known` order.
 */
export function serializeAttrs(
  known: Array<[string, string | undefined]>,
  extra: Record<string, string> | undefined,
  order: string[] | undefined
): string {
  const values = new Map<string, string>();
  for (const [key, value] of known) {
    if (value !== undefined) values.set(key, value);
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) values.set(key, value);
  }

  const parts: string[] = [];
  const emitted = new Set<string>();
  for (const key of order ?? []) {
    const value = values.get(key);
    if (value !== undefined && !emitted.has(key)) {
      parts.push(`${key}=${value}`);
      emitted.add(key);
    }
  }
  for (const [key, value] of values) {
    if (!emitted.has(key)) parts.push(`${key}=${value}`);
  }

  return parts.map((part) => ` ${part}`).join("");
}

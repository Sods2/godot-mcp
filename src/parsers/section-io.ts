/**
 * Shared, depth- and quote-aware reading of Godot's `[section]` file format
 * (`.tscn` and `.tres`). Both parsers use this so a value that spans lines —
 * a dictionary, an array, or a literal multi-line string — is never truncated,
 * whether the split happens at the section boundary or inside a property body.
 */

/**
 * Scan one line of a property value, continuing from the previous line's string
 * state. A value can span lines two ways: an open bracket (dict or array) or an
 * open quote — Godot writes multi-line strings literally, e.g.
 *
 *     text = "0/10
 *     Wood"
 *
 * Tracking only bracket depth silently swallows the second line, because it has
 * no `=` and is skipped as junk.
 */
export function scanValueLine(
  s: string,
  startInString: boolean
): { depth: number; inString: boolean } {
  let depth = 0;
  let inString = startInString;
  let escaped = false;
  for (const ch of s) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
  }
  return { depth, inString };
}

export function parseProperties(body: string): Record<string, string> {
  const props: Record<string, string> = {};
  if (!body) return props;

  let currentKey: string | null = null;
  let currentValue = "";
  let depth = 0;
  let inString = false;

  for (const line of body.split("\n")) {
    const trimmed = line.trim();

    if (currentKey !== null) {
      // Accumulating a value that spans lines (dict, array, or string)
      currentValue += "\n" + line;
      const scan = scanValueLine(line, inString);
      depth += scan.depth;
      inString = scan.inString;
      if (depth <= 0 && !inString) {
        props[currentKey] = currentValue;
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

    const scan = scanValueLine(value, false);
    if (scan.depth > 0 || scan.inString) {
      // Value continues on the following lines
      currentKey = key;
      currentValue = value;
      depth = scan.depth;
      inString = scan.inString;
    } else {
      props[key] = value;
    }
  }

  // Handle an unterminated value (malformed file)
  if (currentKey !== null) {
    props[currentKey] = currentValue;
  }

  return props;
}

/**
 * Split a file into `[section]` blocks. A line is only a section header when it
 * looks like `[...]` AND the reader is at bracket depth 0 and not inside a
 * string — otherwise a property value line such as `[b]bold[/b]` (BBCode in a
 * RichTextLabel) or an array element on its own line would be mistaken for a
 * new section, truncating the value before it.
 */
export function splitSections(
  content: string
): Array<{ header: string; body: string }> {
  const sections: Array<{ header: string; body: string }> = [];
  const lines = content.split("\n");
  let currentHeader = "";
  let currentBody: string[] = [];
  let depth = 0;
  let inString = false;

  for (const line of lines) {
    const atTopLevel = depth <= 0 && !inString;
    if (atTopLevel && line.startsWith("[") && line.endsWith("]")) {
      if (currentHeader) {
        sections.push({
          header: currentHeader,
          body: currentBody.join("\n").trim(),
        });
      }
      currentHeader = line;
      currentBody = [];
      // The header is atomic; don't let its own brackets leak into value state.
      depth = 0;
      inString = false;
    } else if (currentHeader) {
      currentBody.push(line);
      const scan = scanValueLine(line, inString);
      depth += scan.depth;
      inString = scan.inString;
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

/**
 * Strip BBCode tags from a string (used in GUT 9.x output).
 * Removes tags like [color=green]...[/color], [right]...[/right], [b]...[/b], etc.
 */
export function stripBBCode(text: string): string {
  return text
    // Only strip tags whose name contains at least one lowercase letter (real BBCode formatting
    // like [color=green], [b], [/b], [right]). This preserves uppercase status markers like
    // [PASSED], [FAILED], [ERROR], [PASS], [FAIL] used by GdUnit4 and some GUT variants.
    .replace(/\[\/?\w*[a-z]\w*(?:=[^\]]*)?]/g, "")
    .replace(/^\[gd\]\s*/gm, "");            // Remove leading [gd] prefix GUT adds per-line
}

/**
 * Strip ANSI escape codes from a string.
 */
export function stripAnsi(text: string): string {
  /* eslint-disable no-control-regex */
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")   // CSI sequences (covers all single-letter endings)
    .replace(/\x1b\][^\x07]*\x07/g, "")        // OSC sequences (e.g. terminal title)
    .replace(/\x1b[()][0-9A-B]/g, "")           // Character set selection
    .replace(/\x1b[\x40-\x5f]/g, "");           // Other two-byte escape sequences
  /* eslint-enable no-control-regex */
}

/**
 * Clean Godot process output by stripping ANSI codes and filtering noise lines:
 * - Godot version banner: "Godot Engine v4.x.x..."
 * - GPU/driver info lines: "OpenGL API...", "Vulkan API...", "RenderingDevice..."
 */
export function cleanOutput(text: string): string {
  const cleaned = stripBBCode(stripAnsi(text));
  return cleaned
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (t.match(/^Godot Engine v[\d.]+/)) return false;
      if (t.match(/^OpenGL API /)) return false;
      if (t.match(/^Vulkan API /)) return false;
      if (t.match(/^RenderingDevice: /)) return false;
      if (t.match(/^WARNING: Godot Engine/)) return false;
      return true;
    })
    .join("\n");
}

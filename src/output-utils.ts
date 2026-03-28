/**
 * Strip ANSI escape codes from a string.
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[mGKHF]/g, "");
}

/**
 * Clean Godot process output by stripping ANSI codes and filtering noise lines:
 * - Godot version banner: "Godot Engine v4.x.x..."
 * - GPU/driver info lines: "OpenGL API...", "Vulkan API...", "RenderingDevice..."
 */
export function cleanOutput(text: string): string {
  const cleaned = stripAnsi(text);
  return cleaned
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (t.match(/^Godot Engine v[\d.]+/)) return false;
      if (t.match(/^OpenGL API /)) return false;
      if (t.match(/^Vulkan API /)) return false;
      if (t.match(/^RenderingDevice: /)) return false;
      if (t.match(/^WARNING: Godot/)) return false;
      return true;
    })
    .join("\n");
}

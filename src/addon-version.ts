import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export const SERVER_VERSION: string = (require("../package.json") as { version: string }).version;

export const UPDATE_HINT =
  "Update the Godot addon (addons/godot_mcp_bridge) in your project to match the godot-mcp npm package version, then reload the project.";

export function outdatedAddonMessage(detail: string): string {
  return `Godot addon is outdated or incompatible with godot-mcp ${SERVER_VERSION}: ${detail}. ${UPDATE_HINT}`;
}

/**
 * Compare an editor.status reply against what this server expects.
 * Returns a warning string when the addon looks outdated, otherwise null.
 */
export function checkAddonStatus(status: unknown, serverVersion = SERVER_VERSION): string | null {
  const s = (status ?? {}) as { addon_version?: unknown; edited_scene?: unknown };
  if (typeof s.addon_version !== "string") {
    return outdatedAddonMessage("the addon does not report a version (status reply lacks addon_version)");
  }
  if (s.addon_version !== serverVersion) {
    return outdatedAddonMessage(`addon version ${s.addon_version} does not match server version ${serverVersion}`);
  }
  if (typeof s.edited_scene !== "string") {
    return outdatedAddonMessage("status reply lacks edited_scene");
  }
  return null;
}

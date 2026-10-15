import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BridgeConnection } from "../connection.js";

/**
 * Input Map tools. All edits go through the editor bridge
 * (ProjectSettings `input/<action>` + ProjectSettings.save()) so Godot writes
 * project.godot itself and existing multi-line action blocks stay intact.
 */

export const inputEventSchema = z
  .object({
    type: z
      .enum(["key", "mouse_button", "joypad_button", "joypad_motion"])
      .default("key")
      .describe("Event type"),
    keycode: z.number().int().optional().describe("Key: logical keycode (Godot Key enum, e.g. 32 = Space)"),
    physical_keycode: z.number().int().optional().describe("Key: physical keycode (e.g. 4194325 = Shift)"),
    key_label: z.number().int().optional().describe("Key: key label"),
    unicode: z.number().int().optional().describe("Key: unicode codepoint"),
    shift: z.boolean().optional(),
    ctrl: z.boolean().optional(),
    alt: z.boolean().optional(),
    meta: z.boolean().optional(),
    button_index: z.number().int().optional().describe("Mouse/joypad button index (mouse: 1=left, 2=right, 3=middle)"),
    axis: z.number().int().optional().describe("Joypad motion axis"),
    axis_value: z.number().optional().describe("Joypad motion axis value (-1 or 1)"),
    device: z.number().int().optional().describe("Joypad device (-1 = all)"),
  })
  .refine(
    (e) => e.type !== "key" || e.keycode !== undefined || e.physical_keycode !== undefined || e.key_label !== undefined,
    { message: "key events need keycode, physical_keycode or key_label" }
  );

type BridgeResult = { error?: string } & Record<string, unknown>;

async function call(bridge: BridgeConnection, method: string, params: Record<string, unknown>) {
  try {
    const result = await bridge.send<BridgeResult>(method, params);
    if (result && typeof result === "object" && typeof result.error === "string") {
      return { content: [{ type: "text" as const, text: `Error: ${result.error}` }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true };
  }
}

export function registerInputMapTools(server: McpServer, bridge: BridgeConnection): void {
  server.tool(
    "godot_list_input_actions",
    "List Input Map actions from project settings with their deadzone and events (requires editor plugin)",
    {
      include_builtin: z.boolean().optional().describe("Include built-in ui_* actions (default false)"),
    },
    async ({ include_builtin }) => call(bridge, "input_map.list", { include_builtin: include_builtin ?? false })
  );

  server.tool(
    "godot_add_input_action",
    "Add an Input Map action (or append events to an existing one) and save project.godot via the editor (requires editor plugin)",
    {
      action: z.string().min(1).describe("Action name, e.g. 'dash'"),
      deadzone: z.number().min(0).max(1).optional().describe("Deadzone (default 0.5)"),
      events: z.array(inputEventSchema).optional().describe("Events to bind, e.g. [{type:'key', physical_keycode:4194325}]"),
      overwrite: z.boolean().optional().describe("Replace existing events instead of appending (default false)"),
    },
    async ({ action, deadzone, events, overwrite }) =>
      call(bridge, "input_map.add_action", { action, deadzone, events: events ?? [], overwrite: overwrite ?? false })
  );

  server.tool(
    "godot_add_input_event",
    "Append one or more events to an existing Input Map action and save (requires editor plugin)",
    {
      action: z.string().min(1).describe("Existing action name"),
      event: inputEventSchema.optional().describe("Single event to add"),
      events: z.array(inputEventSchema).optional().describe("Events to add"),
    },
    async ({ action, event, events }) => {
      const all = [...(events ?? []), ...(event ? [event] : [])];
      if (all.length === 0) {
        return { content: [{ type: "text" as const, text: "Error: event or events is required" }], isError: true };
      }
      return call(bridge, "input_map.add_event", { action, events: all });
    }
  );

  server.tool(
    "godot_remove_input_action",
    "Remove an Input Map action and save project.godot via the editor (requires editor plugin)",
    {
      action: z.string().min(1).describe("Action name to remove"),
    },
    async ({ action }) => call(bridge, "input_map.remove_action", { action })
  );
}

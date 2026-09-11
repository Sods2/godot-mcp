# godot-mcp compatibility audit — 8 Sep 2026

Checked: npm dependencies, and Godot engine compatibility. `npm run build` (tsc) is clean.

## Summary

The npm side is fine. **Godot is the problem**: the project targets up to 4.5, but Godot is now
on **4.7.2**. Two releases (4.6, Jan 2026 and 4.7, Jun 2026) landed since. Nothing is
catastrophically broken, but there is one real data-loss bug and several papercuts.

---

## 1. `@modelcontextprotocol/sdk` — safe to bump (low priority)

| | version |
|---|---|
| declared | `^1.12.0` |
| installed | 1.28.0 |
| latest | 1.30.0 |

**No breaking changes in 1.29.0 or 1.30.0.** Both are bugfix/security releases.

- 1.29.0 — extensions in capability objects, `ResourceSchema.size` field, TTL validation,
  `windowsHide` on Windows, npm audit fixes.
- 1.30.0 — Zod 3.25 method-literal fix, SSE keep-alive frames in Streamable HTTP,
  Content-Type parsed-media-type validation, widened `@hono/node-server` past
  GHSA-frvp-7c67-39w9.

The SDK surface actually used is tiny and untouched by either release:
`McpServer`, `StdioServerTransport`, `Client`, `InMemoryTransport`.

Action: `npm i @modelcontextprotocol/sdk@^1.30.0`. Optional — nothing is broken at 1.28.0.

---

## 2. `.tscn` round-trip drops data on Godot 4.6+ scenes — **the real bug**

Godot 4.6 changed the text scene format (GH-103352, GH-106837):

- `load_steps` is no longer written to the header (deprecated, ignored if present).
- **New:** every node gets `unique_id=<int>` on its `[node]` line, plus
  `parent_id_path=PackedInt32Array(...)` and `owner_uid_path=PackedInt32Array(...)`,
  and `[connection]` lines gain `from_uid_path` / `to_uid_path`.

These exist so Godot can track nodes through renames and reparenting — they are what stops
inherited/instanced scenes losing property overrides and orphaning children when a base
scene is refactored.

`TscnParser.parse()` only captures `name`, `type`, `parent`, `instance` on a `[node]` line, and
`serialize()` only writes those four back. So every one of the new attributes is **silently
discarded** on write. `[editable path="..."]` sections have no parse case at all and are
dropped too — that one is a pre-existing bug, not a 4.6 regression.

Write paths affected (both round-trip the whole scene through `serialize()`):
- `src/tools/file-tools.ts:33`
- `src/tools/signal-tools.ts:43`

Consequence: editing a 4.6+ scene with these tools reverts it to 4.5-era identity semantics.
Godot regenerates fresh random `unique_id`s on the next save (`ResourceUID::create_id()` is
non-deterministic — see godotengine/godot#115971), causing spurious diffs, non-deterministic
PCK patch exports, and loss of refactor recovery. Any preserved `*_id_path` arrays elsewhere
in the file become dangling. Nothing errors; it degrades quietly.

**Fix:** treat unrecognized `[node]` / `[connection]` attributes as opaque and preserve them
byte-for-byte. Cleanest approach is to keep the raw attribute string (or a
`Record<string, string>` of leftovers) on `SceneNode` / `Connection` and re-emit it. Same for
`groups`, `index`, `owner`, `node_paths`, `instance_placeholder`, which are dropped today for
the same reason. Add an `[editable]` parse case while in there.

Also: `serialize()` still writes `load_steps=` (tscn-parser.ts:247, tres-parser.ts:120).
Harmless — Godot's loader is dictionary-based and never errors on unknown header
attributes — but the editor strips it on next save, producing noise diffs. Worth dropping
for `format >= 4` or just unconditionally.

Not affected: `format` version is still 4 (`FORMAT_VERSION_COMPAT` 3) on all of 4.5/4.6/4.7 —
no bump, so files stay mutually loadable.

---

## 3. `godot-path.ts` doesn't know about 4.6 or 4.7

`PLATFORM_PATHS.darwin` probes `Godot_v4.5-`, `4.4-`, `4.3-stable` only. A default 4.6 or 4.7
install won't auto-detect and needs `GODOT_PATH` set manually. Add the two new versioned
paths (and consider globbing `Godot_v4.*-stable*` instead of enumerating, so the next release
doesn't need a code change).

---

## 4. GDScript plugin — holds up well

The editor-scraping code in `debugger_plugin.gd` is the most exposed surface, and it survives.
Verified against engine source on the 4.5/4.6/4.7 branches:

- **Bottom panels became docks in 4.6** (GH-108647). `EditorLog` changed base class
  `HBoxContainer` → `EditorDock`, and the tree gained an `hb` level in 4.6, then reorganized
  again in 4.7 (`vb_right`, `copy_button`, `show_search_button` gone; `bottom_hf`
  HFlowContainer added). The code survives because `_find_node_of_class` searches by class
  name with a 3-level ancestor window — exactly enough for the 4.7 depth
  (`EditorLog → hb → vb_left → log`). It would break at 4 levels; worth widening the ancestor
  range as cheap insurance.
- `_get_all_children` walks `Node`, not `Control`, so it still finds a **floating** dock
  (wrapped in a `WindowWrapper` under `gui_base`). A closed dock is reparented under a hidden
  `Control` but still found. Both fine.
- **Stack trace format is byte-identical through 4.7**: `_msg_stack_dump()` still emits
  `N - res://file.gd:line - at function: name`. `_parse_single_column_stack_entry` is safe.
- The `"Stack Trace"` tab name changed `TTR` → `TTRC` in 4.6, which is an *improvement* — the
  node name is now the literal English string rather than locale-translated, so
  `_find_stack_trace_tree`'s `containsn("stack")` match is now locale-independent. 4.6 added an
  ObjectDB Profiler tab, shifting tab indices, but the lookup is title-based so it's unaffected.
- `EditorDebuggerPlugin` / `EditorDebuggerSession` API: unchanged across all three versions.
- `EditorInterface` scene/selection/save/play methods: all unchanged. Still no viewport-capture
  method, so the `SubViewport.get_texture()` route in `screenshot_handler.gd` remains correct.
- 4.7's GDScript "typed return must be explicit in overrides" change: the only engine virtuals
  overridden with typed returns are `_has_capture` and `_capture`, and both return on every
  path. No action.
- `plugin.cfg` format unchanged, same five required keys.
- `TCPServer` / `StreamPeerTCP`: `poll`, `get_status`, `stop`, `is_connection_available` moved
  to new base classes `StreamPeerSocket` / `SocketServer` in 4.6, but inherited, so calls are
  unaffected. The `STATUS_*` constants also moved to `StreamPeerSocket`; native constants
  resolve through inheritance so `StreamPeerTCP.STATUS_CONNECTED`
  (`bridge_server.gd:137,328`) should still resolve — **verify by running**, this is the one
  item I couldn't confirm empirically.

Deprecated but still functional: `get_editor_interface()` (`plugin.gd:16,20`) — 4.6 deprecated
it in favour of the `EditorInterface` singleton, which the rest of the codebase already uses.
One-line cleanup.

---

## Recommended order

1. Preserve unknown `[node]`/`[connection]` attributes in the tscn parser, add `[editable]`,
   stop writing `load_steps`. *(data loss — do this first)*
2. Add 4.6/4.7 to `godot-path.ts` detection.
3. Run the plugin against 4.7 and confirm `StreamPeerTCP.STATUS_CONNECTED` resolves.
4. Bump the SDK to 1.30.0.
5. Cosmetic: drop `get_editor_interface()`, widen the ancestor window in `_find_node_of_class`,
   update README ("Godot 4.3 or later" → state tested range).

## Note on the test suite

`npx vitest run` fails in the Linux bridge VM with
`Cannot find module './rolldown-binding.linux-arm64-gnu.node'` — `node_modules/@rolldown/`
contains only `binding-darwin-arm64`. That's an artifact of where the command ran, not a real
break; the suite should run normally on macOS. Worth confirming locally.

## Sources

- [Upgrading from Godot 4.5 to 4.6](https://docs.godotengine.org/en/stable/tutorials/migrating/upgrading_to_godot_4.6.html)
- [Upgrading from Godot 4.6 to 4.7](https://docs.godotengine.org/en/stable/tutorials/migrating/upgrading_to_godot_4.7.html)
- [Godot 4.6 release notes](https://godotengine.org/releases/4.6/) · [Godot version support](https://endoflife.date/godot)
- [PR #106837 — unique Node IDs](https://github.com/godotengine/godot/pull/106837) · [issue #115971 — non-deterministic unique_id](https://github.com/godotengine/godot/issues/115971)
- [PR #108647 — bottom panel as dock slot](https://github.com/godotengine/godot/pull/108647)
- [tscn file format docs](https://github.com/godotengine/godot-docs/blob/master/engine_details/file_formats/tscn.rst)
- [typescript-sdk releases](https://github.com/modelcontextprotocol/typescript-sdk/releases)
- Engine source, branches 4.5/4.6/4.7: `scene/resources/resource_format_text.cpp`, `editor/editor_log.cpp`, `editor/debugger/script_editor_debugger.cpp`, `editor/docks/editor_dock_manager.cpp`
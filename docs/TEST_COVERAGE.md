# Test coverage matrix

The map of what is verified and **how**, so gaps are visible up front instead of
discovered one angle at a time. Update this table when you add a tool, a
subsystem, or a test. "Verification" is the strongest check that runs
automatically; "Live only" means it has been exercised against a real Godot
editor by hand but has no automated guard yet.

## Verification types

| Type | What it proves | Where |
|------|----------------|-------|
| **Unit (mocked)** | Tool logic: arg handling, request framing, response parsing, error paths. Godot is mocked. | `src/**/__tests__/*.test.ts` (vitest) |
| **Round-trip corpus** | `serialize(parse(x)) === x` and `parse∘serialize∘parse` is loss- and reorder-free, over real engine-written files. | `src/parsers/__tests__/roundtrip.test.ts`, `engine-fixtures.test.ts` |
| **GDScript headless** | The addon's own logic (value coercion) against real Godot types, with a real exit code. | `tests/gdscript/`, `npm run test:gd` |
| **Live editor** | End-to-end MCP → TCP bridge → editor → disk. Manual, this is not yet automated. | run by hand against a project with the addon |

CI (`.github/workflows/ci.yml`) runs Unit + Round-trip (vitest) and GDScript
headless on every push/PR. Live-editor checks are manual.

## Parsers (`src/parsers/`)

| Area | Verification | Notes |
|------|--------------|-------|
| `.tscn` / `.tres` byte-identical round-trip | Round-trip corpus | Godot 4.5 / 4.6 / 4.7 engine-written fixtures |
| Multi-line string property (body reader) | Round-trip corpus | `edge-cases/edge_bbcode.tscn`, `text.tscn` |
| Multi-line dict/array in a `.tres` | Round-trip corpus | `edge-cases/edge_dict.tres` |
| Value line that looks like `[section]` (splitter) | Round-trip corpus | `edge-cases/edge_bbcode.tscn` (BBCode) |
| Unreachable/inherited parent ordering | Round-trip corpus | `edge-cases/edge_inherited.tscn` — kept in source position |
| Node add / remove / set-property edits | Unit (mocked) | `tscn-parser.test.ts` |

## MCP server — standalone tools (CLI / filesystem)

These shell out to the Godot CLI or read/write files directly; no live editor.

| Tool group | Verification |
|------------|--------------|
| version / project info / list projects | Unit (mocked) + Live editor |
| file ops (folder/list/delete/rename/resources) | Unit (mocked) |
| run / stop / output / is-running | Unit (mocked) + Live editor |
| test framework detect/list/create/run | Unit (mocked) |
| export presets / export / mesh library | Unit (mocked) |
| UID get / update, validate script, autoloads | Unit (mocked) |
| file-based scene edits (`*_in_file`, parse/create) | Unit (mocked) + Round-trip corpus |

## MCP server — editor-bridge tools (require live editor + addon)

Connect to the addon's TCP server on `127.0.0.1:6008`.

Automated end-to-end runs in `tests/bridge/bridge-harness.mjs` (`npm run test:bridge`):
it boots a real editor with the addon, drives the tools through the MCP server
over the 6008 socket, and asserts the editor changed. In CI it runs under
`xvfb-run` with a software renderer.

| Tool group | Unit (mocked) | Live editor | Automated end-to-end |
|------------|:---:|:---:|:---:|
| editor status / scene tree / selection | ✅ | ✅ | ✅ |
| node add / rename | ✅ | ✅ | ✅ |
| node remove/reparent/duplicate/move | ✅ | ✅ | ❌ |
| get/set node property (incl. composite types) | ✅ | ✅ | ✅ |
| script editor (current/open/create/detach/insert) | ✅ | ✅ | ❌ |
| signals (list/connect/disconnect/connections) | ✅ | ✅ | ✅ (connect + list) |
| animations (list/get/create) | ✅ | ✅ | ✅ (create + list) |
| screenshots (viewport / game) | ✅ | ✅ | ✅ (viewport) |
| save scene | ✅ | ✅ | ✅ |
| resources (read/write/import) | ✅ | ✅ | ❌ |
| debugger (breakpoints/stack/locals/step/continue) | ✅ | ✅ | ❌ |
| profiler (start/stop/data) | ✅ | ✅ | ❌ |

## Addon (`plugin/addons/godot_mcp_bridge/`)

| Area | Verification |
|------|--------------|
| JSON → Variant value coercion (`value_coerce.gd`) | GDScript headless (21 checks, all types) |
| Handlers (scene/inspector/signal/…) | Live editor only |

## Known gaps

- **Some editor-bridge handlers are not yet in the end-to-end harness**:
  node remove/reparent/duplicate/move, the script-editor tools, resource
  read/write/import, and the debugger/profiler (which need a running game).
  They are unit-tested against a mocked bridge and verified live by hand;
  extend `tests/bridge/bridge-harness.mjs` to cover them.
- **Addon handlers** have no headless unit tests beyond value coercion.

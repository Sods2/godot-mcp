# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-10-22

The Godot addon and the npm package must be updated together: their versions
must match. An outdated addon is now detected and reported.

### Added

- **`godot_remove_autoload`**: removes an autoload through the editor.
- **Input Map tools**: add, list and remove actions and add events (key, mouse,
  joypad button and motion), applied through the editor's `ProjectSettings`. The
  editor Input Map UI refreshes after edits, including on the first call.
  Duplicate events are skipped.
- **`godot_reload_scene`, `godot_close_scene`, `godot_reload_project`**: reload or
  close an open scene, or reload the project. They refuse to discard unsaved
  changes unless `force` is set.
- **`godot_instance_scene`, `godot_create_resource`**: instance a scene as a child
  node (self and circular instancing are refused) and create a resource file
  (with an overwrite guard).
- **Inline sub-resources and `ExtResource` coercion** in `godot_set_property` and
  `godot_add_node`: `{type: ...}` values create sub-resources, and `ExtResource`
  values are coerced, with clear errors when they cannot be.
- **Addon version handshake**: an outdated addon is detected (including via
  unknown-method errors), and a warning is shown once per session on the first
  bridge tool call.
- **`GODOT_PATH` auto-detection** is improved across platforms.

### Changed

- **`godot_add_autoload`** now goes through the editor. Previously the autoload
  was written to `project.godot` and then wiped by the editor's next save.
- **`godot_validate_script`** uses the editor bridge when connected. Headless
  validation downgrades autoload identifier errors to warnings.
- **`godot_set_property`** failures are returned as MCP errors.
- **Install** copies `package-lock.json` and uses `npm ci`.
- **Docs**: the plugin enable name is corrected to "MCP Bridge" and the tool
  count is corrected (84 tools).

### Fixed

- **Reconnect**: duplicate bridge connect attempts after a reload no longer occur.
- **`godot_set_property`** coerces Node exports to `NodePath` and loads Resources.
- **`godot_add_node`** applies the script before Node exports, with a
  root-relative path fallback.
- **`godot_create_scene`** attaches a script for a `class_name` or script-path
  root instead of writing an invalid `type=`, and rejects unknown or non-Node
  `root_node_type` values.
- **`godot_import_asset`** scans the filesystem before reimport so new files get
  `.import` sidecars, writes a typed sidecar string for Godot 4.7, and reports an
  empty path as an error.
- **`godot_connect_signal` / `godot_disconnect_signal`** persist and read
  connections in the edited scene, not the first open scene.
- **`godot_get_autoloads`** strips quotes before checking the `*` enabled prefix.
- **`project.godot`** rewrites preserve multi-line values.

## [1.2.0] - 2026-09-19

### Fixed

- **`godot_set_property`** — composite values (`Vector2`, `Vector3`, `Color`,
  `Rect2`, and their integer variants, etc.) sent as JSON were silently dropped.
  The value is now coerced to the property's real Variant type and the write is
  verified, so a value the property cannot accept returns `success: false`
  instead of a false success.
- **`godot_add_node`** — the `properties` argument was ignored; it is now applied
  (with the same type coercion) when the node is created.
- **`godot_connect_signal` / `godot_disconnect_signal`** — connections now
  persist to the `.tscn` using the project root reported by the live editor, so
  persistence no longer fails when the MCP server runs outside the project
  directory. The editor connection is made with `CONNECT_PERSIST` so it survives
  `save_scene` instead of being clobbered.
- **`godot_write_resource`** — composite resource properties are coerced instead
  of dropped.
- **`.tscn` / `.tres` parser** — three round-trip data-loss bugs fixed: multi-line
  property values in a `.tres`, a value line that looks like a `[section]` header
  (e.g. BBCode in a `RichTextLabel`), and a node parented to an unreachable
  inherited parent (which was reordered to the end on serialize).
- **Editor bridge** — on a freshly imported project the bridge could start
  accepting requests before its handlers were initialized, failing every call
  with `Nonexistent function ... in base 'Nil'`. Handlers are now initialized at
  dispatch time.

### Added

- Round-trip invariant tests over a corpus of real, engine-written `.tscn` /
  `.tres` fixtures (`serialize(parse(x)) === x` and loss/reorder-free reparse).
- Headless GDScript tests for the value-coercion helper — `npm run test:gd`.
- Editor-bridge end-to-end harness that boots a real editor and drives the tools
  over the bridge socket — `npm run test:bridge`.
- `docs/TEST_COVERAGE.md` — a tools × verification × status matrix.
- CI jobs for the GDScript tests and the editor-bridge end-to-end harness.

## [1.1.1] - 2026-09-17

Release-prep hardening: installer robustness against silent dependency-install
failures, a Windows PowerShell installer, dependency-vulnerability fixes, and
LF-forced parser fixtures. See the
[v1.1.1 release](https://github.com/Sods2/godot-mcp/releases/tag/v1.1.1).

## [1.1.0] - 2026-09-11

See the [v1.1.0 release](https://github.com/Sods2/godot-mcp/releases/tag/v1.1.0).

## [1.0.0]

Initial release. See the
[v1.0.0 tag](https://github.com/Sods2/godot-mcp/releases/tag/v1.0.0).

[1.2.0]: https://github.com/Sods2/godot-mcp/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/Sods2/godot-mcp/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/Sods2/godot-mcp/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Sods2/godot-mcp/releases/tag/v1.0.0

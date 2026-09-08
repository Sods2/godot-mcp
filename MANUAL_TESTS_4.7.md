# Manual verification checklist — Godot 4.5 / 4.6 / 4.7

Everything checkable without a human at the keyboard is automated and passing
(summary at the bottom). What's left needs the **editor GUI** — the plugin
returns early under `--headless`, and the debugger panels it reads only exist
in a real editor window.

Budget roughly **30 minutes** for the whole list, or **10 minutes** for
Part A alone.

---

# Part A — the three that actually matter

If you only do three things, do these. They cover every change whose
behaviour I could not fully reach.

## A1. Debugger panels at a breakpoint ⭐ highest risk

**Why:** 4.7 reorganised the editor's dock hierarchy. The plugin locates
panels by walking up parent nodes, and I widened that search from 3 levels to
6 — but I could only verify it compiles and starts, never that it finds the
panels in a real 4.7 layout. **This is the single most likely thing to be
broken.**

Do it in **4.7.2 first** (most likely to fail), then 4.6.3.

1. Open a project, enable the plugin (see Setup below).
2. Open any `.gd` script, click the gutter to set a breakpoint in a function
   that actually runs.
3. Press **F5** to play. Wait for it to hit the breakpoint.
4. With the game paused, ask me — or your MCP client — for:
   - `godot_get_stack_trace`
   - `godot_get_locals`
   - `godot_get_output`

- [ ] **4.7.2** — stack trace returns frames with **non-zero line numbers**
- [ ] **4.7.2** — locals returns real variable names and values, not `[]`
- [ ] **4.7.2** — output returns your game's `print()` lines
- [ ] **4.6.3** — same three

> ❗ If these come back empty on 4.7 but work on 4.6, that is exactly the
> ancestor-window problem. Tell me and I'll switch to a name-based search
> instead of a depth-limited one.

## A2. Real-project scene round-trip ⭐ highest value

**Why:** my fixtures are synthetic and small. Your real scenes have tilemaps,
animations, multi-line sub-resources and node paths that mine don't.

Use a project with **instanced scenes and editable children** — `hammerang`
or `tetris_inventory` look right.

1. `git status` — make sure it's clean first.
2. Ask me to run `godot_set_property_in_file` on one node in one scene.
3. `git diff` that file.

- [ ] Exactly one line differs — the property you changed
- [ ] No `unique_id=` line changed or vanished
- [ ] No `[editable path=...]` line vanished
- [ ] No blank-line-only churn anywhere
- [ ] `groups=[...]` intact
- [ ] Now open that scene in Godot, **Ctrl+S**, and `git diff` again — Godot
      should not rewrite anything you didn't touch

> ⚠️ One expected difference: a node **added** by the MCP tools has no
> `unique_id` until Godot next saves. You'll see Godot add one attribute to
> that node alone. That's correct — inventing an id could collide.

## A3. Plugin starts in a real editor

**Why:** I replaced the deprecated `get_editor_interface()` with the
`EditorInterface` singleton. Verified headless, but not with real docks.

- [ ] **4.6.3** — `[Claude Bridge] Started on port 6008` in the Output panel
- [ ] **4.7.2** — same
- [ ] Neither shows red errors mentioning `EditorInterface`, `Invalid call`,
      or `nonexistent function`
- [ ] Disable then re-enable the plugin — `Stopped` then `Started`, no errors

---

# Setup (once per project, per version)

⚠️ **The plugin is NOT installed by `install.sh`.** It's a manual copy, and
your existing projects still have the **old** plugin — including the pre-fix
`bridge_server.gd`. You must re-copy it or A4 below will fail.

```bash
cp -R ~/Documents/Claude/Projects/godot-mcp/plugin/addons/godot_mcp_bridge \
      /path/to/your/project/addons/
```

Then in Godot: **Project → Project Settings → Plugins → enable "Claude Bridge"**.

To open a specific version:

```bash
open "/Users/medrive/Documents/Claude/Games/Godot IDE/Godot_v4.7.2-stable_macos.universal.app"
```

---

# Part B — worth doing once

## A4. Signal connect with no scene open

The 4.7 bug I found and fixed. Needs the **re-copied** plugin.

1. In 4.7.2, close all scenes (**Scene → Close All**), leave the editor open.
2. Ask for `godot_connect_signal` on any node.

- [ ] You get "Runtime connection only — no open scene found for persistence"
- [ ] You do **not** get `EISDIR` or "illegal operation on a directory"

## A5. Screenshots and running

Untested by me — needs a real display, since the plugin renders through
`SubViewport.get_texture()`.

- [ ] `godot_run_project` starts the game
- [ ] `godot_take_screenshot` returns an actual image
- [ ] `godot_stop_project` stops it

## A6. Which Godot your client actually uses

Detection now prefers the **newest** install. It was silently using 4.5.1
before; it now resolves 4.7.2.

- [ ] Ask me for `godot_get_version` — confirm it says what you expect

To pin a version instead, set it in your `.mcp.json`:

```bash
export GODOT_PATH="/Users/medrive/Documents/Claude/Games/Godot.app/Contents/MacOS/Godot"
```

## A7. Re-install the server

`install.sh` now derives `GODOT_PATH` from the same resolver the server uses,
instead of its own stale list that only knew 4.3–4.5.

```bash
./scripts/install.sh
```

- [ ] Prints `Found Godot at: .../Godot_v4.7.2-.../Godot` — not a warning

---

# Already verified — no action needed

Automated against **all three installs: 4.5.1, 4.6.3, 4.7.2**.

| Check | Result |
|---|---|
| 18 engine-written fixtures round-trip byte-identically | ✅ |
| Real MCP server driven over stdio by an MCP client — 50 tool assertions | ✅ |
| MCP-written scenes reload in the engine, groups/instances/editable/binds intact | ✅ |
| MCP over the **live bridge**: `godot_open_scene`, `godot_get_scene_tree`, `godot_connect_signal` | ✅ |
| Signal persistence keeps every `unique_id`, `[editable]`, group, instance link | ✅ |
| All 13 plugin GDScript files compile | ✅ |
| Plugin `_enter_tree` runs, bridge binds 6008, clean shutdown | ✅ |
| `StreamPeerTCP.STATUS_*` and moved `TCPServer` methods resolve | ✅ (audit item 3) |
| `.tres` `ext_resource` sections preserved — no orphaned references | ✅ |
| 258 unit tests, lint and build clean | ✅ |

Earlier versions are covered explicitly, not incidentally: 4.5.1 writes
`load_steps` and no `unique_id`; 4.6+ does the reverse. The parser reproduces
each exactly rather than imposing one version's conventions on the other.

**What none of this reaches:** the real editor's dock layout (A1, A3), a
real display (A5), and your actual project files (A2).

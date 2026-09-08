# Manual test checklist — Godot 4.6 / 4.7 compatibility

Everything that can be checked without a human at the keyboard has been
automated and passes (see "Already verified" at the bottom). What remains
needs the **editor GUI**, because the plugin returns early under
`--headless` and the debugger UI it scrapes only exists in a real editor
window.

Run this once against **4.6.3** and once against **4.7.2**.

```bash
open "/Users/medrive/Documents/Claude/Games/Godot IDE/Godot_v4.7.2-stable_macos.universal.app"
```

---

## Setup (once per version)

1. Open one of your real projects — `hammerang` or `tetris_inventory` are
   good candidates because they have instanced scenes and signal connections.
2. Install the plugin into it:
   ```bash
   ./scripts/install.sh
   ```
3. **Project → Project Settings → Plugins → enable "godot_mcp_bridge"**.
4. Check the **Output** panel for `[Claude Bridge] Started on port 6008`.
   - ❗ If you see a script error instead, stop and paste it to me.

---

## 1. Editor bridge comes up (tests the `EditorInterface` singleton change)

- [ ] `[Claude Bridge] Started on port 6008` appears in Output.
- [ ] No red errors mentioning `get_editor_interface`, `EditorInterface`,
      or `Invalid call`.
- [ ] Disable and re-enable the plugin — `[Claude Bridge] Stopped` then
      `Started` again, with no errors.

*Why manual:* I ran `_enter_tree` headlessly on both versions and the bridge
started cleanly, but headless skips the real editor dock layout.

## 2. Debugger panel scraping (tests the widened ancestor window)

This is the **most exposed** change — 4.7 reorganized the editor's dock
hierarchy, and the plugin finds panels by walking ancestors.

1. Open a script, set a breakpoint (click the gutter), press **F5** to run.
2. When it breaks, ask me (or your MCP client) to run:
   - `godot_get_stack_trace`
   - `godot_get_locals`
   - `godot_get_output`
- [ ] Stack trace returns real frames with **non-zero line numbers**.
- [ ] Locals returns actual variable names/values, not an empty list.
- [ ] Output returns the game's `print()` lines.

❗ If any come back empty on 4.7 but work on 4.6, that is the ancestor-window
issue — tell me and I'll widen it further or switch to a name-based search.

## 3. Signal connect with **no scene open** (the 4.7 bug I fixed)

1. Close all scenes (Scene → Close All), keep the editor open.
2. Ask for `godot_connect_signal` on any node.
- [ ] You get "Runtime connection only — no open scene found for persistence".
- [ ] You do **not** get an `EISDIR` or "illegal operation on a directory" error.

*This one I reproduced and fixed, but only against a headless editor.*

## 4. Round-trip a real scene through the editor

The strongest end-to-end check, and the one that matters for your repos.

1. Pick a scene with an **instanced child** and **editable children**.
2. `git status` should be clean.
3. Ask me to `godot_set_property_in_file` on one node.
4. Back in Godot, **reload the scene** (it will prompt) and **Ctrl+S**.
5. `git diff` that file.
- [ ] Only the property you changed differs.
- [ ] No `unique_id=` lines changed or disappeared.
- [ ] No `[editable path=...]` lines disappeared.
- [ ] No blank-line-only churn.

⚠️ Expected and harmless: a node **you added** via the MCP tools has no
`unique_id` until Godot next saves the scene, at which point Godot assigns
one. That shows as one added attribute on that node only.

## 5. Screenshot / run tools (unchanged, but worth a smoke test)

- [ ] `godot_run_project` then `godot_take_screenshot` returns an image.
- [ ] `godot_stop_project` stops it.

---

## Already verified — no action needed

Automated against **both 4.6.3 and 4.7.2**:

| Check | Result |
|---|---|
| All 8 engine-written fixtures round-trip byte-identically | ✅ |
| Godot loads scenes after our edits; groups, instances, editable state, connections + binds all intact | ✅ |
| All 13 plugin GDScript files compile | ✅ |
| Plugin `_enter_tree` runs, bridge binds port 6008, clean shutdown | ✅ |
| Live JSON-RPC over the bridge (`editor.status`, `scene.get_tree`) | ✅ |
| `StreamPeerTCP.STATUS_*` + moved `TCPServer`/`StreamPeerTCP` methods resolve | ✅ (audit item 3) |
| `findGodotPath()` now resolves 4.7.2 instead of 4.5.1 | ✅ |
| 238 unit tests | ✅ |

### Note on which Godot the MCP server now uses

Auto-detection now prefers the **newest** install it finds, so it resolves to
**4.7.2** on this machine (it was silently using 4.5.1 before). To pin a
specific version:

```bash
export GODOT_PATH="/Users/medrive/Documents/Claude/Games/Godot.app/Contents/MacOS/Godot"
```

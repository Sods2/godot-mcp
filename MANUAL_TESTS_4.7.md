# Step-by-step verification — Godot 4.5 / 4.6 / 4.7

Follow these in order. Every path and filename below is real on this machine.

**Time:** Part 1 ≈ 5 min · Part 2 ≈ 10 min · Part 3 ≈ 10 min

> Since I last handed you a list, a corpus run over all 205 `.tscn`/`.tres`
> files in `~/Documents/Claude/Games` found two more pre-existing bugs
> (truncated multi-line strings, rewritten `load_steps`). Both are fixed —
> all 205 now round-trip byte-identically. **Step 2 is where you confirm that
> on your own repo.**

---

# Part 1 — Install (do this first)

### Step 1.1 — Reinstall the MCP server

```bash
cd ~/Documents/Claude/Projects/godot-mcp && ./scripts/install.sh
```

✅ **Expect** the last lines to include:

```
Found Godot at: /Users/medrive/Documents/Claude/Games/Godot IDE/Godot_v4.7.2-stable_macos.universal.app/Contents/MacOS/Godot
```

❌ If it says `WARNING: Could not find Godot automatically`, stop and tell me.

### Step 1.2 — Restart your MCP client

Quit and reopen Claude Code (or whatever client holds the server), so it
picks up the rebuilt server.

### Step 1.3 — Confirm which Godot it's using

Ask me: **"run godot_get_version"**

✅ **Expect** `4.7.2.stable.official.ed1daf0bf`

> It was silently using **4.5.1** before this work. If you'd rather pin 4.5,
> set `GODOT_PATH` in your `.mcp.json` and tell me — don't just accept 4.7 if
> your projects target 4.5. **All your projects declare `config/features =
> "4.5"`,** so opening them in 4.7 will prompt to upgrade. See the warning in
> Step 2.1.

---

# Part 2 — Verify your real scene files ⭐ most important

This is the one that protects your repos. **No Godot editor needed for 2.1–2.4.**

### Step 2.1 — Pick the target and check it's clean

```bash
cd ~/Documents/Claude/Games/hammerang && git status --short
```

✅ **Expect** exactly two modified files:
`src/digging/Carousel/digging_carousel.gd` and `.tscn`

If anything else is listed, commit or stash first so the diff is readable.

> ⚠️ **Do not open hammerang in 4.6 or 4.7 yet.** It targets 4.5, and opening
> it in a newer editor will rewrite files project-wide. Steps 2.1–2.4 don't
> need the editor at all. Only Step 3 opens an editor, and it uses a
> throwaway copy.

### Step 2.2 — Have me edit a real scene

Ask me: **"in hammerang, set `offset_left` to `-171.0` on
`UI/MarginContainer/GridContainer/Hideout/TextureButton` in
`res://src/scenes/digging/digging.tscn`"**

That node already has `offset_left = -170.5` on line 161, so a correct edit
replaces exactly one existing line — which is what makes the diff below a
clean pass/fail signal.

### Step 2.3 — Inspect the diff

```bash
cd ~/Documents/Claude/Games/hammerang && git diff --stat src/scenes/digging/digging.tscn
```

✅ **Expect** `1 file changed, 1 insertion(+), 1 deletion(-)`

```bash
cd ~/Documents/Claude/Games/hammerang && git diff src/scenes/digging/digging.tscn
```

- [ ] Exactly one `-` line and one `+` line
- [ ] The change is the property I edited, nothing else
- [ ] No `load_steps=` change on line 1
- [ ] No `uid=` reordering in the `[ext_resource]` lines
- [ ] No blank lines added or removed

❌ **Any other change is a bug — send me the diff.**

### Step 2.4 — Revert

```bash
cd ~/Documents/Claude/Games/hammerang && git checkout src/scenes/digging/digging.tscn
```

---

# Part 3 — Verify the editor plugin

⚠️ **Use a throwaway copy**, so a 4.7 upgrade prompt can't touch your real work.

### Step 3.1 — Make the sandbox

```bash
rm -rf /tmp/godot-plugin-test && cp -R ~/Documents/Claude/Games/hammerang /tmp/godot-plugin-test && rm -rf /tmp/godot-plugin-test/.git
```

### Step 3.2 — Install the plugin into it

The plugin is **not** installed by `install.sh` — it's a manual copy, and
this is why your existing projects still hold the pre-fix version.

```bash
mkdir -p /tmp/godot-plugin-test/addons && cp -R ~/Documents/Claude/Projects/godot-mcp/plugin/addons/godot_mcp_bridge /tmp/godot-plugin-test/addons/
```

### Step 3.3 — Open it in 4.7.2

```bash
open -a "/Users/medrive/Documents/Claude/Games/Godot IDE/Godot_v4.7.2-stable_macos.universal.app" /tmp/godot-plugin-test/project.godot
```

Accept the "convert project" prompt if it appears — it's a throwaway copy.

### Step 3.4 — Enable the plugin

**Project → Project Settings → Plugins →** tick **Claude Bridge**.

- [ ] Output panel shows `[Claude Bridge] Started on port 6008`
- [ ] No red errors mentioning `EditorInterface` or `Invalid call`
- [ ] Untick and re-tick → `Stopped` then `Started`, still no errors

### Step 3.5 — Debugger panels at a breakpoint ⭐ highest risk

**This is the single thing most likely to be broken.** 4.7 reorganised the
editor's dock hierarchy; the plugin finds panels by walking up parent nodes,
and I widened that search from 3 to 6 levels. I confirmed it compiles and
starts, but never that it *finds* the panels in a real 4.7 layout.

1. Open `src/scenes/digging/digging.gd` in the script editor.
2. Find a line inside `_ready()` and **click the gutter** to set a breakpoint
   (a red dot appears).
3. Press **F5** to run the project.
4. Wait for it to pause at the breakpoint.
5. With it paused, ask me: **"get the stack trace, locals, and output"**

- [ ] Stack trace returns frames with **non-zero line numbers**
- [ ] Locals returns real variable names and values, not `[]`
- [ ] Output returns your `print()` lines

❌ If these are empty on 4.7 but fine on 4.6, that's the ancestor window —
tell me and I'll switch to a name-based search.

6. Press **F8** to stop.

### Step 3.6 — Signal connect with no scene open

1. **Scene → Close All** (keep the editor open).
2. Ask me: **"connect a signal on any node"**

- [ ] I report *"Runtime connection only — no open scene found for persistence"*
- [ ] I do **not** report `EISDIR` or "illegal operation on a directory"

### Step 3.7 — Screenshots and running

Untested by me — needs a real display.

- [ ] Ask me to **"run the project and take a screenshot"** → returns an image
- [ ] Ask me to **"stop the project"** → it stops

### Step 3.8 — Repeat 3.3–3.6 in 4.6.3

```bash
rm -rf /tmp/godot-plugin-test-46 && cp -R ~/Documents/Claude/Games/hammerang /tmp/godot-plugin-test-46 && rm -rf /tmp/godot-plugin-test-46/.git && mkdir -p /tmp/godot-plugin-test-46/addons && cp -R ~/Documents/Claude/Projects/godot-mcp/plugin/addons/godot_mcp_bridge /tmp/godot-plugin-test-46/addons/
```

```bash
open -a "/Users/medrive/Documents/Claude/Games/Godot IDE/Godot_v4.6.3-stable_macos.universal.app" /tmp/godot-plugin-test-46/project.godot
```

### Step 3.9 — Clean up

```bash
rm -rf /tmp/godot-plugin-test /tmp/godot-plugin-test-46
```

---

# When you're done

Tell me which boxes failed. If everything passes, the branch
`feature/godot-4.7-compat` is ready and I'll walk you through merging.

---

# Already verified — no action needed

Automated against **all three installs: 4.5.1, 4.6.3, 4.7.2**.

| Check | Result |
|---|---|
| **All 205 real `.tscn`/`.tres` files in `~/Documents/Claude/Games` round-trip byte-identically** | ✅ |
| 21 engine-written fixtures round-trip byte-identically | ✅ |
| Real MCP server driven over stdio by an MCP client — 50 tool assertions | ✅ |
| MCP-written scenes reload in the engine; groups, instances, editable, binds intact | ✅ |
| MCP over the **live bridge**: `godot_open_scene`, `godot_get_scene_tree`, `godot_connect_signal` | ✅ |
| Signal persistence keeps every `unique_id`, `[editable]`, group, instance link | ✅ |
| All 13 plugin GDScript files compile | ✅ |
| Plugin `_enter_tree` runs, bridge binds 6008, clean shutdown | ✅ |
| `StreamPeerTCP.STATUS_*` and moved `TCPServer` methods resolve | ✅ (audit item 3) |
| `.tres` `ext_resource` preserved — no orphaned references | ✅ |
| Multi-line string and dictionary properties preserved | ✅ |
| 270 unit tests, lint and build clean | ✅ |

**What none of this reaches:** the real editor's dock layout (3.4, 3.5) and a
real display (3.7). That's the whole reason Part 3 exists.

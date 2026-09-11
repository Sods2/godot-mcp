# Step-by-step verification — Godot 4.5 / 4.6 / 4.7

Follow these in order. Every path and filename below is real on this machine.

**Time:** Part 1 ≈ 5 min · Part 2 ≈ 10 min · Part 3 ≈ 2 min

> Most of this is now done. Using `new-godot-mcp-tester-project` I drove the
> **real GUI editor** on all three versions over MCP — including breakpoints,
> stack traces, output and screenshots. **Part 3 is now a results table, not a
> task list.**
>
> What still needs you: **Part 2** (one diff against your own repo) and
> **Step 3.1** (stopping the game, which was never recorded).

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

✅ **Expect `4.5.1`** in any of your existing projects — and that is correct.
Every one of your `.mcp.json` files already pins:

```
"GODOT_PATH": "/Users/medrive/Documents/Claude/Games/Godot.app/Contents/MacOS/Godot"
```

`GODOT_PATH` wins over auto-detection, so the "prefers newest" change does
**not** alter behaviour in your existing projects. It only applies where no
`GODOT_PATH` is pinned — such as `new-godot-mcp-tester-project`, where you'd
get `4.7.2`.

> ⚠️ Keep it pinned to 4.5.1 for now. All your projects declare
> `config/features "4.5"`, and `godot_launch_editor` opens the project with
> whichever binary is configured. I verified that opening a 4.5 project in the
> **4.7 GUI editor rewrites `project.godot` on contact** — `config/features`
> becomes 4.7 and an `[animation]` compatibility block is added. Headless runs
> and imports do *not* do this; only the editor does.

### Step 1.4 — Fix the two projects pointing at a server that isn't there

`Corner-Grocer` and `Dice` reference
`~/.claude/mcp-servers/godot-claude-mcp/`, which does not exist — only
`godot-mcp` does. Their Godot MCP server has been silently dead.

```bash
sed -i '' 's#mcp-servers/godot-claude-mcp/build#mcp-servers/godot-mcp/build#' ~/Documents/Claude/Games/Corner-Grocer/.mcp.json ~/Documents/Claude/Games/Dice/.mcp.json
```

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

# Part 3 — Editor plugin: mostly verified for you

Using `new-godot-mcp-tester-project`, I launched the **real GUI editor** on
all three versions with the plugin enabled and drove it over MCP. Results
were identical on 4.5.1, 4.6.3 and 4.7.2 — **everything passed** on each:

| Check | 4.5.1 | 4.6.3 | 4.7.2 |
|---|:--:|:--:|:--:|
| Plugin starts, bridge on 6008, real docks | ✅ | ✅ | ✅ |
| `godot_editor_status` connected | ✅ | ✅ | ✅ |
| `godot_open_scene` + `godot_get_scene_tree` | ✅ | ✅ | ✅ |
| `godot_get_node_properties` | ✅ | ✅ | ✅ |
| `godot_set_breakpoint` / `godot_list_breakpoints` | ✅ | ✅ | ✅ |
| `godot_run_scene` | ✅ | ✅ | ✅ |
| **`godot_get_stack_trace` — frames with real line numbers** | ✅ | ✅ | ✅ |
| **`godot_get_output` — the game's print() lines** | ✅ | ✅ | ✅ |
| `godot_get_locals` | ✅ | ✅ | ✅ |
| `godot_take_screenshot` — a real editor PNG | ✅ | ✅ | ✅ |
| **`godot_take_game_screenshot` — a real frame from the running game** | ✅ | ✅ | ✅ |
| `godot_take_game_screenshot` with no game running — a clear error | ✅ | ✅ | ✅ |

**The highest-risk item passed.** Stack trace and output both go through
`_find_node_of_class` and the ancestor window I widened, and both work on
4.7's reorganised dock hierarchy.

## `godot_get_locals` — found broken, now fixed

It returned `[]` on every version including 4.5.1, so it had never worked.
Two causes: the debugger session's `stack_frame_vars` reply never reaches the
plugin (Godot routes core messages to the built-in debugger, not to plugin
captures), and the UI fallback scanned for `Tree` nodes when Godot actually
shows stack variables in an `EditorDebuggerInspector`.

Now reads that inspector. Verified over MCP against a real GUI editor on all
three versions — locals, members and values all return, each tagged with its
scope.

## Screenshots — found broken, now fixed

`godot_take_game_screenshot` returned a 2x2 PNG that was not the game — it
captured the 2D editor's viewport. Godot runs the game as a separate process
and, since 4.4, embeds its window rather than rendering into a SubViewport, so
the editor has no game texture to read. Separately, both screenshot tools
crashed the MCP call on any error instead of showing the message.

The game now captures itself: the plugin adds a `ClaudeBridgeGameCapture`
autoload that reads the game's own viewport and sends the PNG back over the
debugger connection. Verified over MCP against a real GUI editor on all three
versions — `godot_take_screenshot` returns a real editor PNG, the autoload
installs itself, a real game frame comes back, and with no game running the
tool reports a clear error instead of hanging.

## What's left for you: Step 3.1 — stopping the game

Screenshots are verified (above). The one plugin action never recorded is
stopping the game, so check it once.

Open the tester project:

```bash
open -a "/Users/medrive/Documents/Claude/Games/Godot IDE/Godot_v4.7.2-stable_macos.universal.app" "/Users/medrive/Documents/Claude/Games/Godot IDE/new-godot-mcp-tester-project/project.godot"
```

The plugin is already installed and enabled there, and `main.tscn` is the main
scene.

- [ ] Ask me to **"run the project, then stop it"** → it starts, then stops

# When you're done

Tell me which boxes failed.

---

# Already verified — no action needed

Exactly three Godot installs exist on this machine, and **every check below
ran on all three**:

- `4.5.1` — `~/Documents/Claude/Games/Godot.app`
- `4.6.3` — `~/Documents/Claude/Games/Godot IDE/Godot_v4.6.3-stable_macos.universal.app`
- `4.7.2` — `~/Documents/Claude/Games/Godot IDE/Godot_v4.7.2-stable_macos.universal.app`

(No Godot on `PATH`, none in `/Applications`, `~/Applications`, Steam or
Homebrew.)

| Check | 4.5.1 | 4.6.3 | 4.7.2 |
|---|:--:|:--:|:--:|
| Fixtures generated by the engine, then round-tripped byte-identically | ✅ | ✅ | ✅ |
| Engine reloads MCP-written scenes — groups, instances, editable, binds intact | ✅ | ✅ | ✅ |
| Real MCP server over stdio — file tools, 50 assertions | ✅ | ✅ | ✅ |
| MCP over the headless editor bridge | ✅ | ✅ | ✅ |
| MCP scene ops + signal persistence keeps every `unique_id` / `[editable]` | ✅ | ✅ | ✅ |
| **Real GUI editor over MCP — breakpoint, stack trace, output** | ✅ | ✅ | ✅ |
| All 13 plugin GDScript files compile | ✅ | ✅ | ✅ |
| `StreamPeerTCP.STATUS_*` + moved `TCPServer` methods resolve | ✅ | ✅ | ✅ |
| `godot_get_locals` | ✅ | ✅ | ✅ |
| Screenshots — editor, running game, and no-game error | ✅ | ✅ | ✅ |

Version-independent (parser only, no engine involved):

| Check | Result |
|---|---|
| All 205 real `.tscn`/`.tres` files in `~/Documents/Claude/Games` round-trip byte-identically | ✅ |
| 274 unit tests, lint and build clean | ✅ |

**Not recorded:** stopping the game — see Step 3.1.

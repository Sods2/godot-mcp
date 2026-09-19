/**
 * End-to-end test for the editor-bridge tools.
 *
 * Boots a real Godot editor with the godot_mcp_bridge addon on a throwaway
 * project, then drives the tools the way a client does — through the MCP server
 * (build/index.js) over the TCP bridge on 127.0.0.1:6008 — and asserts the
 * editor actually changed. This is the only check that exercises the full path
 * MCP -> bridge -> live editor; the vitest suite mocks the bridge.
 *
 * The addon disables itself under `--headless` (no DisplayServer), so this runs
 * the full editor. In CI it must run under a virtual display: `xvfb-run -a`.
 *
 * Requires GODOT_PATH (or `godot` on PATH). Exits non-zero on any failure.
 */
import { spawn } from "node:child_process";
import net from "node:net";
import { mkdtempSync, rmSync, cpSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const GODOT = process.env.GODOT_PATH || "godot";
const PORT = 6008;
const HOST = "127.0.0.1";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function portOpen() {
  return new Promise((res) => {
    const s = net.createConnection({ host: HOST, port: PORT });
    s.once("connect", () => {
      s.destroy();
      res(true);
    });
    s.once("error", () => res(false));
  });
}

async function waitForPort(timeoutMs, shouldAbort = () => false) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portOpen()) return true;
    if (shouldAbort()) return false;
    await sleep(1500);
  }
  return false;
}

// --- minimal MCP stdio client -------------------------------------------------
function createMcpClient(env) {
  const srv = spawn("node", [path.join(REPO, "build", "index.js")], {
    env,
    stdio: ["pipe", "pipe", "inherit"],
  });
  let buf = "";
  const waiters = new Map();
  srv.stdout.on("data", (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let m;
      try {
        m = JSON.parse(line);
      } catch {
        continue;
      }
      if (m.id && waiters.has(m.id)) {
        waiters.get(m.id)(m);
        waiters.delete(m.id);
      }
    }
  });
  let idc = 0;
  const rpc = (id, method, params) =>
    new Promise((res) => {
      if (id != null) waiters.set(id, res);
      srv.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", ...(id != null ? { id } : {}), method, params }) + "\n"
      );
      if (id == null) res();
    });
  return {
    proc: srv,
    async init() {
      await rpc(++idc, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "bridge-harness", version: "1" },
      });
      await rpc(null, "notifications/initialized", {});
    },
    async call(name, args = {}) {
      const r = await rpc(++idc, "tools/call", { name, arguments: args });
      const text =
        r.result?.content?.map((c) => c.text ?? "").join("") ??
        JSON.stringify(r.error ?? r.result);
      return { raw: r, text, first: r.result?.content?.[0] };
    },
    stop() {
      try {
        srv.stdin.end();
      } catch {
        /* ignore */
      }
      srv.kill();
    },
  };
}

// --- assertions ---------------------------------------------------------------
const results = [];
function check(label, cond, detail = "") {
  results.push({ label, ok: !!cond, detail });
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}${cond || !detail ? "" : "  -> " + detail}`);
}

async function run() {
  // 1. Throwaway project with the addon enabled + a starter scene.
  const proj = mkdtempSync(path.join(tmpdir(), "godot-mcp-bridge-"));
  cpSync(path.join(REPO, "plugin", "addons"), path.join(proj, "addons"), {
    recursive: true,
  });
  writeFileSync(
    path.join(proj, "project.godot"),
    [
      "config_version=5",
      "",
      "[application]",
      'config/name="BridgeE2E"',
      'config/features=PackedStringArray("4.3")',
      'run/main_scene="res://main.tscn"',
      "",
      "[editor_plugins]",
      "",
      'enabled=PackedStringArray("res://addons/godot_mcp_bridge/plugin.cfg")',
      "",
    ].join("\n"),
    "utf-8"
  );
  writeFileSync(
    path.join(proj, "main.tscn"),
    [
      '[gd_scene format=3 uid="uid://bridgee2e01"]',
      "",
      '[node name="Main" type="Node2D"]',
      "",
      '[node name="Player" type="Sprite2D" parent="."]',
      "",
      '[node name="Anim" type="AnimationPlayer" parent="."]',
      "",
      '[node name="Btn" type="Button" parent="."]',
      "",
    ].join("\n"),
    "utf-8"
  );

  // 2. Launch the editor (inherits DISPLAY; wrap the whole command in xvfb-run
  //    on a headless host). GODOT_EDITOR_ARGS lets CI force a software renderer,
  //    e.g. "--rendering-driver opengl3".
  const extraArgs = (process.env.GODOT_EDITOR_ARGS || "").split(" ").filter(Boolean);
  const editorArgs = ["--editor", "--path", proj, ...extraArgs];
  console.log(`Launching editor: ${GODOT} ${editorArgs.join(" ")}`);
  const editor = spawn(GODOT, editorArgs, {
    stdio: "ignore",
    detached: false,
  });
  let editorExited = null;
  let editorSpawnError = null;
  editor.on("exit", (code) => {
    editorExited = code;
  });
  editor.on("error", (err) => {
    editorSpawnError = err;
  });

  let client = null;
  const cleanup = () => {
    if (client) client.stop();
    try {
      editor.kill();
    } catch {
      /* ignore */
    }
    try {
      rmSync(proj, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };

  try {
    console.log("Waiting for bridge on 6008 ...");
    const up = await waitForPort(
      180000,
      () => editorSpawnError !== null || editorExited !== null
    );
    if (editorSpawnError) {
      throw new Error(
        `Could not launch Godot ("${GODOT}"): ${editorSpawnError.message}. ` +
          `Set GODOT_PATH to a Godot binary.`
      );
    }
    if (!up) {
      throw new Error(
        `Bridge never opened on ${HOST}:${PORT} (editor exit=${editorExited}). ` +
          `On a headless host, run under xvfb-run.`
      );
    }
    console.log("Bridge up.");

    // 3. MCP client; wait for the bridge socket to connect.
    client = createMcpClient({ ...process.env, GODOT_PATH: GODOT });
    await client.init();
    let connected = false;
    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      const st = await client.call("godot_editor_status");
      if (/"connected":\s*true/.test(st.text)) {
        connected = true;
        break;
      }
    }
    check("editor_status reports connected", connected);

    // 4. Drive representative handlers and assert the editor actually changed.
    const tree0 = await client.call("godot_get_scene_tree");
    check("scene tree has root Main", /"name":\s*"Main"/.test(tree0.text));
    check("scene tree lists Player", /"name":\s*"Player"/.test(tree0.text));

    const add = await client.call("godot_add_node", {
      scene_path: "res://main.tscn",
      parent_path: ".",
      node_type: "Label",
      node_name: "Probe",
    });
    check("add_node succeeds", /"success":\s*true/.test(add.text));
    const tree1 = await client.call("godot_get_scene_tree");
    check("added node appears in tree", /"name":\s*"Probe"/.test(tree1.text));

    // composite property must round-trip through coercion
    const setp = await client.call("godot_set_property", {
      node_path: "Player",
      property: "position",
      value: { x: 200, y: 100 },
    });
    check("set_property Vector2 succeeds", /"success":\s*true/.test(setp.text));
    const props = await client.call("godot_get_node_properties", {
      node_path: "Player",
    });
    check(
      "position reads back as (200, 100)",
      /\(200(\.0)?,\s*100(\.0)?\)/.test(props.text),
      props.text.slice(0, 120)
    );

    // honest failure: setting an Object property with a string is rejected
    const bad = await client.call("godot_set_property", {
      node_path: "Player",
      property: "texture",
      value: "res://nope.png",
    });
    check("set_property reports honest failure on bad value", /"success":\s*false/.test(bad.text));

    const rename = await client.call("godot_rename_node", {
      node_path: "Probe",
      new_name: "Probe2",
    });
    check("rename_node succeeds", /"success":\s*true/.test(rename.text));

    const conn = await client.call("godot_connect_signal", {
      from_path: "Btn",
      signal_name: "pressed",
      to_path: "Player",
      method: "queue_free",
    });
    check("connect_signal succeeds", /"success":\s*true/.test(conn.text));
    const conns = await client.call("godot_list_connections", { node_path: "Btn" });
    check("list_connections shows the connection", /"method":\s*"queue_free"/.test(conns.text));

    const anim = await client.call("godot_create_animation", {
      node_path: "Anim",
      animation_name: "wiggle",
      length: 1.0,
    });
    check("create_animation succeeds", /"success":\s*true/.test(anim.text));
    const anims = await client.call("godot_list_animations", { node_path: "Anim" });
    check("list_animations shows it", /"wiggle"/.test(anims.text));

    const shot = await client.call("godot_take_screenshot");
    check(
      "take_screenshot returns PNG image data",
      shot.first?.type === "image" && (shot.first?.data?.length ?? 0) > 1000
    );

    const save = await client.call("godot_save_scene");
    check("save_scene succeeds", /"success":\s*true/.test(save.text));
  } finally {
    cleanup();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nbridge-e2e: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    for (const f of failed) console.error(`  FAIL: ${f.label}${f.detail ? "  -> " + f.detail : ""}`);
    process.exit(1);
  }
}

run().catch((e) => {
  console.error("bridge-e2e ERROR:", e.message);
  process.exit(1);
});

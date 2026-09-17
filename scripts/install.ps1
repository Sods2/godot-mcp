# Windows installer for the godot-mcp server.
# Native PowerShell equivalent of scripts/install.sh, so Windows users don't
# need Git Bash (whose npm is often an old, crash-prone version).
#
# Usage (from the repo root):
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1

$ErrorActionPreference = "Stop"

$ScriptDir  = $PSScriptRoot
$ProjectDir = Split-Path -Parent $ScriptDir
$Dest       = Join-Path $env:USERPROFILE ".claude\mcp-servers\godot-mcp"

# --- Preflight: node and npm present and new enough ------------------------
# An old npm (<10) can crash while resolving this dependency tree with a
# cryptic "Cannot read properties of null (reading 'edgesOut')" and leave a
# half-installed server, so check up front and fail with a clear fix.
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "node is not on PATH. Install Node.js 18 or later from https://nodejs.org"
  exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error "npm is not on PATH. Install Node.js 18 or later from https://nodejs.org"
  exit 1
}

$NodeMajor = [int](& node -p 'process.versions.node.split(".")[0]')
if ($NodeMajor -lt 18) {
  Write-Error "Node.js 18 or later is required (found $(node --version))."
  exit 1
}

$NpmMajor = [int]((& npm --version).Split('.')[0])
if ($NpmMajor -lt 10) {
  Write-Warning "npm $(npm --version) is old and can crash while installing."
  Write-Warning "If this run fails, upgrade with: npm install -g npm@latest"
}

# --- Build -----------------------------------------------------------------
Push-Location $ProjectDir
& npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Error "Build failed."; exit 1 }
Pop-Location

# --- Install ---------------------------------------------------------------
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
Copy-Item -Recurse -Force (Join-Path $ProjectDir "build")        $Dest
Copy-Item -Recurse -Force (Join-Path $ProjectDir "scripts")      $Dest
Copy-Item          -Force (Join-Path $ProjectDir "package.json") $Dest

Push-Location $Dest
& npm install --omit=dev
$installExit = $LASTEXITCODE
Pop-Location

# Verify the dependency install actually landed. If npm failed or was
# interrupted, the copy above still leaves build/ and package.json in place,
# which looks installed but has no node_modules — the server would fail at
# startup with "Cannot find module '@modelcontextprotocol/sdk'". Fail loudly.
if (($installExit -ne 0) -or -not (Test-Path (Join-Path $Dest "node_modules\@modelcontextprotocol\sdk"))) {
  Write-Host ""
  Write-Error @"
dependency install failed — $Dest\node_modules is incomplete.
  Re-run with a current npm (>=10):
    cd "$Dest"; npm install --omit=dev
  If npm crashes with an 'edgesOut' error, first: npm install -g npm@latest
"@
  exit 1
}

Write-Host "Installed to $Dest"
Write-Host ""

# --- Auto-detect Godot -----------------------------------------------------
# Delegate to the server's own resolver so this script and the running server
# can never disagree about which Godot is used.
Push-Location $Dest
$DetectedGodot = & node -e "import('./build/godot-path.js').then((m) => m.findGodotPath()).then((p) => console.log(p)).catch(() => process.exit(1))" 2>$null
Pop-Location

if ($DetectedGodot) {
  Write-Host "Found Godot at: $DetectedGodot"
  $GodotPathValue = $DetectedGodot
} else {
  Write-Host "WARNING: Could not find Godot automatically."
  Write-Host "  - Set GODOT_PATH in your .mcp.json to the full path of the Godot .exe,"
  Write-Host "    e.g. C:\Users\you\Desktop\Godot_v4.7.2-stable_win64.exe"
  $GodotPathValue = "C:\path\to\Godot.exe"
}

# JSON uses forward slashes so the paths need no escaping.
$DestJson  = ($Dest + "\build\index.js") -replace '\\', '/'
$GodotJson = $GodotPathValue -replace '\\', '/'

Write-Host ""
Write-Host "Add to your project's .mcp.json:"
Write-Host '{'
Write-Host '  "mcpServers": {'
Write-Host '    "godot": {'
Write-Host '      "command": "node",'
Write-Host "      `"args`": [`"$DestJson`"],"
Write-Host "      `"env`": { `"GODOT_PATH`": `"$GodotJson`" }"
Write-Host '    }'
Write-Host '  }'
Write-Host '}'

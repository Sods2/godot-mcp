# godot-claude-mcp

MCP server for full Godot IDE integration with Claude.

## Global Rules

See [RULES.md](../../Main/RULES.md) for rules that apply across all projects.

## Architecture

- TypeScript, ESM modules, strict mode
- Built on `@modelcontextprotocol/sdk` v1.x
- Entry point: `src/index.ts` → `build/index.js`
- Tools are organized under `src/tools/`

## Build

```bash
npm install
npm run build
```

## Install as MCP server

```bash
./scripts/install.sh
```

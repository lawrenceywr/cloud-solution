# Local Development Workflow

This repo is wired as a local OpenCode plugin through `.opencode/plugins/cloud-solution.js`, which imports `/root/cloud-solution/dist/index.js`.

That means edits under `src/**/*.ts` do not change the loaded plugin until you rebuild `dist/index.js` and then restart OpenCode.

The official OpenCode plugin docs say local plugins in `.opencode/plugins/` are loaded at startup. They do not document hot reload for local plugins, so this repo should be treated as restart-to-reload during development.

## Recommended local loop

1. Edit the plugin code in `src/`.
2. Run `bun run typecheck`.
3. Run targeted tests for the area you changed, when that area has test coverage.
4. Run `bun run build`.
5. Restart OpenCode so it loads the rebuilt plugin from `.opencode/plugins/cloud-solution.js`.

## Why the rebuild matters

`package.json` publishes the plugin entry at `dist/index.js`, and `.opencode/plugins/cloud-solution.js` imports that built file directly. If you only change TypeScript source and skip the build, OpenCode will keep loading the previous compiled output.

## Minimal command sequence

```text
bun run typecheck
# run targeted tests as needed
bun run build
# restart OpenCode
```

## Quick reload check

Use this checklist after restart:

* the restart happened after the latest successful build
* `.opencode/plugins/cloud-solution.js` still points at `/root/cloud-solution/dist/index.js`
* `.opencode/plugin-load.log` shows fresh `plugin.init` and `plugin.ready` entries from the new startup
* the plugin behavior you changed is visible in the new OpenCode session

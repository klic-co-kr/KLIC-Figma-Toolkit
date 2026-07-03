# Capture for Agents Review

Date: 2026-07-03

## Source

- Requested URL: `https://github.com/JakeB-5/capture-for-agent`
- Result: GitHub returned 404 for the singular repository name.
- Reviewed source: `https://github.com/JakeB-5/capture-for-agents` (`Yeogiyo!!`)
- Reviewed revision: `0de44d9 Merge pull request #3 from JakeB-5/feature/rename-yeogiyo`
- Local review clone: `/tmp/capture-for-agents`
- License: MIT

## What the Upstream Tool Does

`capture-for-agents` is a macOS Tauri screenshot annotation tool. Its valuable
portable idea is the agent handoff model:

- capture an implementation screenshot;
- add numbered point, rectangle, or arrow annotations;
- keep one shared number sequence as the join key;
- encode annotation coordinates in final image pixels;
- copy a plain-text CapNote block so an AI coding agent can match `[n]` notes to
  the visual markers.

The macOS pieces are not directly portable into a Figma plugin: global shortcuts,
`screencapture`, local filesystem writes, focus restore, and TCC permission checks
belong to the desktop shell.

## Integration Decision

The KLIC plugin already has a Figma-native Design QA flow:

- capture selected Figma design node;
- upload an implementation screenshot;
- draw difference rectangles;
- commit a persistent Figma board tagged with `qa-diff` provenance.

The added integration imports the handoff and annotation principles rather than
the desktop shell. The Design QA panel now supports:

- design node id and design dimensions;
- implementation screenshot dimensions;
- point, rectangle, and arrow annotations in one shared numbered sequence;
- pixel-space coordinates for each annotation;
- one numbered sequence aligned with the visual overlay and committed board;
- indented notes that can be pasted to an agent;
- canvas commit nodes for all three annotation kinds.

This intentionally uses `klic-qa-note v1` instead of claiming strict `capnote v1`
compatibility, because the Figma plugin sandbox cannot save a local PNG and place
an absolute image path in the clipboard.

## Verification

Upstream clone:

- `./node_modules/.bin/tsc --noEmit` passed.
- `./node_modules/.bin/eslint --quiet src` passed.
- `cargo check` in `src-tauri/` passed.
- `pnpm check` / `pnpm lint` were blocked before script execution by pnpm's
  `ERR_PNPM_IGNORED_BUILDS` approval gate for `esbuild`.

KLIC plugin:

- `node klic-figma-toolkit/run-ui-roundtrip-smoke.mjs` passed after adding the
  agent-note UI and point/rect/arrow encoder assertions.
- `node klic-figma-toolkit/run-local-verification.mjs` passed. In this macOS
  workspace it skipped Chrome visual smoke, Windows CMD smoke, and the PowerShell
  folder-maker parser because those host tools are unavailable.

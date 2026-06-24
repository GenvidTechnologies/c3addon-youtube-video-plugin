@CONVENTIONS.md

# c3addon-youtube-video-player

<!--
Project context for Claude Code. The genvid plugin's skills read this
file for project-specific facts the plugin can't infer. The
@CONVENTIONS.md import above brings in the plugin's contract.
-->

Construct 3 add-on (plugin) wrapping the YouTube IFrame Player API for use inside
Construct 3 games. TypeScript source in `src/` compiles to `dist/` via `tsc`,
then `dist/` is zipped into a `.c3addon` package.

> **Fork status:** forked from the Genvid GCore Video plugin. The identity,
> metadata and build pipeline have been rebranded for YouTube; the actual player
> integration in `src/c3runtime/dom/ElementHandler.ts` is a YouTube IFrame API
> scaffold/stub. Remaining work is tracked in the repo's GitHub issues.

## Commands

- Lint: `npm run lint`
- Build: `npm run build` (compiles `src/` → `dist/`, then copies assets)
- Validate (lint + build): `npm run lint && npm run build`
- Package: `npm run all:windows` / `npm run all:linux` (lint + build + zip `.c3addon`)
- Dev server: `npm run devmode`

There is no automated test suite.

## Architecture

- `src/plugin.ts` is **editor-side** (runs in the Construct 3 editor / at export,
  not in the game); only `src/c3runtime/**` runs in the game.
- All YouTube player-API coupling is isolated to `src/c3runtime/dom/ElementHandler.ts`;
  the runtime side talks to it through a generic message bridge.
- See [`docs/architecture.md`](docs/architecture.md) and
  [`docs/youtube-player-api.md`](docs/youtube-player-api.md).

## Debugging the player

This plugin wraps the [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
— a global `YT` namespace loaded from `https://www.youtube.com/iframe_api` that
replaces a container element with a YouTube `<iframe>`. For anything
player-internal — playback state, sizing, captions, quality, timing — **debug
empirically in a real browser** with [`test/player-test.html`](test/player-test.html)
(drive it headlessly via the Playwright MCP, or `npx http-server` + a browser):
running it settles in minutes what static analysis gets wrong over hours. See
`docs/youtube-player-api.md` for the plugin-specific gotchas.

## Commit Format

`<type> - <description>`, where `<type>` is one of `feat`, `fix`, or `chore`.

Examples:
- `feat - Remove SetIsSingleGlobal`
- `fix - Fix SecondEvents`
- `chore - Update README, clean up comment`

## Pull Request Format

Title typically mirrors the branch / ticket (e.g. `BUR-4919-no-low-latency`).
Body should summarize the change and how it was verified (lint + build, manual
test in Construct 3).

## Branching

- Base branch: `main`.
- Branch naming: `BUR-<ticket>-<kebab-description>` (e.g. `BUR-4919-no-low-latency`).
  Use `BUR-0000-...` when there is no associated ticket.
- Remote: GitHub (`genvid-holdings/c3addon-youtube-video-plugin`).

### Fork remotes — read before any `gh` command

This repo is a **fork** of `c3addon-gcore-video-plugin`, so it has two remotes:
`origin` = `genvid-holdings/c3addon-youtube-video-plugin` (this plugin) and
`upstream` = `genvid-holdings/c3addon-gcore-video-plugin` (the GCore original).

With two remotes, **unscoped `gh` commands can resolve to `upstream`** — e.g.
`gh issue list` / `gh repo view` may target the GCore repo, and the unscoped
`bugTracker` queries in `.genvid-agent.json` inherit the same default. A default
is set (`gh repo set-default genvid-holdings/c3addon-youtube-video-plugin`); if a
`gh` call ever hits the wrong repo, re-run that, or pass
`-R genvid-holdings/c3addon-youtube-video-plugin` explicitly. Pull GCore changes
to cherry-pick with `git fetch upstream`.

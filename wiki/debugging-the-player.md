---
type: practice-note
title: Debugging the player
description: How to debug player-internal behavior empirically with test/player-test.html and the Playwright MCP, what the harness does and does not verify, and verifying helpers and the runtime reducer in Node.
tags: [debugging, testing, playwright, harness, youtube]
stale_after: 2027-04-21
generated: { by: process:maintain-wiki, at: 2026-10-21T00:00:00Z }
sources:
  - id: gotchas
    resource: ../raw/2026-10-21-claude-md-gotchas.md
    title: Capture of five CLAUDE.md gotcha sections at commit fb7fccf (this page - Debugging the player)
    last_modified: 2026-10-21
  - id: gotchas-upstream
    resource: https://github.com/GenvidTechnologies/c3addon-youtube-video-plugin/blob/fb7fccf/CLAUDE.md
    title: CLAUDE.md in the c3addon-youtube-video-plugin repository at fb7fccf
---

# Debugging the player

This plugin wraps the [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
— a global `YT` namespace loaded from `https://www.youtube.com/iframe_api` that
replaces a container element with a YouTube `<iframe>`. For anything
player-internal — playback state, sizing, captions, quality, timing — **debug
empirically in a real browser** with `test/player-test.html`
(drive it headlessly via the Playwright MCP, or `npx http-server` + a browser):
running it settles in minutes what static analysis gets wrong over hours. See
[YouTube IFrame Player API notes](youtube-player-api.md) for the plugin-specific
gotchas.[^gotchas]

## The harness is ungated developer tooling

The `test/*.html` harnesses are hand-maintained developer tooling: ESLint is
scoped to `*.ts`/`*.json` and the build copies only `src/`, so
`npm run lint && npm run build` neither lints nor packages them. That gate is
**silent on `test/`** — the only real check is loading the harness in a browser.
When serving it to drive the Playwright MCP, start `http-server` with the Bash
tool's `run_in_background` (then `TaskStop` when done); a trailing `&` job is
reaped when the tool call returns, so the next navigate hits connection-refused.[^gotchas]

## What the harness actually verifies

Two caveats on what the harness actually verifies. First, it **reimplements** pure
helpers like `extractVideoId` verbatim rather than importing them — it does *not*
execute `src/c3runtime/dom/ElementHandler.ts` — so loading it exercises the parsing
*mirror*, **not** any runtime-only ElementHandler change (new logging, state
transitions, the awaitable-load path). Keep the two copies in lockstep; a `diff` of
the pattern arrays catches drift. Second, "the only real check is a browser" is
about player-*internal* behavior (playback, sizing, captions, timing) — a pure
deterministic helper like `extractVideoId` is fully verifiable in Node (run a URL
corpus through the same logic, plus a mirror-parity `diff`), which is the fallback
when the Playwright MCP is unavailable.[^gotchas]

## Verifying the runtime state machine in Node

The same "verify in Node against a real captured sequence" move extends to the
**runtime state machine** the harness can't execute. A runtime-reducer bug (e.g.
`instance._OnStateChanged`'s reset+ready-gate logic, issue #35) is verifiable
deterministically: drive `test/player-test.html` via the Playwright MCP to **capture
the real `YT.Player` event / `getDuration()` sequence** for the scenario (e.g. a
`loadVideoById` reuse load), then replay that exact sequence through a hand-mirrored
reducer in a Node script and assert *current code → reproduces the bug*, *fixed →
passes*. This settles state-machine fixes before the manual C3-editor gate — which is
what the harness-can't-run-the-runtime caveat above otherwise leaves unverifiable.
Keep the mirrored reducer faithful to `instance.ts` (same divergence risk as the
`extractVideoId` mirror).[^gotchas]

## Playwright MCP availability

> **Playwright MCP availability.** The `browser_*` tools come from the `playwright`
> Claude Code plugin — if they're absent, install/enable it via `/plugin` instead
> of falling back to a hand-built user-run probe.[^gotchas]

## Related

- [YouTube IFrame Player API notes](youtube-player-api.md) — the plugin-specific player gotchas this workflow investigates, including the issue #35 readiness-reset hazard.
- [Architecture](architecture.md) — the runtime/DOM split that explains why the harness cannot execute the runtime side.
- [Sample project](sample-project.md) — the other manual gate (loading the sample in the C3 editor).

[^gotchas]: Distilled from the "Debugging the player" section of the captured `CLAUDE.md` (`../raw/2026-10-21-claude-md-gotchas.md`).

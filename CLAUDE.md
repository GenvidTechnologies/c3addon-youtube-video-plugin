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

- Lint: `npm run lint` — ESLint (`src/**`) plus three surface validators run in
  sequence: `validate-aces` (`aces.json` ↔ `en-US.json` agreement), `validate-sample`
  (the `sample/` project vs the current ACE surface — see below), and `validate-docs`
  (`docs/usage.md` vs the surface, plus an on/off-default regression check — see
  [ADR-0009](docs/decisions/0009-gate-docs-drift-against-ace-surface.md)).
- Build: `npm run build` (compiles `src/` → `dist/`, then copies assets)
- Validate (lint + build): `npm run lint && npm run build`
- Package: `npm run all:windows` / `npm run all:linux` (lint + build + zip `.c3addon`)
- Dev server: `npm run devmode`

There is no automated test suite.

## Releasing

Releases are **tag-triggered**, not manual. `.github/workflows/release.yml` fires on
any pushed tag matching `[0-9]*.[0-9]*.*` and does the whole publish:
`npm ci` → `npm run lint` → `npm run build` → `npm run zip:linux` →
`gh release create "<tag>" Genvidtech_YouTubeVideoPlugin.c3addon --generate-notes`.
(`ci.yml` builds and uploads the `.c3addon` as a run artifact on every PR / `main`
push, but only `release.yml` publishes a GitHub Release.)

So the release ritual is just:

1. Bump the version in **both** `src/addon.json` (preserve the BOM — see
   "Editing the addon-definition files" below) and `package.json`.
2. Commit (`chore - Bump version to <ver>`), push `main`.
3. Push an annotated tag `<ver>`; the workflow builds the `.c3addon` and publishes
   the release with auto-generated notes.

**Do not also run `gh release create` locally** after pushing the tag: it races the
workflow, whose own `gh release create` then fails with "a release with the same tag
name already exists." If you want richer notes, let the workflow publish first, then
`gh release edit <ver> --notes-file …` to prepend a curated summary above the
generated changelog.

**Version-number hazard.** The fork inherited GCore's tags — `1.1.0.0`, `1.1.0.1`,
`2.0.0.0` (this fork's line) and **`2.1.0.0`** (a GCore-upstream commit, *not* on this
fork's history). Never reuse `2.1.0.0`. The first real YouTube release was `3.0.0.0`
(2026-07-10).

## Architecture

- `src/plugin.ts` is **editor-side** (runs in the Construct 3 editor / at export,
  not in the game); only `src/c3runtime/**` runs in the game.
- All YouTube player-API coupling is isolated to `src/c3runtime/dom/ElementHandler.ts`;
  the runtime side talks to it through a generic message bridge.
- See [`docs/architecture.md`](docs/architecture.md) and
  [`docs/youtube-player-api.md`](docs/youtube-player-api.md).

## Editing the addon-definition files (UTF-8 BOM)

The three files the Construct 3 SDK reads at addon-load time — `src/addon.json`,
`src/aces.json`, and `src/lang/en-US.json` — are UTF-8 **with a BOM**. This is an
SDK convention, not an accident: it's present on exactly those three manifest
files and on nothing else (`src/tsconfig.json`, `package.json`, and every
`sample/**` C3-project file are BOM-less). **Preserve the BOM** — never strip it
and don't add a no-BOM `.gitattributes` rule for these files, or the C3 editor may
reject the manifest.

Practical gotcha when editing them: a multi-line `Edit` (string replacement) can
fail to match against the BOM'd files (single-line matches still work). The
fallback is to `Write` the whole file — but a plain `Write` drops the BOM, so
**restore it afterward** so the diff stays minimal. This bites any ACE add/remove
(most remaining port work touches `aces.json` + `en-US.json` in lockstep) and any
`addon.json` version bump at release time.

## The sample project (`sample/`)

`sample/` is a **real Construct 3 project** (folder format, `sample/project.c3proj`)
used to exercise the built addon end to end. It is developer tooling, not shipped:
`npm run build` copies only `src/` into `dist/`, so the sample is never packaged and
was long **without any gate** — nothing checked it until a manual load in the C3
editor, which is how it silently drifted onto retired GCore ACEs (see issue #9 / PR
#27).

**It is coupled to the plugin's ACE/property surface.** The sample's event sheets
call the plugin's ACEs and its layouts set the plugin's instance properties, so when
you retire or rename an ACE (`src/aces.json`) or a property (`src/plugin.ts`), the
sample must be updated **in lockstep** — a stale reference makes Construct fail
project load. `npm run lint` now runs `scripts/validate-sample.mjs`, which
cross-checks every reference to *this plugin's* object types against the current
surface and fails on a retired condition/action id, a stale action param, a stale
`Type.Expr` expression, or a stale instance property. Construct's **common** ACEs
(`set-visible`, `X`/`Y`/`Width`, …) aren't in `aces.json`; they're allow-listed in
that script — if a legitimate common ACE trips it, add the id/name to the allowlist,
not to `aces.json`. The validator only covers *stale references*; player-internal
behavior (does it actually play?) still requires a manual editor load.
`scripts/validate-docs.mjs` (listed under Commands) is its read-side analog for
`docs/usage.md`.

**Editing sample JSON safely.** Construct writes these files byte-identically to
Python's `json.dumps(data, indent="\t", ensure_ascii=False)` with **no trailing
newline**. So structural edits — removing layout instances, filtering the nested
event tree, pruning the object-types list, reconciling an instance's `properties` —
are best done **programmatically** (load → mutate the parsed structure → write back
with those exact dump options): the diff then shows only your intended change, not a
whitespace reformat, which line-based edits on these large, deeply-nested files
routinely get wrong. Verify fidelity once on a copy (`out == orig`) and assert
expected add/remove/modify counts in the mutation script to catch drift. Editor
cache files like `sample/project.uistate.json` are **untracked** and auto-regenerate
— ignore stale references there.

## Debugging the player

This plugin wraps the [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
— a global `YT` namespace loaded from `https://www.youtube.com/iframe_api` that
replaces a container element with a YouTube `<iframe>`. For anything
player-internal — playback state, sizing, captions, quality, timing — **debug
empirically in a real browser** with [`test/player-test.html`](test/player-test.html)
(drive it headlessly via the Playwright MCP, or `npx http-server` + a browser):
running it settles in minutes what static analysis gets wrong over hours. See
`docs/youtube-player-api.md` for the plugin-specific gotchas.

The `test/*.html` harnesses are hand-maintained developer tooling: ESLint is
scoped to `*.ts`/`*.json` and the build copies only `src/`, so
`npm run lint && npm run build` neither lints nor packages them. That gate is
**silent on `test/`** — the only real check is loading the harness in a browser.
When serving it to drive the Playwright MCP, start `http-server` with the Bash
tool's `run_in_background` (then `TaskStop` when done); a trailing `&` job is
reaped when the tool call returns, so the next navigate hits connection-refused.

Two caveats on what the harness actually verifies. First, it **reimplements** pure
helpers like `extractVideoId` verbatim rather than importing them — it does *not*
execute `src/c3runtime/dom/ElementHandler.ts` — so loading it exercises the parsing
*mirror*, **not** any runtime-only ElementHandler change (new logging, state
transitions, the awaitable-load path). Keep the two copies in lockstep; a `diff` of
the pattern arrays catches drift. Second, "the only real check is a browser" is
about player-*internal* behavior (playback, sizing, captions, timing) — a pure
deterministic helper like `extractVideoId` is fully verifiable in Node (run a URL
corpus through the same logic, plus a mirror-parity `diff`), which is the fallback
when the Playwright MCP is unavailable.

> **Playwright MCP availability.** The `browser_*` tools come from the `playwright`
> Claude Code plugin — if they're absent, install/enable it via `/plugin` instead
> of falling back to a hand-built user-run probe.

## C3 domain tooling (`sample/`)

The `gvt-construct3` plugin's MCP servers (`construct3-chef`, `c3-domain-manager`)
treat **`sample/` as the C3-project root** — auto-discovered because it is the one
repo-child holding `project.c3proj`. `sample/domain-config.json` declares the
sample's domains for `c3-domain-manager` (verify with
`/gvt-construct3:audit-c3-conventions`). Two gotchas that already bit once:

- **Keep `sample/scripts/` present** (an empty `.gitkeep` suffices). `c3-domain-manager`'s
  `generate` / `domain-health` / `context-map` crash on a missing `scripts/` dir even
  though a C3 project may legitimately have none (`list-uncategorized` tolerates it).
- **Never add a second `project.c3proj` at repo depth-1** (e.g. a downloaded reference
  such as `official-youtube-sample/`). Discovery scans the **filesystem** and errors on
  2+ matches, so the domain-manager server fails to start (`-32000`). **Gitignoring the
  folder does not help** — git-ignore status is not filesystem visibility. Keep the extra
  project out of the repo tree (or pin `--project-dir sample` via a workspace `.mcp.json`,
  which then couples the plugin's server version pins).

Regenerate the committed `sample/extracted/domain-index/` after changing the sample or
`domain-config.json`: `c3-domain-manager generate` (auto-discovers `sample/`) or the MCP
`regenerate` tool.

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
- Remote: GitHub (`GenvidTechnologies/c3addon-youtube-video-plugin`).

### Fork remotes — read before any `gh` command

This repo is a **fork** of `c3addon-gcore-video-plugin`, so it has two remotes:
`origin` = `GenvidTechnologies/c3addon-youtube-video-plugin` (this plugin) and
`upstream` = `GenvidTechnologies/c3addon-gcore-video-plugin` (the GCore original).

With two remotes, **unscoped `gh` commands can resolve to `upstream`** — e.g.
`gh issue list` / `gh repo view` may target the GCore repo, and the unscoped
`bugTracker` queries in `.gvt-agent.json` inherit the same default. A default
is set (`gh repo set-default GenvidTechnologies/c3addon-youtube-video-plugin`); if a
`gh` call ever hits the wrong repo, re-run that, or pass
`-R GenvidTechnologies/c3addon-youtube-video-plugin` explicitly. Pull GCore changes
to cherry-pick with `git fetch upstream`.

### Syncing upstream changes

When asked whether an upstream (GCore) update is relevant, triage the delta from
the fork point rather than eyeballing tags:

```
git fetch upstream
git merge-base HEAD upstream/main          # the fork point
git log <merge-base>..upstream/main        # commits we don't have
```

Then classify each commit (this fork has diverged — most are not clean
cherry-picks):

- **CI / infra / tooling** (workflow bumps, lockfile, build scripts) → usually
  port cleanly. (e.g. upstream #10 actions-v5 → our PR #19.)
- **GCore release / version bumps** (`package.json`, `src/addon.json`) → **skip**;
  the fork has its own identity and version line.
- **Player-API features / fixes** → relevant *in principle* (the underlying bug
  often exists here too), but **not** a clean cherry-pick: the GCore player API
  differs from the YouTube IFrame API, so adapt the behavior empirically (per
  "Debugging the player") and **file a tracked issue** instead of an ad-hoc port.
  (e.g. upstream #8 awaitable Load Video → our issue #18.)

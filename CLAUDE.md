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
  (the `sample/` project vs the current ACE surface — see "Project wiki" below), and `validate-docs`
  (`wiki/usage.md` vs the surface, plus an on/off-default regression check — see
  [ADR-0009](wiki/decisions/0009-gate-docs-drift-against-ace-surface.md)).
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
- See [`wiki/architecture.md`](wiki/architecture.md) and
  [`wiki/youtube-player-api.md`](wiki/youtube-player-api.md).

## Project wiki (`wiki/`)

Project documentation lives in an LLM-wiki (`/gvt-dev:maintain-wiki`): pages under
`wiki/` (OKF v0.2 bundle, indexed by [`wiki/index.md`](wiki/index.md) — which is
also the project's docs TOC via `paths["docs/TOC.md"]`), immutable source
captures under `raw/`, maintenance rules in [`wiki/schema.md`](wiki/schema.md).
ADRs live in [`wiki/decisions/`](wiki/decisions/index.md). Query it with
`/gvt-dev:maintain-wiki query`, check it with `/gvt-dev:maintain-wiki lint`.

The detailed gotchas below were moved into the wiki; the one-line guard rail for
each stays here because it must be in context before you act:

- **Releasing** → [`wiki/releasing.md`](wiki/releasing.md). Tag-triggered: bump
  `src/addon.json` (keep its BOM) **and** `package.json`, commit, push `main`, push
  an annotated `<ver>` tag. **Never** run `gh release create` locally (races the
  workflow), and **never** reuse tag `2.1.0.0`.
- **Addon-definition files (UTF-8 BOM)** → [`wiki/addon-manifest-bom.md`](wiki/addon-manifest-bom.md).
  `src/addon.json`, `src/aces.json`, `src/lang/en-US.json` carry a BOM — preserve
  it; a plain `Write` drops it, and multi-line `Edit`s can fail to match.
- **The sample project** → [`wiki/sample-project.md`](wiki/sample-project.md).
  `sample/` is coupled to the ACE/property surface: retire or rename an ACE or
  property and update the sample in lockstep (`validate-sample` gates it). Edit its
  JSON programmatically, never line-wise. Keep `sample/scripts/` present, and never
  add a second `project.c3proj` at repo depth 1 (breaks `c3-domain-manager`).
- **Debugging the player** → [`wiki/debugging-the-player.md`](wiki/debugging-the-player.md).
  Debug player-internal behavior empirically in a browser with
  `test/player-test.html` (it *mirrors*, not executes, `ElementHandler.ts`); serve
  it with the Bash tool's `run_in_background`, not `&`.

## Commit Format

`<type> - <description>`, where `<type>` is one of `feat`, `fix`, or `chore`.

Examples:
- `feat - Remove SetIsSingleGlobal`
- `fix - Fix SecondEvents`
- `chore - Update README, clean up comment`

No Jira prefix (`BUR-…`). Issues are tracked in this repo's GitHub issues;
reference one as `(#N)` at the end of the subject, or `Refs #N` / `Closes #N` in
the body.

## Pull Request Format

Title mirrors the branch name (e.g. `chore-docs-to-wiki`), with no Jira prefix.
Body should summarize the change and how it was verified (lint + build, manual
test in Construct 3), and link its GitHub issue with `Closes #N` (or `Refs #N`
when the PR doesn't fully resolve it).

## Branching

- Base branch: `main`.
- Branch naming: `<type>-<kebab-description>`, where `<type>` is the commit type
  (`feat`, `fix`, `chore`) — e.g. `chore-docs-to-wiki`, `fix-ready-gate-reset`.
  No Jira prefix: the older `BUR-<ticket>-…` / `BUR-0000-…` forms are retired.
- Remote: GitHub (`GenvidTechnologies/c3addon-youtube-video-plugin`).

### Remotes (single `origin` — fork network detached)

This repo has a **single** remote, `origin` =
`GenvidTechnologies/c3addon-youtube-video-plugin`. It was previously a GitHub
**fork** of `c3addon-gcore-video-plugin` with an `upstream` remote, but the fork
network and the `upstream` remote have since been **removed**. Consequences:

- **`gh` commands always resolve to this repo** — no unscoped-command hazard, so
  the old `-R …` scoping and `gh repo set-default` workaround are no longer
  needed (a default is still harmless if set).
- **GCore changes no longer flow in.** The `git fetch upstream` sync-and-triage
  workflow is gone. Provenance is unchanged (the code was ported from GCore — see
  the **Fork status** note and the **Version-number hazard** above, both still
  accurate), but there is no automatic upstream link. If you ever need to compare
  against GCore, add the remote manually:
  `git remote add upstream git@github.com:GenvidTechnologies/c3addon-gcore-video-plugin.git`.

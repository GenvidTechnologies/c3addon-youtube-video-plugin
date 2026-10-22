---
type: practice-note
title: Releasing
description: The tag-triggered release process - what release.yml does, the three-step ritual, why not to run gh release create locally, the never-reuse-2.1.0.0 version-number hazard, and verifying addon identity metadata (author) at release time.
tags: [release, ci, versioning, github-actions]
stale_after: 2027-04-21
generated: { by: process:maintain-wiki, at: 2026-10-22T00:00:00Z }
sources:
  - id: gotchas
    resource: ../raw/2026-10-21-claude-md-gotchas.md
    title: Capture of five CLAUDE.md gotcha sections at commit fb7fccf (this page - Releasing)
    last_modified: 2026-10-21
  - id: gotchas-upstream
    resource: https://github.com/GenvidTechnologies/c3addon-youtube-video-plugin/blob/fb7fccf/CLAUDE.md
    title: CLAUDE.md in the c3addon-youtube-video-plugin repository at fb7fccf
  - id: issue-37
    resource: https://github.com/GenvidTechnologies/c3addon-youtube-video-plugin/issues/37
    title: Issue #37 — addon.json author vs SetAuthor mismatch
    last_modified: 2026-10-22
---

# Releasing

Releases are **tag-triggered**, not manual. `.github/workflows/release.yml` fires on
any pushed tag matching `[0-9]*.[0-9]*.*` and does the whole publish:
`npm ci` → `npm run lint` → `npm run build` → `npm run zip:linux` →
`gh release create "<tag>" Genvidtech_YouTubeVideoPlugin.c3addon --generate-notes`.
(`ci.yml` builds and uploads the `.c3addon` as a run artifact on every PR / `main`
push, but only `release.yml` publishes a GitHub Release.)[^gotchas]

## The ritual

So the release ritual is just:[^gotchas]

1. Bump the version in **both** `src/addon.json` (preserve the BOM — see
   [Editing the addon-definition files](addon-manifest-bom.md)) and `package.json`.
2. Commit (`chore - Bump version to <ver>`), push `main`.
3. Push an annotated tag `<ver>`; the workflow builds the `.c3addon` and publishes
   the release with auto-generated notes.

**Do not also run `gh release create` locally** after pushing the tag: it races the
workflow, whose own `gh release create` then fails with "a release with the same tag
name already exists." If you want richer notes, let the workflow publish first, then
`gh release edit <ver> --notes-file …` to prepend a curated summary above the
generated changelog.[^gotchas]

## Version-number hazard

**Version-number hazard.** The fork inherited GCore's tags — `1.1.0.0`, `1.1.0.1`,
`2.0.0.0` (this fork's line) and **`2.1.0.0`** (a GCore-upstream commit, *not* on this
fork's history). Never reuse `2.1.0.0`. The first real YouTube release was `3.0.0.0`
(2026-07-10).[^gotchas]

## Verifying addon identity metadata

The addon's `author` must agree between `src/addon.json` and the editor-side
`SetAuthor(...)` in `src/plugin.ts` (the three-place lockstep rule, including the
sample project, is in [The sample project](sample-project.md)). Issue #37's second
acceptance criterion — a released `.c3addon` carries matching author values in
`addon.json` and `plugin.js` — is only verifiable end to end downstream, by running
construct3-chef `validate-addons` in a consuming project that bundles the addon
(e.g. genvid-holdings/burbank, which plans to bundle it — burbank#192). Locally,
after `npm run build`, check that `dist/addon.json` `author` and `dist/plugin.js`
`SetAuthor` agree. #37 is tracked as Refs (not closed) until a release ships the
fix.[^issue-37]

## Related

- [Editing the addon-definition files (UTF-8 BOM)](addon-manifest-bom.md) — the BOM gotcha on the `addon.json` version bump.
- [Architecture](architecture.md) — what is being packaged.
- [The sample project](sample-project.md) — the three-place author lockstep rule.

[^gotchas]: Distilled from the "Releasing" section of the captured `CLAUDE.md` (`../raw/2026-10-21-claude-md-gotchas.md`).
[^issue-37]: Issue #37 and the session that fixed it in commit 66c58db (https://github.com/GenvidTechnologies/c3addon-youtube-video-plugin/issues/37).

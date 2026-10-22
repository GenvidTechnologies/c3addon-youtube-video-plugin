---
type: convention
title: Editing the addon-definition files (UTF-8 BOM)
description: The three SDK manifest files (addon.json, aces.json, en-US.json) are UTF-8 with a BOM that must be preserved, and how to edit them when a multi-line Edit fails to match.
tags: [bom, addon-json, aces-json, editing, construct3-sdk]
stale_after: 2027-04-21
generated: { by: process:maintain-wiki, at: 2026-10-21T00:00:00Z }
sources:
  - id: gotchas
    resource: ../raw/2026-10-21-claude-md-gotchas.md
    title: Capture of five CLAUDE.md gotcha sections at commit fb7fccf (this page - Editing the addon-definition files)
    last_modified: 2026-10-21
  - id: gotchas-upstream
    resource: https://github.com/GenvidTechnologies/c3addon-youtube-video-plugin/blob/fb7fccf/CLAUDE.md
    title: CLAUDE.md in the c3addon-youtube-video-plugin repository at fb7fccf
---

# Editing the addon-definition files (UTF-8 BOM)

The three files the Construct 3 SDK reads at addon-load time — `src/addon.json`,
`src/aces.json`, and `src/lang/en-US.json` — are UTF-8 **with a BOM**. This is an
SDK convention, not an accident: it's present on exactly those three manifest
files and on nothing else (`src/tsconfig.json`, `package.json`, and every
`sample/**` C3-project file are BOM-less). **Preserve the BOM** — never strip it
and don't add a no-BOM `.gitattributes` rule for these files, or the C3 editor may
reject the manifest.[^gotchas]

## Practical gotcha

Practical gotcha when editing them: a multi-line `Edit` (string replacement) can
fail to match against the BOM'd files (single-line matches still work). The
fallback is to `Write` the whole file — but a plain `Write` drops the BOM, so
**restore it afterward** so the diff stays minimal. This bites any ACE add/remove
(most remaining port work touches `aces.json` + `en-US.json` in lockstep) and any
`addon.json` version bump at release time.[^gotchas]

## Related

- [Architecture](architecture.md) — the ACE wiring chain that touches `aces.json` and `en-US.json` in lockstep.
- [Releasing](releasing.md) — the version bump that edits `addon.json`.
- [Sample project](sample-project.md) — the sample is BOM-less, unlike these manifests.

[^gotchas]: Distilled from the "Editing the addon-definition files (UTF-8 BOM)" section of the captured `CLAUDE.md` (`../raw/2026-10-21-claude-md-gotchas.md`).

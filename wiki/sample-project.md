---
type: convention
title: The sample project and C3 domain tooling
description: The sample/ Construct 3 project - its lockstep coupling to the ACE/property surface, the validate-sample gate, safe programmatic JSON editing, and the c3-domain-manager setup gotchas.
tags: [sample, construct3, validation, c3-domain-manager, json]
stale_after: 2027-04-21
generated: { by: process:maintain-wiki, at: 2026-10-21T00:00:00Z }
sources:
  - id: gotchas
    resource: ../raw/2026-10-21-claude-md-gotchas.md
    title: Capture of five CLAUDE.md gotcha sections at commit fb7fccf (this page - The sample project; C3 domain tooling)
    last_modified: 2026-10-21
  - id: gotchas-upstream
    resource: https://github.com/GenvidTechnologies/c3addon-youtube-video-plugin/blob/fb7fccf/CLAUDE.md
    title: CLAUDE.md in the c3addon-youtube-video-plugin repository at fb7fccf
---

# The sample project (`sample/`)

`sample/` is a **real Construct 3 project** (folder format, `sample/project.c3proj`)
used to exercise the built addon end to end. It is developer tooling, not shipped:
`npm run build` copies only `src/` into `dist/`, so the sample is never packaged and
was long **without any gate** — nothing checked it until a manual load in the C3
editor, which is how it silently drifted onto retired GCore ACEs (see issue #9 / PR
#27).[^gotchas]

## Coupled to the ACE/property surface

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
`scripts/validate-docs.mjs` (listed under the repo's lint commands) is its read-side
analog for [usage.md](usage.md) (see
[ADR-0009](decisions/0009-gate-docs-drift-against-ace-surface.md)).[^gotchas]

## Editing sample JSON safely

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
— ignore stale references there.[^gotchas]

## C3 domain tooling (`sample/`)

The `gvt-construct3` plugin's MCP servers (`construct3-chef`, `c3-domain-manager`)
treat **`sample/` as the C3-project root** — auto-discovered because it is the one
repo-child holding `project.c3proj`. `sample/domain-config.json` declares the
sample's domains for `c3-domain-manager` (verify with
`/gvt-construct3:audit-c3-conventions`). Two gotchas that already bit once:[^gotchas]

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
`regenerate` tool.[^gotchas]

## Related

- [Architecture](architecture.md) — the ACE and property wiring that the sample must stay in lockstep with.
- [Usage guide](usage.md) — the read-side analog gated by `validate-docs.mjs`.
- [Editing the addon-definition files (UTF-8 BOM)](addon-manifest-bom.md) — the BOM'd manifests, in contrast to the BOM-less sample files.
- [Debugging the player](debugging-the-player.md) — the manual verification gate for player-internal behavior.

[^gotchas]: Distilled from the "The sample project (`sample/`)" and "C3 domain tooling (`sample/`)" sections of the captured `CLAUDE.md` (`../raw/2026-10-21-claude-md-gotchas.md`).

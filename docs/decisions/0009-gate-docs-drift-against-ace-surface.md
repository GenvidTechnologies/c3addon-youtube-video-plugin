# 0009. Gate docs/usage.md drift against the ACE surface

- **Status:** Accepted
- **Date:** 2026-07-10
- **Issue:** [GenvidTechnologies/c3addon-youtube-video-plugin#31](https://github.com/GenvidTechnologies/c3addon-youtube-video-plugin/issues/31)

## Context

`scripts/validate-sample.mjs` (wired into `npm run lint`) already gates
`sample/` against the ACE surface, but nothing gated the markdown docs:
`npm run build` copies only `src/`, and ESLint is scoped to `*.ts`/`*.json`.
`docs/usage.md` names ACEs and instance properties in prose and in a "Quick
reference" table, and could silently drift out of sync with
`src/aces.json` / `src/lang/en-US.json` / `src/plugin.ts` the same way the
sample drifted before issue #9 (PR #27).

Issue #31 also raised a second, narrower worry: issue #30 (closed by PR
#33) found that `enable-chrome`'s `en-US.json` description asserted "Off by
default" while `src/plugin.ts` actually defaults it to `true` — a
doc/code semantic mismatch that a pure name-existence check would not
catch. #31's comment noted that without a regression guard for that class
of bug, "#30 will recur and this gate will report green."

`scripts/validate-docs.mjs` was written to close both gaps, as a read-side
analog of `validate-sample.mjs`.

## Decision

### 1. Scope: `docs/usage.md` only

The validator checks `docs/usage.md` exclusively. `README.md` names zero
ACEs (52 lines of fork/CI content only) and has nothing to check.
`docs/TOC.md`'s only ACE mentions are the `decisions/*` ADR-index rows
(e.g. ADR-0004's retired quality ACEs, ADR-0007's retired subtitle ACEs),
which legitimately name **retired** ACEs to describe their retirement —
requiring those to resolve against the current surface would break by
design, and excluding them leaves nothing left to check in that file.
`usage.md` is the only doc carrying the full user-facing ACE surface, so it
is the whole payload.

### 2. Check A precision mechanism: §8 tables + backticked PascalCase, against a surface vocabulary, with an "err toward inclusion" allowlist

Candidate references are drawn from two sources:

- every row of the "8. Quick reference" tables (Actions/Conditions by
  display name, Expressions by expression name) — the doc's own
  authoritative ACE enumeration;
- every backticked PascalCase identifier anywhere in the doc.

Each candidate is checked against the surface vocabulary: display names
(`name`/`list-name` from `src/lang/en-US.json`) for actions/conditions/
properties, and expression names from `src/aces.json`. A small allowlist
(`Await`, `ResizeObserver`) covers genuine non-ACE terms that happen to be
backticked PascalCase.

Two alternatives were rejected:

- **Full bold-display-name prose scan of §1–§7** — scanning every
  `**Bold**` span in the narrative sections for a surface match. Rejected
  for a materially higher false-positive rate: ordinary bold prose
  emphasis (headings, callouts) isn't reference-shaped the way a
  backticked identifier or a quick-reference table row is.
- **§8-tables-only** — checking only the quick-reference tables. Rejected
  because it misses drift that lives purely in prose (§1–§7 narrative
  referencing an ACE by name without it appearing, or appearing stale, in
  the table).

The allowlist follows the same posture as `validate-sample.mjs`: a missing
allowlist entry is a false **positive** that breaks `npm run lint`, whereas
an over-broad entry is only a harmless false negative — so the list errs
toward inclusion.

### 3. Check B: semantic-drift regression guard, scoped to en-US.json desc vs. plugin.ts default

For every boolean (`check`-type) instance property whose `en-US.json`
`desc` asserts "on by default" or "off by default", the assertion is
compared against the actual default (the 3rd `PluginProperty` constructor
argument in `src/plugin.ts`) and flagged if they disagree.

This is a **regression guard**, not a fix for #30: issue #30 is already
closed by PR #33, and the current tree passes Check B. The point is to
prevent that class of drift from recurring silently — exactly the concern
in #31's comment. The check is scoped narrowly to the `en-US.json`
desc-vs-`plugin.ts`-default comparison; it does not also check
`usage.md`'s own per-property default column against `plugin.ts`, which
remains a possible future extension (see Consequences).

## Compromise

### Rejected: gating README.md and docs/TOC.md

Both were considered for symmetry with "every doc mentions ACEs, gate
every doc." Rejected per Decision §1 — neither carries checkable ACE
content: README.md names none, and TOC.md's only mentions are the ADR
index's intentionally-retired-ACE rows.

### Rejected: prose bold-name scanning for Check A

See Decision §2. A full-doc bold-name scan was rejected in favor of the
narrower table-rows-plus-backticks mechanism, trading some prose-drift
detection outside backticked spans for a materially lower false-positive
rate.

### Accepted scope limit: Check B doesn't cross-check usage.md's own default column

Check B verifies `en-US.json` against `plugin.ts` only. `usage.md`'s
property table also states defaults in prose, which could independently
drift from either source; that three-way check was left out of this pass
to keep Check B's blast radius matched to the #30/#31 bug class it was
written to catch, and can be added later if a similar drift surfaces in
`usage.md` itself.

## Consequences

- `npm run lint` now fails on a stale ACE/property reference in
  `docs/usage.md`, or on an `en-US.json` boolean-default description that
  contradicts `src/plugin.ts`'s actual default — closing #31.
- `docs/usage.md` is the only markdown doc gated; `README.md` and
  `docs/TOC.md` remain unchecked, consistent with them carrying no
  checkable ACE content today. If either later gains ACE-referencing
  prose beyond the ADR-index pattern, this scope should be revisited.
- Adding a new ACE or changing a boolean property's default now requires
  updating `docs/usage.md` (and, for Check B, `en-US.json`'s `desc`) in
  the same lockstep already required of `src/aces.json` +
  `src/lang/en-US.json` + `sample/` — `scripts/validate-docs.mjs` joins
  `scripts/validate-sample.mjs` as a second `npm run lint` gate on that
  surface.
- A future three-way cross-check between `usage.md`'s own default prose,
  `en-US.json`, and `plugin.ts` remains a possible follow-up but is not
  part of this change.

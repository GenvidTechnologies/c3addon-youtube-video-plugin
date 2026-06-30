# 0004. Retire quality ACE surface (pre-release removal policy)

- **Status:** Accepted
- **Date:** 2026-06-29
- **Issue:** [GenvidTechnologies/c3addon-youtube-video-plugin#5](https://github.com/GenvidTechnologies/c3addon-youtube-video-plugin/issues/5) (part of epic [#1](https://github.com/GenvidTechnologies/c3addon-youtube-video-plugin/issues/1) — the GCore→YouTube port)

## Context

The GCore fork introduced three quality ACEs: `SetQuality` (action), `GetCurrentQuality`
and `GetQualityCount` (expressions). These modelled quality as a numeric ABR-level index
over HLS renditions — the shape of the GCore player API.

When the plugin was re-targeted to the YouTube IFrame API, none of those paths were
adapted: `GetCurrentQuality` always returned -1, `GetQualityCount` always 0, `SetQuality`
was a no-op log. The DOM seam (`ElementHandler.ts`) never posted quality state and
never called `setPlaybackQuality`. The surface was completely inert at runtime.

Issue #5 evaluated two options — MAP (adapt to YouTube's advisory quality API) or RETIRE
(remove) — and chose RETIRE.

A parallel consideration is that [ADR-0001](0001-additive-v2-api-expansion.md) §1 froze
the ACE surface ("never by renaming, removing, or reordering") to protect the GCore
plugin's active consumer base. This YouTube fork has no consumers yet: it is pre-release,
and the bundled sample was verified to bind no quality ACEs. That freeze premise does not
hold here.

PR #17 (commit `cf394cc`, "Retire GCore-only ACEs") had already removed three other
inert ACEs under the same unrecorded pre-release rationale. This ADR records that
rationale formally so future pre-release removals cite it rather than re-litigating the
freeze.

## Decision

### 1. Pre-release freeze relaxation (supersedes ADR-0001 §1 for this window)

The ACE-id / parameter-order freeze in ADR-0001 §1 is relaxed for the pre-release
window. With no consumers, the back-compat premise does not hold. ACEs that are inert or
GCore-only may be removed rather than kept. **The freeze is to be restored at first
release.** Post-release, ADR-0001 §1 applies in full.

### 2. Clean-removal preferred over keeping inert surface

An inert-but-present ACE is worse than an absent one: it advertises a capability the
player does not deliver, misleading both consumers and tooling that introspect the ACE
list. The correct default for an inert surface in the pre-release window is removal, not
preservation.

### 3. Retire `SetQuality`, `GetCurrentQuality`, `GetQualityCount`

The three quality ACEs are removed across all seven lockstep contract and runtime files
(`src/aces.json`, `src/lang/en-US.json`, `src/c3runtime/actions.ts`,
`src/c3runtime/expressions.ts`, `src/c3runtime/instance.ts`, `src/c3runtime/domSide.ts`,
`src/c3runtime/dom/ElementHandler.ts`). Zero behavioral change — every deleted path was
unreachable.

## Compromise

### Rejected: MAP to YouTube's advisory quality API

YouTube exposes `setPlaybackQuality(level)` and `getPlaybackQuality()`, but these are
documented as deprecated and routinely ignored by YouTube's own ABR. Implementing MAP
would require:

- an empirical-verification gate to confirm which quality strings are accepted,
- a poller or event listener to track `onPlaybackQualityChange`,
- wiring across the same ~8 lockstep files,

to deliver an action YouTube ignores. MAP would have converted a *harmless absent* API
into a *present-but-misleading* one — the opposite of the principle in Decision §2.
YouTube's quality model (named, advisory, ABR-selected) does not map to GCore's
numeric-index model in any way that would be useful to consumers, which is the deeper
reason the surface could not be straightforwardly adapted.

### Rejected: keeping the ACEs as stubs with a not-implemented log

Keeping the stubs with a warning log was considered. Rejected for the same reason as
MAP: a visible, callable ACE falsely implies that implementing the feature is merely
pending rather than structurally unsupported.

### Accepted cost: ACE removal ripples across 8 files

Per the Construct plugin contract (noted in ADR-0001 Consequences), ACE changes touch
~8 files. The removal commit (`01a88d4`) carries that full 8-file sweep in a single
commit so no intermediate state has wrong indices.

## Consequences

- `SetQuality`, `GetCurrentQuality`, and `GetQualityCount` are absent from the plugin.
  Any consumer who needs quality control must wait for a future issue to decide whether
  a YouTube-native quality surface is worth the advisory-API limitations.
- The pre-release freeze relaxation policy is now recorded. Future pre-release removals
  (e.g. any remaining GCore-only stubs) cite this ADR rather than re-arguing from
  first principles.
- At first release the freeze is restored; ADR-0001 §1 becomes unconditional again, and
  any further ACE removal requires a major-version deprecation cycle.
- This generalizes PR #17's unrecorded rationale: both that PR and this change are
  instances of the same policy now documented here.

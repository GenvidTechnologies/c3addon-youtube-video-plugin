# 0007. Captions: Map On/Off + Preferred Language, Retire the Rest

- **Status:** Accepted
- **Date:** 2026-07-02
- **Issue:** [GenvidTechnologies/c3addon-youtube-video-plugin#6](https://github.com/GenvidTechnologies/c3addon-youtube-video-plugin/issues/6) (part of epic [#1](https://github.com/GenvidTechnologies/c3addon-youtube-video-plugin/issues/1) — the GCore→YouTube port)

## Context

The GCore fork's subtitle surface assumed in-manifest + side-loaded (`<track>`)
caption tracks: a language-selecting action plus a family of ACEs for
side-loading external `.vtt` sources and enumerating the resulting track list
(`AddSubtitleSource`, `AddProjectSubtitleSource`, `HasSubtitles`,
`HasSubtitleLanguage`, `HasSubtitleLabel`, `OnSubtitlesAvailable`,
`GetSubtitleCount`, `GetSubtitleLanguageAt`, `GetSubtitleLabelAt`), backed by
`_subtitleSources` / `_subtitleTracks` state that the DOM side never populated
for YouTube.

The YouTube IFrame API has no equivalent for side-loaded tracks or for
enumerating tracks through a documented, stable API. What it does offer is:

- `playerVars.cc_load_policy` — captions on/off, applied only at player
  construction / video load (build-time, not live on a playing video);
- `playerVars.cc_lang_pref` — preferred caption language, same build-time
  constraint;
- an **unofficial**, undocumented module (`setOption`/`getOption('captions',
  ...)`) that can enumerate a playing video's caption tracks and switch
  languages live — confirmed reachable by the harness captions probe (#10),
  but not part of YouTube's documented API and could change or disappear.

So the enumeration and side-load ACEs modeled a capability YouTube's IFrame
API structurally does not expose the same way GCore did, while the single
language-selecting action/property/expression (`video-subtitles` property /
`SetSubtitles` action / `Subtitles` expression) maps directly onto
`cc_load_policy` / `cc_lang_pref` — it just wasn't wiring the language yet.

## Decision

### 1. Partial retire, not full retire

Unlike [ADR-0004](0004-retire-pre-release-quality-aces.md), where the entire
quality surface was inert and fully removed, here only **part** of the
subtitle surface was inert. The decision splits accordingly:

- **Retire** the 9 enumeration/side-load ACEs listed in Context above, plus
  their backing `_subtitleSources` / `_subtitleTracks` fields, the never-fed
  inbound `subtitleTracks` bridge branch, and their savegame keys/debugger
  rows. None of these had a YouTube equivalent; per ADR-0004's pre-release
  removal policy (§§1–2, still in effect pre-release), an inert ACE surface is
  removed rather than kept or stubbed.
- **Keep and enrich** the `video-subtitles` property / `SetSubtitles` action /
  `Subtitles` expression. This ACE was **never inert** — it already drove
  `cc_load_policy` before this change. ADR-0004 §2's "remove inert surface"
  default therefore never applied to it; keeping it is not an exception to
  that policy, it's simply out of that policy's scope. This change wires the
  second half of its job: `SetSubtitles`/the property now also set
  `cc_lang_pref` (preferred caption language) at player construction,
  alongside the existing `cc_load_policy` (on/off). The property stays at its
  existing index (idx1), avoiding the positional-property renumber trap noted
  in [ADR-0002](0002-playervars-mapping-constraints.md).

### 2. Build-time-only, consistent with `loop`/`start`

Both `cc_load_policy` and `cc_lang_pref` are `playerVars`, so — like `loop`
and `start` ([ADR-0002](0002-playervars-mapping-constraints.md)) — they apply
at player construction / next `Load Video`, not live on a playing video.
`SetSubtitles` on an already-loaded video changes what will apply next time a
video loads, not the current video's captions.

### 3. Sweep scope: 8 files touched, 6 are the ACE contract

The commit sweep spans 8 files, but not all for the same reason — worth
distinguishing so this isn't misread as an 8-file ACE-contract change (vs.
ADR-0004's 7-file contract sweep, itself since grown to include
`conditions.ts`):

- **6 true ACE-contract lockstep files**, each losing the 9 retired ACEs:
  `src/aces.json`, `src/lang/en-US.json`, `src/c3runtime/actions.ts`,
  `src/c3runtime/conditions.ts`, `src/c3runtime/expressions.ts`,
  `src/c3runtime/instance.ts`.
- **2 comment-only edits**, not part of the ACE contract: a TODO cleanup in
  `src/c3runtime/dom/ElementHandler.ts` (noting live caption switching is
  future work, not a missing wire-up) and a stale-comment fix in the
  editor-side `src/instance.ts` (the placeholder-text comment, unrelated to
  the runtime `c3runtime/instance.ts` above — see the memory note on this
  fork's dual `instance.ts` trap).

Both commits together (the `cc_lang_pref` wiring and the ACE retirement) are
one atomic sweep across the lockstep files, per the same "no intermediate
state has wrong indices" discipline ADR-0004 established.

## Compromise

### Rejected: MAP to the unofficial `setOption`/`getOption('captions', ...)` module

Building live track enumeration and live language-switching on the unofficial
module was considered, since the harness probe confirms it works on a playing
captioned video. Rejected for this pass for the same reason class ADR-0004
rejected mapping to YouTube's advisory quality API: the module is
undocumented and not a stable contract — it may change or disappear without
notice — and it only functions once a video is already playing with captions
available, unlike `playerVars` which apply unconditionally at construction.
Building an ACE surface on it now would risk shipping a capability that
silently breaks on a future YouTube change. Deferred to a future issue if
live caption control becomes a priority.

### Rejected: keep the enumeration ACEs as inert stubs

Same reasoning as ADR-0004: a callable-but-inert ACE misleads consumers and
tooling into thinking the capability is implemented rather than structurally
unavailable. Removal is the correct default in the pre-release window
(ADR-0004 §§1–2).

## Consequences

- The shipped caption surface is: `video-subtitles` property / `SetSubtitles`
  action set a BCP-47 language (or `"off"`) applied at the next `Load Video`;
  `Subtitles` expression reads the current setting. No side-loaded tracks, no
  enumeration ACEs.
- Live caption language switching on an already-playing video, and any use of
  the unofficial `setOption`/`getOption('captions', ...)` module, remain
  deferred to a future issue.
- `sample/` is GCore-bound (per issue #9's scope) and does not reference any
  of the retired ACEs, so this change does not touch it.
- `docs/usage.md` and `docs/youtube-player-api.md` are updated to describe
  only the shipped surface.

# 0008. Playback-rate and video-metadata ACEs

- **Status:** Accepted
- **Date:** 2026-07-07
- **Issue:** [GenvidTechnologies/c3addon-youtube-video-plugin#12](https://github.com/GenvidTechnologies/c3addon-youtube-video-plugin/issues/12) (part of epic [#1](https://github.com/GenvidTechnologies/c3addon-youtube-video-plugin/issues/1) — the GCore→YouTube port)

## Context

Issue #12 originally scoped 9 ACEs across three areas: playback rate control,
playlist navigation, and video metadata. During implementation the user
narrowed the scope to **7 ACEs** (1 action + 6 expressions) covering playback
rate and metadata only, deferring playlists entirely — see the Compromise
section.

A few constraints shaped the design:

- Construct expressions return scalars only (`number` or `string`); there is
  no array return type on the ACE surface (`src/aces.json`'s `expressions`
  schema has no list/array `returnType`), so YouTube's
  `getAvailablePlaybackRates(): number[]` cannot be exposed as a single
  expression.
- `getVideoData()` is an **unofficial, undocumented** YouTube IFrame API
  method — same posture class as the captions module in
  [ADR-0007](0007-captions-map-retire-subtitle-aces.md).
- `getVideoUrl()` overlaps semantically with the plugin's existing authored
  `URL` expression (the `video-url` property as set by the user), so the new
  expression needed a name that disambiguates the two.
- Whether `setPlaybackRate()` silently ignores an out-of-set rate, or clamps
  it, needed empirical checking rather than assumption — per the "Debugging
  the player" convention in `CLAUDE.md`.

## Decision

### 1. Available playback rates: indexed getter + count, not a CSV string

`GetAvailablePlaybackRate(index)` returns the rate at `index` (or `0` if out
of range); `GetAvailablePlaybackRateCount` returns the count. The instance
caches the raw `number[]` (`availablePlaybackRates`) as pushed by the DOM
seam and indexes into it at expression-evaluation time.

The design phase recommended a single comma-delimited string expression,
intended to be consumed via Construct's built-in `tokenat`/`tokencount`
system expressions. The user chose the indexed-getter pair instead, so the
rejected CSV-string alternative is recorded under Compromise rather than
silently dropped.

This is the surface's first **parameterized expression**
(`get-available-playback-rate` takes an `index: number` param) — its
`src/aces.json` shape was confirmed against the SDK's `expParameter` schema
before use, since every prior expression on this surface (per ADR-0001/0002)
took no parameters.

### 2. `GetVideoTitle` via the unofficial `getVideoData().title`, optional-guarded

`PostVideoMetadataState()` reads `this.player.getVideoData?.()?.title ?? ""`
inside a `try`/`catch`, logging a warning and never throwing; a failure or
absence degrades to `""`. Accepted with the same stability caveat ADR-0007
applied to the unofficial captions module: it is not a stable, documented
contract and may change or disappear.

**Empirically verified (2026-07-07, `test/player-test.html` + Playwright):**
`getVideoData()` currently returns `{ title, video_id, author }` — e.g.
title `"YouTube Developers Live: Embedded Web Player Customization"` — so it
works today. As an undocumented API it may still change, or return an empty
title for some video types (live streams, age-restricted content).

### 3. New expression `GetPlayerUrl`, not `GetVideoUrl`

Named `GetPlayerUrl` specifically to disambiguate from the existing authored
`URL` expression:

- `URL` returns the authored `video-url` property (what the user set).
- `GetPlayerUrl` returns `getVideoUrl()` — the player's current canonical
  URL, which can differ from the authored input.

Empirically, requesting `https://www.youtube.com/watch?v=M7lc1UVf-VE` and
reading it back via `GetPlayerUrl` returns the same canonical
`watch?v=` form, but the two can diverge after canonicalisation or after a
reuse-load (`loadVideoById`) changes the video without changing the authored
property.

### 4. `SetPlaybackRate` is pass-through — no client-side clamp

`OnSetPlaybackRate` forwards the requested rate to `player.setPlaybackRate()`
unvalidated. Correctness relies on the pattern established by
[ADR-0003](0003-mute-state-decoupled-from-volume.md): the DOM seam is the
single authority for player-derived state, so `GetPlaybackRate` is kept
authoritative by pushing the actual applied rate from YouTube's
`onPlaybackRateChange` event, and from `onReady`/`onStateChange` (`PLAYING`,
`CUED`) via `PostVideoMetadataState()`. `GetPlaybackRate` therefore always
reports the truly-applied rate regardless of what was requested.

**Empirical finding (2026-07-07):** an out-of-set rate is not strictly
ignored — it can be **clamped to the nearest available rate**. Requesting a
rate of `3` when the available set's maximum was `2` resulted in an applied
rate of `2`. Requesting a valid `1.5` applied `1.5` unchanged. Either
outcome is captured correctly because `getPlaybackRate()` reports reality —
which is exactly why the pass-through design is safe without a client-side
clamp. Authors who need to pre-validate a rate should read
`GetAvailablePlaybackRate`/`GetAvailablePlaybackRateCount` first.

### 5. `GetVideoLoadedFraction` served by a dedicated, self-terminating poll

`StartLoadedFractionPolling()` runs a ~500 ms interval, independent of the
existing PLAYING-only 250 ms playback poll (`StartPlaybackPolling`). It is
started from `onReady` (first load) and from the reuse branch of
`CreatePlayer` (`loadVideoById`), and self-terminates once the fraction
reaches `1.0` or the player is destroyed/goes offline (`DestroyPlayer` calls
`StopLoadedFractionPolling`).

Rationale: buffering can advance independently of playback state, and the
existing playback poll only runs while `PLAYING`.

**Empirical nuance (2026-07-07, recorded honestly):** in testing, the loaded
fraction advanced while playing (`0.067` → `0.099`) but did **not** continue
climbing during a mid-video pause (plateaued at ~`0.099` over 2.5 s) — for
that video, buffering was gated by play state, not independent of it. So the
dedicated poll's concrete benefit here is primarily that it **decouples** the
pushed value from the playback poll's PLAYING-only lifecycle and
self-terminates at full buffer, rather than a proven "keeps climbing while
paused" behaviour — that benefit may be video- or CDN-dependent and should
not be oversold.

### 6. Playlist load and navigation deferred entirely

`NextVideo`/`PreviousVideo`/`PlayVideoAt` and the `loadPlaylist`/
`cuePlaylist`/`listType` load surface are **not** part of this change,
continuing [ADR-0006](0006-video-url-parsing-scope.md)'s parse-only stance
on playlists. See Compromise.

## Compromise

### Rejected: comma-delimited string for available playback rates

Recommended during design as `GetAvailablePlaybackRates(): string` (e.g.
`"0.25,0.5,1,1.5,2"`), to be consumed via Construct's built-in
`tokenat`/`tokencount` system expressions rather than adding a parameterized
expression to this plugin. The user rejected this in favor of the indexed
getter + count pair (Decision §1), preferring a typed, plugin-native
accessor over string parsing in the event sheet. Recorded here so the
rejected alternative stays visible for any future revisit.

### Rejected: shipping playlist navigation ACEs inert

Issue #12 originally included `NextVideo`/`PreviousVideo`/`PlayVideoAt` plus
a playlist load path. Since [ADR-0006](0006-video-url-parsing-scope.md)
already scoped `extractVideoId()` to parse-only (playlists are recognized
but not loaded), the navigation ACEs would have had **zero observable
effect** without a load path to navigate — there is no playlist state to
navigate within. Shipping them as callable-but-inert stubs was rejected for
the same reason ADR-0004 and ADR-0007 rejected inert stubs elsewhere: it
misleads consumers into thinking a capability exists that structurally
doesn't yet. The whole playlist unit — load, navigate, and any list-position
expressions — is deferred coherently to a follow-up issue rather than
partially shipped.

### Accepted risk: `GetVideoTitle` on an unofficial API

Building `GetVideoTitle` on `getVideoData()` was accepted despite the API
being undocumented, because it is currently the only way to surface the
video's title and the failure mode is fully contained (optional-chained,
try/catch, degrades to `""`, never throws). This mirrors ADR-0007's
acceptance of risk for build-time captions wiring, but not its rejection of
the *unofficial* captions module for a full ACE surface — the difference is
blast radius: a single optional string read here vs. a whole enumeration/
live-switching surface there.

## Consequences

- The ACE surface stays scalar-only (no array return type introduced) and
  purely additive — no plugin property was added, so there is no positional
  renumber (contrast [ADR-0002](0002-playervars-mapping-constraints.md)).
- The raw `availablePlaybackRates: number[]` is cached on the instance even
  though the exposed ACEs are scalar; a future native array/list return type
  would let this be re-exposed without re-deriving it from the player.
- `GetVideoTitle` carries a known unofficial-API risk: it may return `""`
  for some video types (live, age-restricted) or change behaviour on a
  future YouTube update, without warning beyond a console log.
- Authors have two URL-shaped expressions (`URL` vs `GetPlayerUrl`) and must
  pick the right one for their use case; the language file's descriptions
  are the disambiguation surface.
- Each active player now runs one additional bounded timer
  (`loadedFractionTimer`) alongside the existing playback poll; it
  self-terminates at full buffer and on destroy, so it does not leak.
- Playlist load and navigation remain deferred; a follow-up issue must be
  filed and cross-linked from [ADR-0006](0006-video-url-parsing-scope.md)
  and this record.

# 0005. Awaitable Load Video — polled `getDuration()` readiness signal

- **Status:** Accepted
- **Date:** 2026-06-30
- **Issue:** [GenvidTechnologies/c3addon-youtube-video-plugin#18](https://github.com/GenvidTechnologies/c3addon-youtube-video-plugin/issues/18)

## Context

The `set-url` action (Load Video) drove video loading through `_updateElementState()` — a
fire-and-forget message. Authors who placed `Set playback time` on the line after `Load Video`
in an event sheet were racing the asynchronous `loadVideoById` call; the seek could arrive
before metadata was loaded and be silently dropped.

Issue #18 was filed to make `Load Video` awaitable so a post-load action on the next
event-sheet line reliably applies to the new video.

The upstream GCore plugin (PR #8 / commit `bf00ebf`) solved the same problem by resolving
the load promise at GCore's per-load `Ready` event. That approach cannot be ported directly
because the YouTube IFrame API has different timing contracts.

**Why `onReady` does not work here.** The YouTube IFrame API fires `onReady` once per player
construction — not per `loadVideoById`. On player reuse, no `onReady` fires, so a
resolve-at-`onReady` strategy hangs indefinitely on every video after the first.

**Why resolving at `PLAYING` / `onStateChange` is unreliable.** `PLAYING` fires roughly
2 seconds after metadata is known, unnecessarily delaying an otherwise-ready seek. More
critically, when autoplay is blocked by the browser, `PLAYING` may never fire at all — the
event sheet would wait out the full 15-second timeout.

These observations were established empirically by driving `test/probe-load-timing.html` via
the Playwright MCP in a focused tab: `onReady` fired only at construction, never on reuse;
`getDuration() > 0` became true ~1.3s into a first load (2.1s before PLAYING arrived); on a
reuse load the gap was ~1.0s; in an unfocused-tab run PLAYING never fired at all.

**Premise correction relative to upstream.** Upstream GCore cited `Set Quality`, `Set
playback time`, and `Set Subtitles` as beneficiaries. In this fork: `Set Quality` was retired
(see [ADR-0004](0004-retire-pre-release-quality-aces.md) / issue #5) and is not applicable;
`Set Subtitles` is not yet wired (open issue #6) and will benefit only once that issue lands.
The concrete present-day beneficiary is **`Set playback time`** (`seekTo` after a fresh load).

## Decision

### 1. Mark `set-url` as `isAsync: true`

`src/aces.json` gains `"isAsync": true` on the `set-url` entry. The ACE id, script name, and
parameter list are unchanged (per [ADR-0001](0001-additive-v2-api-expansion.md) §1).
Back-compatibility is preserved: Construct wraps every action in a promise regardless — event
sheets that do not `Await Load Video` are unaffected.

### 2. Readiness signal: poll `getDuration() > 0`

When a new video is loaded, `ElementHandler.OnLoadVideo` starts a 100ms interval poll calling
`player.getDuration()`. A return value greater than zero means the player has loaded video
metadata — `seekTo`, quality, and caption calls are now safe. This is the signal used to
resolve the load promise.

`onReady` and `PLAYING` are not used as resolve signals (see Context for why).

### 3. Settle semantics: always resolves, never rejects

The load promise settles (resolves to `null`) on whichever of these occurs first:

- `getDuration() > 0` — video metadata loaded (the success path)
- `onError` fires — the load failed
- 15-second timeout — safety valve against infinite hangs
- A subsequent `Load Video` call supersedes this load
- `Destroy()` is called

"Resolved" means the load attempt is *done*, not that it *succeeded*. Authors distinguish
outcomes via the **On error** trigger and **Is ready** condition, not by catching a rejection.

### 4. Generation counter and `sawReset` guard

A per-instance `loadGen` counter is incremented at the start of each `OnLoadVideo` call. All
callbacks (poll interval, timeout, `onError`) capture the generation at registration time and
are silently ignored when `loadGen` has since advanced (supersession guard).

On player reuse, `loadVideoById` briefly continues to report the old video's duration before
resetting to zero. A `sawReset` flag within each poll closure requires that `getDuration()`
first return `0` (or that no player exists yet) before a subsequent `> 0` value is accepted,
preventing stale duration from resolving the new load prematurely.

### 5. DOM-bridge async mode

`_SetURL` in `instance.ts` returns
`this._postToDOMElementAsync("loadVideo", this._getElementState())` instead of the previous
fire-and-forget `_updateElementState()`. In `domSide.ts`, `"loadVideo"` is registered outside
the void-typed handler map so its `Promise` return value is forwarded through Construct's
runtime async bridge rather than discarded.

This is the first use of `_postToDOMElementAsync` in this fork. See
[`architecture.md`](../architecture.md) for the bridge mode documentation.

## Compromise

### Rejected: direct port of GCore resolve-at-`Ready`

The GCore handler resolves the load promise at a per-load `Ready` event. YouTube's `onReady`
fires once per player construction, not per `loadVideoById`. This approach resolves the first
load correctly but hangs indefinitely on every subsequent reuse load. Not viable.

### Rejected: resolve at `PLAYING` / `onStateChange`-only

Resolving when the state transitions to `PLAYING` appears simple but has two failure modes:
(1) `PLAYING` arrives ~2 seconds after metadata is known, unnecessarily delaying an
otherwise-ready seek; (2) when autoplay is blocked, `PLAYING` may never fire. Both failure
modes were observed empirically in `test/probe-load-timing.html`.

### Rejected: resolve runtime-side off `_isReady`

The runtime's `_isReady` gate (`_currentVolume > -1 && _duration > -1`) already tracks a
notion of load readiness. Resolving from the runtime side without a DOM round-trip would keep
more logic out of `ElementHandler.ts`. Rejected because it conflates *load-readiness*
(metadata known from `getDuration()`) with *display state* (volume polled in separately),
couples the awaitable signal to `_isReady`'s existing semantics (which may need to diverge),
and places player-timing logic in `instance.ts` rather than the single seam — contrary to the
architecture mandate (see [`architecture.md`](../architecture.md)).

### Accepted cost: separate registration for the async handler

Using `_postToDOMElementAsync` requires registering `"loadVideo"` in `domSide.ts` outside
the void-typed handler map, as a small but permanent structural difference from the other
message handlers. This is the minimal cost to route the Promise through the runtime async
bridge correctly.

## Consequences

- `Load Video` is awaitable. An event-sheet sequence of `Await Load Video(url)` then
  `Set playback time(t)` reliably applies `seekTo` after the new video's metadata is loaded.
- Event sheets that do not await `Load Video` behave identically to before (full back-compat).
- "Resolved" does not mean "succeeded" — authors branch via `On error` and `Is ready`, not by
  catching a rejection.
- Once issue #6 (subtitles) lands, `Set Subtitles` after `Load Video` will also benefit.
- The async DOM bridge mode (`_postToDOMElementAsync`) is now established in the fork; future
  DOM actions that need a round-trip resolve signal follow the same pattern.
- The `sawReset` flag and `loadGen` counter are the canonical model for supersession-safe load
  state in this plugin.

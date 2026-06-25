# 0002. playerVars mapping constraints for issue #3

- **Status:** Accepted
- **Date:** 2026-06-25
- **Issue:** [genvid-holdings/c3addon-youtube-video-plugin#3](https://github.com/genvid-holdings/c3addon-youtube-video-plugin/issues/3)

## Context

Issue #3 wires the `playerVars` object passed to `YT.Player` at construction,
mapping plugin properties and handler state to the YouTube IFrame API parameters
that govern autoplay, looping, captions, chrome, and related-video behaviour.

Several decisions during implementation have durable consequences for future work,
particularly around property index ordering, mute lifecycle ownership, and
export-target compatibility.

## Decision

### 1. Mute playerVar sourced from handler state; ownership deferred to #4

`mute` is set from `lastMuted` (handler-internal audio state, default `true`)
rather than from a dedicated editor property. The default-muted value also
satisfies the browser autoplay-requires-mute policy, so no separate mechanism is
needed. Issue #4 will own the full mute/volume lifecycle and will only change
where `lastMuted`'s initial value comes from — nothing in the `buildPlayerVars`
mapping needs to be undone.

### 2. Append-only positional property contract (shared with issue #7)

`instance.ts` reads plugin properties positionally. The new `loop` and `start`
properties are appended at idx5 and idx6 respectively, after all existing
properties. Inserting them at any earlier index would silently corrupt Construct
projects and save-game data that bind properties by position.

Issue #7 is scheduled to remove the GCore-only `no-low-latency` (idx2) and
`enable-dvr` (idx4) properties. When that removal lands, it **must** renumber
`loop` and `start` down to idx3 and idx4 in the same commit as the removal.
Doing the removal and the renumber in separate commits leaves a window where
the indices are wrong.

### 3. Origin scheme guard

`origin` is passed to YouTube only when `window.location.origin` matches
`^https?://`. Under file-scheme export targets — Cordova (`file://`),
Steam/NW.js/Electron (`app://` or `file://`), and the Construct editor preview —
the guard omits `origin` rather than passing an invalid string that would break
YouTube's postMessage handshake.

### 4. `modestbranding` omitted; `rel: 0` caveat accepted

`modestbranding` is intentionally absent: YouTube deprecated and removed it in
2023. Wiring it would be dead configuration that misleads future maintainers.

`rel: 0` is included as a literal, but it no longer fully suppresses related
videos. Since approximately 2018, `rel=0` restricts the end-screen suggestions
to the same channel only; it does not remove them. No playerVar can fully
suppress them, so this is accepted as a known limitation rather than a bug to fix.

### 5. `loop` and `start` are build-time-only

`playerVars` are passed at `YT.Player` construction and have no live setters.
`loop` and `start` are therefore not re-applied on the `loadVideoById` reuse
path (URL change with an existing player). A full player rebuild is required to
change either value. This is a documented limitation, not an oversight; live ACE
setters for these vars are not planned.

## Compromise

### Rejected: mute editor property in #3

Adding a mute property in this issue would have introduced the property before
the mute/volume lifecycle (issue #4) was designed. Issue #4 is the right place
to decide whether mute is a persistent setting, a session-only default, or
something else. Shipping a property now and removing or changing it in #4 would
break the positional contract.

### Rejected: inserting `loop`/`start` before GCore-only properties

Inserting the new properties before `no-low-latency` (idx2) or `enable-dvr`
(idx4) would have produced cleaner final indices after #7's removal, but would
have immediately broken the positional bindings of any project that already uses
the current property set. Appending at idx5/idx6 is safe today; #7 re-packs the
indices when it removes the GCore stubs.

### Rejected: passing `origin` unconditionally

Passing `window.location.origin` without a scheme check would send strings like
`"file://"` or `"null"` to YouTube under Cordova/Steam/Electron export targets.
YouTube uses `origin` for postMessage channel validation; an invalid origin
breaks the embed silently. The scheme guard costs one regex check at construction
time and avoids a class of hard-to-diagnose runtime failures in non-web targets.

### Accepted cost: playerVars apply at construction only

Accepting build-time-only semantics for `loop` and `start` means that changing
either while a video is loaded requires a player rebuild (teardown + reconstruct),
which causes a brief playback interruption. This matches the existing rebuild
discipline established by `SetURL` and documented in
[0001-additive-v2-api-expansion.md](0001-additive-v2-api-expansion.md).

## Consequences

- `lastMuted` (default `true`) is the sole source of the initial mute state;
  issue #4 will change the initial value without touching `buildPlayerVars`.
- `loop` is idx5 and `start` is idx6 until issue #7 re-packs the property list.
  Issue #7's implementation checklist must include the renumber.
- Non-HTTP(S) export targets (Cordova, Steam, editor preview) omit `origin` and
  rely on YouTube's default origin behaviour.
- `modestbranding` is not wired; any future request to re-enable it requires
  verifying that YouTube has restored the parameter.
- `rel: 0` does not fully suppress related videos — same-channel restriction only.
- Empirical verification of `loop` survival across `loadVideoById` and
  `modestbranding` no-op status is deferred to issue #10 (test harness).

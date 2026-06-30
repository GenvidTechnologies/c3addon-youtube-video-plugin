# 0003. Mute state (`audioState`) is authoritative from the DOM side, decoupled from reported volume

- **Status:** Accepted
- **Date:** 2026-06-25
- **Issue:** [GenvidTechnologies/c3addon-youtube-video-plugin#4](https://github.com/GenvidTechnologies/c3addon-youtube-video-plugin/issues/4) (part of epic [#1](https://github.com/GenvidTechnologies/c3addon-youtube-video-plugin/issues/1) — the GCore→YouTube port)

## Context

Issue #4 implements the volume and mute lifecycle for the YouTube IFrame port.
During that work, `src/c3runtime/instance.ts` was inferring mute-state
(`_audioState`) from the reported volume: `currentVolume === 0 ⇒ "muted"`,
`currentVolume > 0 ⇒ "unmuted"`.

That inference is correct for a player where volume 0 and muted are the same
concept, but it is **wrong for the YouTube IFrame API**. `YT.Player.getVolume()`
returns the volume level independently of mute state — a muted player still
reports its prior level (e.g. 50). Polling volume during playback would therefore
flip `IsMuted` to `false` even while the player is muted, producing a split
between what `IsMuted` reports and the player's actual audio state.

## Decision

Decouple mute state from volume entirely.

The DOM-side seam (`src/c3runtime/dom/ElementHandler.ts`) is the single authority
for mute state. Whenever it reports audio information it posts an explicit
`audioState` field derived from `YT.Player.isMuted()`. `instance.ts` stores the
received `currentVolume` and stores the received `audioState` separately; it does
not derive one from the other.

Volume and mute are treated as independent state — consistent with the YouTube
API's own model: `setVolume` does not unmute, and `mute` does not zero the
volume.

The `_isReady` gate continues to key off `_currentVolume > -1 && _duration > -1`,
which is unaffected by this change.

## Compromise

### Rejected: fix inside `ElementHandler` only (stop polling volume)

An alternative fix would keep `instance.ts` unchanged and stop posting
`currentVolume` from the polling path — posting it only from explicit set-calls
and the `onReady` callback. This would avoid the mute clobber without crossing
into `instance.ts`.

Rejected because `GetCurrentVolume` would then not reflect volume changes the
user makes via YouTube's own native chrome controls. And re-introducing volume
polling from `ElementHandler` to catch those external changes would re-introduce
the mute clobber. The decouple is the correct forward-looking fix even though it
crosses a file boundary.

### Accepted cost: `instance.ts` change

Decoupling requires a deliberate change to `instance.ts` (store `audioState` as
received, not derived). This is a small, targeted touch, and it establishes the
correct precedent for all future player-derived state in the plugin (see
Consequences below).

## Consequences

- `IsMuted` reflects `YT.Player.isMuted()` as reported by the DOM seam, not the
  volume level. A muted player at volume 50 correctly reports `IsMuted = true`.
- Volume and mute can be set and read independently, matching the YouTube API
  contract.
- This establishes the pattern for **all** player-derived state in this plugin:
  the DOM seam computes and posts authoritative state; `instance.ts` stores what
  it receives rather than re-deriving player semantics it cannot observe.
  Issue #5 retired the quality surface rather than porting it — see
  [ADR-0004](0004-retire-pre-release-quality-aces.md). The captions (#6) port is still
  open and should follow the same rule — post explicit derived state from the seam, do
  not infer it in the runtime.
- The `_isReady` gate (`_currentVolume > -1 && _duration > -1`) is unchanged and
  unaffected.

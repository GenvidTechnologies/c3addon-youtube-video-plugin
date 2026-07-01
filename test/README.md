# Manual player test harness

`player-test.html` is a standalone raw `YT.Player` bench for exercising the
[YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
**outside Construct 3** — useful when debugging playback, sizing, audio, or
player-internal behaviour without the Construct runtime in the way. There is no
automated test suite; this is a manual harness.

See [`../docs/youtube-player-api.md`](../docs/youtube-player-api.md) for the
full write-up of the API surface the plugin uses.

## Running it

The page loads the YouTube IFrame API as a **classic (non-module) script** from
`https://www.youtube.com/iframe_api`. Serve it over `http://` rather than
opening it as a `file://` URL — the `origin` playerVar (which drives YouTube's
postMessage handshake) is only populated on `http(s)` origins; on `file://` the
handshake is skipped and some state-change events may not fire:

```bash
# from the repo root
npx http-server -c-1 .      # or: python -m http.server
# then open http://localhost:8080/test/player-test.html
```

Open the browser **console** and **Network** tab. The page auto-loads the
default video on startup. Enter any video id or YouTube URL, then click
**Load**.

## Control surface

The finalized controls mirror the plugin's ACEs:

- **Video id / URL input** — accepts bare ids, `watch?v=`, `youtu.be/`,
  `/embed/`, `/shorts/`, `/v/` URLs. A **Force player rebuild** checkbox
  switches between `loadVideoById` (reuse path, default) and a full
  `YT.Player` construction.
- **Playback** — Play, Pause, Seek −10s / +10s, with a live time / duration
  readout.
- **Audio** — Mute, Unmute, Set Volume 0 / 50 / 100, Read vol/mute.
- **Resize** — `setSize(640, 360)` / `setSize(320, 180)`.
- **Event log** — all `onReady`, `onStateChange`, `onError`, and
  `onPlaybackQualityChange` callbacks are printed with millisecond-relative
  timestamps. A **Clear log** button resets it.

## Exploratory probes

The page also contains labeled probe sections (marked "player-internal, NOT
plugin ACEs") that settle the empirical questions `docs/youtube-player-api.md`
defers to issue #10:

| Probe | Question |
|---|---|
| **Loop survival** | Does `loop:1` (set at player construction) survive a `loadVideoById` call with a different video id on the reuse path? |
| **modestbranding** | Is the `modestbranding:1` playerVar truly a visual no-op post-2023, as documented? |
| **Autoplay unmute** | After autoplay-muted start, does calling `unMute()` on the first `PLAYING` event (without a user gesture) succeed under the browser autoplay policy? Feeds issue #4. |
| **Captions module** | Does the unofficial `setOption`/`getOption` captions module exist and accept `track`/`reload`/`tracklist` keys? Feeds issue #6. |
| **Quality (advisory)** | What does `getAvailableQualityLevels()` / `setPlaybackQuality()` actually return/do? Advisory-only; numeric ABR quality ACEs were retired — see ADR-0004. |

The **Loop survival** and **modestbranding** probes settle empirical questions
deferred in [`../docs/youtube-player-api.md`](../docs/youtube-player-api.md); the
others feed tracked issues (autoplay → #4, captions → #6) or an existing decision
(quality → ADR-0004).

Each probe builds its own `YT.Player` instance (or reuses the current one) and
logs all events to the shared event log so you can observe the full state
sequence.

## Focused load-timing probe

[`probe-load-timing.html`](probe-load-timing.html) is a separate, narrowly
scoped probe for issue #18 (awaitable Load Video). It records, for both a first
load and a player-reuse `loadVideoById` load, the full state timeline and when
`getDuration()` first becomes greater than zero — the signal the awaitable
implementation resolves on. Use it when you need to re-verify the resolve
strategy rather than the general player surface.

## Automated probing (optional)

This page can also be driven headlessly with Playwright (e.g. capturing the
event log to confirm state transitions and audio reads). Playwright is not a
project dependency; install it in a scratch directory if needed, or use the
Playwright Claude Code plugin (`browser_*` tools) if it is available in your
session.

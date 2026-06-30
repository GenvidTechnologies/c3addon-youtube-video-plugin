# YouTube IFrame Player API — surface used by this plugin

> **Status: scaffold.** This plugin was forked from the GCore video plugin and is
> being ported to the [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference).
> The notes below describe the intended integration; the empirically-verified
> findings will be filled in as `ElementHandler.ts` is built out. Remaining work
> is tracked in the repo's GitHub issues.

All coupling to the YouTube player lives in
[`src/c3runtime/dom/ElementHandler.ts`](../src/c3runtime/dom/ElementHandler.ts)
(see [architecture.md](architecture.md)). This doc records the API surface that
file depends on.

## Loading the API

The IFrame API is a **classic (non-module) script** loaded from
`https://www.youtube.com/iframe_api`. `plugin.ts` declares it as a remote script
dependency (which also puts it on Construct's CSP allow-list for exported games):

```ts
this._info.AddRemoteScriptDependency("https://www.youtube.com/iframe_api");
```

The script loads `www-widgetapi.js`, installs a global `YT` namespace, and then
calls `window.onYouTubeIframeAPIReady()`. `ElementHandler.loadYouTubeAPI()`
resolves a single shared promise off that hook (chaining any pre-existing
handler), and also injects the script itself as a fallback so the handler works
standalone (e.g. in [`test/player-test.html`](../test/player-test.html)).

## Building a player

`new YT.Player(container, options)` **replaces** the container element with a
YouTube `<iframe>`. Construct hands us a `<div>` (see `domSide.ts`) to build on.
Key options: `videoId`, `playerVars`, and `events` (`onReady`, `onStateChange`,
`onError`, `onPlaybackQualityChange`).

### playerVars mapping (issue #3)

`buildPlayerVars(videoId)` assembles the `playerVars` object passed to `YT.Player`
at construction. Each var, its source, and any caveats:

| playerVar | Value | Source |
|---|---|---|
| `autoplay` | `1` | literal — required for inline playback |
| `playsinline` | `1` | literal — prevents iOS full-screen hijack |
| `rel` | `0` | literal — restricts related videos to the same channel (see caveat below) |
| `controls` | `1` / `0` | `enable-chrome` plugin property |
| `mute` | `1` / `0` | handler `lastMuted` state (default `true`; satisfies browser autoplay-requires-mute policy) |
| `cc_load_policy` | `1` / `0` | derived from `video-subtitles` property (`"off"` → 0, any other → 1) |
| `loop` | `1` | NEW `loop` plugin property (idx5); absent when false |
| `playlist` | `videoId` | included whenever `loop` is set — YouTube requires `playlist=<id>` for single-video looping |
| `start` | `<n>` | NEW `start` plugin property (idx6); omitted when ≤ 0 |
| `origin` | `window.location.origin` | runtime-derived via `safeOrigin()` guard (see below); omitted when not `http(s)` |
| `modestbranding` | — | **intentionally omitted** — YouTube deprecated and removed this parameter in 2023; passing it has no effect |

**`rel: 0` caveat.** Since approximately 2018, `rel=0` no longer fully disables
related videos; it only restricts them to videos from the same channel. There is
no playerVar that fully suppresses the end-screen suggestions.

**`origin` scheme guard.** `safeOrigin()` passes `window.location.origin` only
when it matches `^https?://`. In contexts where the origin is not an HTTP(S) URL
— Construct editor preview, Cordova (`file://`), Steam/NW.js/Electron
(`app://` or `file://`) — `origin` is omitted rather than passing an invalid
string that would break YouTube's postMessage handshake.

**Build-time-only limitation.** `playerVars` are passed at `YT.Player` construction
and have no live setter. `loop` and `start` are therefore not changed while a player
is running, and are NOT re-applied on the `loadVideoById` reuse path (URL change
with an existing player). A full player rebuild is required to change either value.
Empirical verification of these constraints (does `loop` survive `loadVideoById`;
is `modestbranding` truly a no-op in current YouTube) is deferred to issue #10
(the YouTube test harness).

## Methods (control)

`playVideo()`, `pauseVideo()`, `seekTo(seconds, allowSeekAhead)`, `mute()`,
`unMute()`, `isMuted()`, `setVolume(0..100)`, `getVolume()`, `getDuration()`,
`getCurrentTime()`, `setSize(width, height)`, `loadVideoById(id)`, `destroy()`.

## Open questions / TODO

These map to the development-task issues:

- **State mapping.** *Core playback done (#2).* `onStateChange` maps
  `YT.PlayerState` (UNSTARTED / ENDED / PLAYING / PAUSED / BUFFERING / CUED) to the
  plugin's `playerState`; `onReady` posts `duration` / `currentVolume` (and
  `audioState`) so the runtime reaches its "ready" state; `currentPlaybackTime` is
  polled while playing (YouTube has no `timeupdate` event). `onError` maps the YT
  error codes to readable messages. Still open: captions/subtitle
  fields (see the bullets below and their issues).
- **Audio lifecycle.** *Done (#4).* `lastVolume`/`lastMuted` (the user's intent via
  the ACEs) are restored on `onReady` and re-applied on each `loadVideoById` (which
  does not re-fire `onReady`); the autoplay forced-mute is reconciled by unmuting on
  the `PLAYING` event when the user's intent was unmuted; `currentVolume`/`audioState`
  are posted after set-calls and in the playback poll. Mute-state is decoupled from
  volume — the DOM seam is authoritative for `audioState` (from `isMuted()`) and the
  runtime no longer infers mute from `getVolume()`; see
  [decisions/0003-mute-state-decoupled-from-volume.md](decisions/0003-mute-state-decoupled-from-volume.md).
  Empirical verification that the browser autoplay policy actually permits the
  unmute-on-`PLAYING` (without a user gesture) is deferred to the test harness (#10)
  and sample project (#9).
- **playerVars mapping.** *Done (#3).* All initial playerVars are wired; see the
  table above. Empirical verification of `loop`/`modestbranding` behavior deferred
  to issue #10.
- **Awaitable Load Video (#18).** Upstream GCore made the `set-url` ACE awaitable,
  resolving the load promise at GCore's per-load `Ready` event so post-load
  settings (subtitles / seek) don't race the async load. **That contract
  does not port directly:** YouTube's `onReady` fires once at player creation and
  does **not** re-fire on the `loadVideoById` reuse path (see "Audio lifecycle"
  above), so a YouTube awaitable-load must settle on a different per-load signal —
  likely an `onStateChange` transition (e.g. to `CUED`/`PLAYING`) after the load.
  *Hypothesis, not yet verified empirically* — pin down the actual signal with the
  test harness before implementing. Tracked in issue #18.
- **URL → video id.** `extractVideoId()` handles `watch?v=`, `youtu.be/`,
  `/embed/`, `/shorts/`, `/v/`, and bare ids. Confirm the set of inputs Construct
  authors will actually paste.
- **Quality.** The numeric ABR quality ACEs were retired in issue #5 — see [ADR-0004](decisions/0004-retire-pre-release-quality-aces.md). YouTube quality is advisory/deprecated; no replacement surface is planned.
- **Captions.** YouTube captions are controlled via `playerVars.cc_load_policy`
  and the (unofficial) caption module, not the in-manifest/side-loaded track
  model the GCore ACEs use.
- **GCore-only ACEs.** `SetNoLowLatency`, `SetEnableDVR`, `SetFallbackURLs`, and
  the manifest-resolution machinery have no YouTube equivalent and are slated for
  removal/remap (see issues).

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
Key options: `videoId`, `playerVars` (`autoplay`, `controls`, `playsinline`,
`mute`, `cc_load_policy`, …), and `events` (`onReady`, `onStateChange`,
`onError`, `onPlaybackQualityChange`).

## Methods (control)

`playVideo()`, `pauseVideo()`, `seekTo(seconds, allowSeekAhead)`, `mute()`,
`unMute()`, `setVolume(0..100)`, `getVolume()`, `getDuration()`,
`getCurrentTime()`, `setSize(width, height)`, `loadVideoById(id)`, `destroy()`.

## Open questions / TODO

These map to the development-task issues:

- **State mapping.** *Core playback done (#2).* `onStateChange` maps
  `YT.PlayerState` (UNSTARTED / ENDED / PLAYING / PAUSED / BUFFERING / CUED) to the
  plugin's `playerState`; `onReady` posts `duration` / `currentVolume` (and
  `audioState`) so the runtime reaches its "ready" state; `currentPlaybackTime` is
  polled while playing (YouTube has no `timeupdate` event). `onError` maps the YT
  error codes to readable messages. Still open: quality/captions/DVR/subtitle
  fields (see the bullets below and their issues).
- **URL → video id.** `extractVideoId()` handles `watch?v=`, `youtu.be/`,
  `/embed/`, `/shorts/`, `/v/`, and bare ids. Confirm the set of inputs Construct
  authors will actually paste.
- **Quality.** YouTube quality is advisory and uses *named* levels
  (`setPlaybackQuality("hd720")`), not the numeric ABR index the GCore-era ACEs
  assume. Decide how/whether to map the existing `SetQuality` ACE.
- **Captions.** YouTube captions are controlled via `playerVars.cc_load_policy`
  and the (unofficial) caption module, not the in-manifest/side-loaded track
  model the GCore ACEs use.
- **GCore-only ACEs.** `SetNoLowLatency`, `SetEnableDVR`, `SetFallbackURLs`, and
  the manifest-resolution machinery have no YouTube equivalent and are slated for
  removal/remap (see issues).

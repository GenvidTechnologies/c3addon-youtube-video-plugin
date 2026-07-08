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
`https://www.youtube.com/iframe_api`. It is injected **DOM-side** by
`ElementHandler.loadYouTubeAPI()` (a plain `<script>` on the main thread, the
same technique as Construct's own official YouTube sample):

```ts
const tag = document.createElement("script");
tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);
```

The script loads `www-widgetapi.js`, installs a global `YT` namespace, and then
calls `window.onYouTubeIframeAPIReady()`. `ElementHandler.loadYouTubeAPI()`
resolves a single shared promise off that hook (chaining any pre-existing
handler); the injection is guarded by an **own marker** (`data-yt-iframe-api`)
so it loads exactly once, and standalone too (e.g. in
[`test/player-test.html`](../test/player-test.html)).

### Why NOT `AddRemoteScriptDependency` (the CORS gotcha)

`plugin.ts` deliberately does **not** declare the API via
`AddRemoteScriptDependency`. That call emits a clean classic `<script>` on
**export**, but in **preview** (`preview.construct.net`) Construct adds
`crossorigin` to the tag (to track load success), which turns it into a CORS
request. `youtube.com/iframe_api` sends **no** `Access-Control-Allow-Origin`
header, so the load fails with *"blocked by CORS policy"* — and empirically
(2026-07-03) Construct **awaits** that dependency, so the rejection **aborts
runtime startup** before any runtime/DOM script runs: the project never loads in
local preview.

A plain DOM `<script>` (created at runtime by `ElementHandler`) is **not**
CORS-gated, so it loads in local preview, remote preview, and export alike. The
trade-off is that the URL is no longer on Construct's export CSP allow-list —
acceptable here, since the player `<iframe>` needs a `frame-src` allowance
regardless, so that call never covered the whole story.

### The player iframe: pre-created, in-container, credentialless

`ElementHandler` does **not** let `new YT.Player(div)` create the iframe (that
replaces the `div`, detaching the element Construct manages so the player "stays
invisible"). Instead it **pre-creates an `<iframe>`** with the `.../embed/<id>?…`
URL (`enablejsapi=1` + the player vars), appends it **inside** the
Construct-managed container `<div>`, then attaches `new YT.Player(iframe, …)` to
it in place (the approach Construct's own official YouTube sample uses). Two
problems this solves:

1. **Visibility.** The iframe lives inside the container Construct
   positions/sizes/shows, so `set-visible` and layout geometry reach the player.
   It fills the container (`100%`) and re-enables `pointer-events` (the container
   sets `pointer-events:none` for game input) so YouTube's chrome stays usable.

2. **Cross-origin isolation (COOP+COEP) — the black-screen-with-spinner bug.**
   When the page is cross-origin isolated (`window.crossOriginIsolated === true`)
   — which Construct's worker / SharedArrayBuffer preview can be — a normal
   cross-origin YouTube iframe is blocked: the player chrome and title load, but
   the video stays **black with a spinner** because the media (served from
   `googlevideo.com` with no `Cross-Origin-Resource-Policy` header) can't load
   under `COEP: require-corp`. The fix is a **`credentialless`** iframe (the
   standard escape hatch for embedding COEP-incompatible third-party content).
   The attribute must be set **before** the iframe navigates, which is *why* the
   iframe is pre-created rather than made by `YT.Player`. It is marked
   credentialless **only when `crossOriginIsolated`** — credentialless iframes
   drop cookies, so leaving it off otherwise keeps sign-in-gated playback
   working. Verified empirically under COOP/COEP with the Playwright MCP: a plain
   iframe never fires `onReady`; a credentialless one reaches `PLAYING` and
   renders.

## Building a player

`ElementHandler` pre-creates an `<iframe>` (src = `buildEmbedUrl(videoId)`, i.e.
`.../embed/<id>?enablejsapi=1&<playerVars>`), appends it inside the
Construct-managed `<div>` (see `domSide.ts`), then calls
`new YT.Player(iframe, { events })` to attach the API to it in place — see
"The player iframe" above for why (visibility + COEP). Because the iframe is
pre-created, the player vars travel in the **embed URL** rather than a
`playerVars` option; the `events` object still carries `onReady`,
`onStateChange`, and `onError`.

### playerVars mapping (issue #3)

`buildPlayerVars(videoId)` assembles the player-var set that `buildEmbedUrl()`
serializes into the embed-URL query string. Each var, its source, and any caveats:

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
These constraints are exercisable via the Loop and modestbranding probes in
[`test/player-test.html`](../test/player-test.html) (the general YouTube bench
delivered in issue #10); see the `playerVars mapping` bullet under Open questions
for current findings.

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
  error codes to readable messages. The build-time caption case is resolved (#6,
  see the Captions bullet below); still open: live caption switching.
- **Audio lifecycle.** *Done (#4).* `lastVolume`/`lastMuted` (the user's intent via
  the ACEs) are restored on `onReady` and re-applied on each `loadVideoById` (which
  does not re-fire `onReady`); the autoplay forced-mute is reconciled by unmuting on
  the `PLAYING` event when the user's intent was unmuted; `currentVolume`/`audioState`
  are posted after set-calls and in the playback poll. Mute-state is decoupled from
  volume — the DOM seam is authoritative for `audioState` (from `isMuted()`) and the
  runtime no longer infers mute from `getVolume()`; see
  [decisions/0003-mute-state-decoupled-from-volume.md](decisions/0003-mute-state-decoupled-from-volume.md).
  Empirically checked in [`test/player-test.html`](../test/player-test.html)'s
  autoplay-unmute probe (#10): calling `unMute()` on the first `PLAYING` **without a
  user gesture is rejected** — `isMuted()` stays `true` — so autoplay-muted audio
  cannot be forced on programmatically. The unmute-on-`PLAYING` reconciliation
  therefore only takes real effect once the player has received a user gesture; the
  in-game confirmation is the sample project (#9). (The probe ran under automation
  yet was still blocked, so the "blocked" result is not a permissive-automation
  artifact.)
- **playerVars mapping.** *Done (#3).* All initial playerVars are wired; see the
  table above. `loop`/`modestbranding` are exercised by
  [`test/player-test.html`](../test/player-test.html)'s probes (#10): the
  `loadVideoById` reuse path re-sequences cleanly
  (PAUSED→UNSTARTED→BUFFERING→PLAYING), but whether `loop` *survives* a reuse switch
  needs an end-of-video watch and is **not yet confirmed** — moot in practice, since
  the plugin rebuilds the player when `loop`/`start` change rather than relying on
  reuse. `modestbranding` is visual-only (not machine-observable via the harness).
- **Awaitable Load Video (#18).** *Done.* `set-url` is awaitable (`isAsync`); the
  load promise resolves on a **polled `getDuration() > 0`** signal (metadata
  loaded ⇒ `seekTo`/captions can apply). The upstream GCore resolve-at-`Ready`
  contract does **not** port: YouTube's `onReady` fires once at player creation and
  does **not** re-fire on the `loadVideoById` reuse path (see "Audio lifecycle"
  above), and `PLAYING` is unreliable — it can lag metadata by ~2 s and **never
  fires when autoplay is blocked**, so resolving on it would hang. The load
  settles-on-all-outcomes (duration / `onError` / 15 s timeout / supersession /
  `Destroy`) and is generation-guarded; stale reuse-load state events carry
  `dur=0` and are filtered. Empirically pinned via
  [`test/probe-load-timing.html`](../test/probe-load-timing.html); see
  [decisions/0005-awaitable-load-video.md](decisions/0005-awaitable-load-video.md).
- **URL → video id.** `extractVideoId()`'s guaranteed input set: bare 11-char id
  (`^[A-Za-z0-9_-]{11}$`), `watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`, `/v/`,
  and `/live/` (YouTube live-stream watch URLs). The patterns match path/query
  substrings rather than hostname, so `youtube-nocookie.com`, `m.youtube.com`,
  and `music.youtube.com` are supported. `list=`, `t=`, `si=`, and `index=` are
  recognized but ignored for id extraction — a `watch?v=ID&list=PL…` URL loads
  only the single video `ID`. Known non-match: `attribution_link` URLs with a
  URL-encoded `v=` nested in a `u=` parameter are not decoded or matched.
  Playlists are parse-only — `list=` is recognized but playlist loading and
  navigation (`nextVideo`/`previousVideo`/`playVideoAt`) are deferred to
  [issue #12](https://github.com/GenvidTechnologies/c3addon-youtube-video-plugin/issues/12);
  a playlist-only URL (no `v=`) has no extractable id and stays "offline". See
  [ADR-0006](decisions/0006-video-url-parsing-scope.md).
- **Quality.** The numeric ABR quality ACEs were retired in issue #5 — see [ADR-0004](decisions/0004-retire-pre-release-quality-aces.md). YouTube quality is advisory/deprecated; no replacement surface is planned. Confirmed via the harness quality probe (#10): `getAvailableQualityLevels()` returns e.g. `hd720/large/medium/small/tiny/auto` and `getPlaybackQuality()` reports the active level, but selection stays advisory — YouTube overrides it.
- **Captions.** *Done (#6).* The `video-subtitles` property / `SetSubtitles`
  action now drive both `playerVars.cc_load_policy` (on/off) and
  `playerVars.cc_lang_pref` (preferred language), applied at player
  construction / next `Load Video` — YouTube has no live setter for either.
  The 9 GCore-era side-loaded/enumeration ACEs (`AddSubtitleSource` and
  friends) were retired, since arbitrary side-loaded tracks are not supported
  by YouTube and their enumeration had no equivalent. See
  [decisions/0007-captions-map-retire-subtitle-aces.md](decisions/0007-captions-map-retire-subtitle-aces.md).
  The harness captions probe (#10) confirms an (unofficial) module is
  reachable on a playing captioned video: `getOption('captions', 'tracklist')`
  returns the available tracks (e.g. `[{languageCode:'en', …}]`) and
  `getOption('captions', 'translationLanguages')` returns YouTube's ~195 auto-translate
  languages; `setOption('captions', 'track', {languageCode})` selects one. This
  module is undocumented and not part of YouTube's stable API, so live caption
  switching and track enumeration built on it are deferred to a future issue
  rather than adopted now (ADR-0007).
- **GCore-only ACEs.** `SetNoLowLatency`, `SetEnableDVR`, `SetFallbackURLs`, and
  the manifest-resolution machinery have no YouTube equivalent and are slated for
  removal/remap (see issues).

# YouTube Video Plugin — Usage Guide

**Audience:** Construct 3 game developers using the plugin's ACEs

This guide covers how to drive the plugin from Construct 3 event sheets. It does
not cover plugin internals; for those see [`architecture.md`](architecture.md)
and [`youtube-player-api.md`](youtube-player-api.md).

**Build-time vs. live.** A few settings (the **Loop**, **Start time**, and
**Subtitles** properties) only take effect when the player is built — at the
next **Load Video** call, or at initial construction — because the YouTube
IFrame API has no live setter for them. Everything else in this guide (Play,
Pause, volume, mute, playback rate, chrome) is a live action that applies
immediately to the currently-playing video.

---

## 1. Instance properties

Set these in the editor (Properties panel) or read/change them via the
matching action/expression at runtime.

| Property | Type | Default | Applies | Purpose |
|---|---|---|---|---|
| **URL** | string | `""` | — | The video URL. Normally set via **Load Video** rather than edited directly; see [§2](#2-loading-a-video). |
| **Subtitles** | string | `"off"` | Build-time — next Load Video | Preferred caption language, or `"off"`. See [§5](#5-subtitles). |
| **Enable Chrome** | boolean | **true** | Live | Shows the player's built-in control bar. On by default. See [§6](#6-player-controls-chrome). |
| **Loop** | boolean | `false` | Build-time — next Load Video | Loops the video when it reaches the end. |
| **Start time (seconds)** | number | `0` | Build-time — construction only | Playback start offset. Only applies when the player is first constructed, not on a later `loadVideoById` reuse. |

**Loop** and **Start time** have no live setter — changing them while a video
is playing has no effect until the next full player rebuild (a fresh **Load
Video** call, or a new instance). **Subtitles** behaves the same way; see
[§5](#5-subtitles) for the details.

---

## 2. Loading a video

Use the **Load Video** action. It takes a single parameter:

| Parameter | Type | Description |
|---|---|---|
| URL | string | The video URL (see accepted forms below) |

**Accepted URL forms:**

- Bare video id (11 characters): `dQw4w9WgXcQ`
- `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- `https://youtu.be/dQw4w9WgXcQ`
- `https://www.youtube.com/embed/dQw4w9WgXcQ`
- `https://www.youtube.com/shorts/dQw4w9WgXcQ`
- `https://www.youtube.com/v/dQw4w9WgXcQ`
- `https://www.youtube.com/live/dQw4w9WgXcQ` — YouTube live-stream watch pages

These forms also work on `youtube-nocookie.com`, `m.youtube.com`, and
`music.youtube.com` — the plugin matches on path/query shape, not hostname.

`list=`, `t=`, `si=`, and `index=` query params are recognized but ignored — a
share URL copied from inside a "Play all" queue
(`watch?v=dQw4w9WgXcQ&list=PL…`) loads only the single video `dQw4w9WgXcQ`.
Playlist loading and navigation are not yet supported; a playlist-only URL
(`playlist?list=…`, no `v=`) has no extractable video id and the player stays
offline — tracked in
[issue #12](https://github.com/GenvidTechnologies/c3addon-youtube-video-plugin/issues/12).

**Known limitation.** `attribution_link` URLs that bury a URL-encoded `v=`
inside another query parameter (e.g. `...attribution_link?...u=%2Fwatch%3Fv%3DID...`)
are not recognized. See
[ADR-0006](decisions/0006-video-url-parsing-scope.md) for the full accepted-URL
contract.

**How the URL becomes a video.** The plugin extracts the video id directly from
the URL text — there is no manifest-resolution step. Ignored params never
affect which video loads, and the result is always exactly one video id.

**Loading resets subtitle state.** Every call to Load Video clears the current
subtitle selection. Always call subtitle actions after loading the video.

Example event:

```
Event: On start of layout
Action: YouTubeVideoPlugin → Load Video("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
```

### Awaiting load completion

**Load Video** is awaitable. Placing `Await` on the action causes Construct to pause the
event chain until the video's metadata has loaded (duration becomes known), so any action on
the next line reliably applies to the freshly-loaded video:

```
Event: On start of layout
  Await: YouTubeVideoPlugin → Load Video("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
  Action: YouTubeVideoPlugin → Set playback time(30)   // applies to the new video
```

Without `Await`, `Set playback time` may arrive before the player is ready and be silently
dropped — the same race that existed before this feature.

**"Resolved" means the load attempt finished, not that it succeeded.** The action resolves on
any of: metadata loaded, a player error, a 15-second timeout, or the action being superseded
by a subsequent `Load Video` call. Check the outcome with the **On error** trigger or the
**Is ready** condition after the await.

Event sheets that do not `Await Load Video` are unaffected — back-compat is preserved. See
[ADR-0005](decisions/0005-awaitable-load-video.md) for the full resolve/settle contract.

---

## 3. Playback control

| Action | Parameters | Notes |
|---|---|---|
| **Play** | — | Start or resume playback. |
| **Pause** | — | Pause playback. |
| **Set playback time** | playbackTime (number, seconds) | Seek to a position. |
| **Set Volume** | level (0..1) | `0` = silent, `1` = full volume. |
| **Set muted** | mute (boolean) | `true` = mute, `false` = unmute. |

**Mute is independent of volume.** Muting and volume are separate concepts on
the YouTube player: **Set muted** is *not* the same as `Set Volume(0)`, and
**GetCurrentVolume** keeps reporting the last-set volume level regardless of
whether the player is muted. A muted player at volume 50 still reports a
volume of `0.5`; unmuting restores audible playback at that same level. See
[ADR-0003](decisions/0003-mute-state-decoupled-from-volume.md).

---

## 4. Playback rate

Use **Set playback rate** to change playback speed, and the matching
expressions to discover valid rates and confirm what was actually applied:

```
Event: On start of layout
  Await: YouTubeVideoPlugin → Load Video("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

  // Discover the rates this video supports
  Local variable: count = YouTubeVideoPlugin.GetAvailablePlaybackRateCount
  Repeat count times
    Action: Text → Append newline
    Action: Text → Set text to Text.Text & YouTubeVideoPlugin.GetAvailablePlaybackRate(loopindex)

  // Request a rate and read back what was actually applied
  Action: YouTubeVideoPlugin → Set playback rate(2)
  Action: Text → Set text to "Applied rate: " & YouTubeVideoPlugin.GetPlaybackRate
```

**Set playback rate** is a pass-through: YouTube may clamp a requested rate
that isn't in the video's available set to the nearest supported value rather
than rejecting it outright. **GetPlaybackRate** always reports the rate
actually applied, regardless of what was requested, so read it back instead of
assuming the requested value took effect. See
[ADR-0008](decisions/0008-playback-rate-and-metadata-aces.md).

---

## 5. Subtitles

YouTube captions are controlled at the build-time level only: the plugin sets
YouTube's `cc_load_policy` (on/off) and `cc_lang_pref` (preferred language)
player options, both applied when the video is next loaded, not live on the
currently-playing video. See
[ADR-0007](decisions/0007-captions-map-retire-subtitle-aces.md) for the full
decision.

### Setting the preferred caption language

Use the **Subtitles** property (in the editor) or the **Set Subtitles** action
(at runtime) with a BCP-47 language code (e.g. `"en"`, `"fr"`, `"ja"`), or
`"off"` to disable captions:

```
Action: YouTubeVideoPlugin → Set Subtitles("en")
Action: YouTubeVideoPlugin → Set Subtitles("off")
```

**Applies at next load, not live.** Setting the property or calling the
action changes what will apply the *next* time a video loads (the player is
rebuilt) — it does not switch captions on the video currently playing. Call
**Set Subtitles** before or immediately after **Load Video**:

```
Event: On start of layout
Action: YouTubeVideoPlugin → Set Subtitles("en")
Action: YouTubeVideoPlugin → Load Video("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
```

### Reading the current setting

The **Subtitles** expression returns the currently configured language tag
(`"off"` when disabled).

### Not yet supported

Live caption language switching on an already-playing video, side-loaded
subtitle tracks, and enumerating available caption tracks are not supported —
YouTube has no `playerVars`-level equivalent for them, and the surface is
deferred to a future issue (see ADR-0007).

---

## 6. Player controls (chrome)

The player's built-in control bar (play/pause button, seek bar, volume slider)
is called the "chrome." It is enabled by default.

**When to turn it off:** if your game provides its own playback controls, hide
the built-in bar to avoid duplicate UI.

| ACE | Description |
|---|---|
| **Enable Chrome** property | Sets initial state. Default: on. |
| **Set Enable Chrome** action | Toggle the control bar live (no player rebuild required). |
| `GetEnableChrome` expression | Returns `1` when enabled, `0` when disabled. |

```
Action: YouTubeVideoPlugin → Set Enable Chrome(false)   // hide built-in controls
Action: YouTubeVideoPlugin → Set Enable Chrome(true)    // restore built-in controls
```

The toggle takes effect immediately on a playing video.

---

## 7. Gotchas & caveats

- **Black screen with a spinner in Construct preview.** Under Construct's
  cross-origin-isolated preview modes, a YouTube iframe can load its chrome
  and title while the video itself stays black — the media is blocked, not
  the player.
- **Autoplay requires mute.** Browsers only allow autoplay when the player
  starts muted; unmuting programmatically before a user gesture is rejected
  by the browser.
- **`rel=0` no longer fully suppresses related videos.** It only restricts
  end-screen suggestions to videos from the same channel.
- **`GetVideoTitle` may return `""`.** It reads an unofficial YouTube API and
  can be empty for live streams or age-restricted content.
- **`GetPlayerUrl` vs. `URL`.** `URL` returns the authored value you passed to
  **Load Video**; `GetPlayerUrl` returns the player's own canonical URL, which
  can differ (e.g. after canonicalisation or a reuse-load).

For the mechanism behind these, see [`youtube-player-api.md`](youtube-player-api.md).

---

## 8. Quick reference

### Actions

| Action | Parameters | Notes |
|---|---|---|
| **Play** | — | Start or resume playback. |
| **Pause** | — | Pause playback. |
| **Set muted** | mute (boolean) | `true` = mute, `false` = unmute. |
| **Set playback time** | playbackTime (number, seconds) | Seek to a position. |
| **Set Volume** | level (0..1) | `0` = silent, `1` = full volume. |
| **Load Video** | url (string) | Awaitable. Loading resets subtitle state. See [§2](#2-loading-a-video). |
| **Set Subtitles** | language (string, or `"off"`) | Build-time — applies at next Load Video. See [§5](#5-subtitles). |
| **Set Enable Chrome** | enable (boolean) | Live toggle of the built-in control bar. |
| **Resize** | — | Force-sync player dimensions to its container. Normally automatic via ResizeObserver. |
| **Set playback rate** | rate (number) | Pass-through; YouTube may clamp to the nearest available rate. |

### Conditions

| Condition | Description |
|---|---|
| **Is playing** | Playback is active. |
| **Is paused** | Playback is paused. |
| **Is ended** | VOD playback reached the end. |
| **Is muted** | Player is muted (independent of volume level — see [§3](#3-playback-control)). |
| **Is loading** | Player is buffering or loading a new video. |
| **Is ready** | Player has loaded the manifest and is ready to play. |
| **Is offline** | No video is loaded. |
| **On state changed** | Trigger — fires on any state transition (playing, paused, ended, loading, ready, offline). |
| **On error** | Trigger — fires on a player error. |

### Expressions

| Expression | Return type | Description | Notes |
|---|---|---|---|
| `State` | string | Current player state: `"playing"`, `"paused"`, `"ended"`, `"loading"`, `"ready"`, `"offline"`. | |
| `GetLastErrorMessage` | string | Message from the most recent error. | |
| `GetLastErrorCategory` | string | Error source: `"iframe"` or `"youtube"`. | |
| `GetCurrentPlaybackTime` | number | Current playback position in seconds. | |
| `GetCurrentVolume` | number | Current volume, 0..1. | Unaffected by mute state — see [§3](#3-playback-control). |
| `GetDuration` | number | Video duration in seconds. | |
| `URL` | string | The URL last passed to Load Video (the authored value). | Compare to `GetPlayerUrl`. |
| `Subtitles` | string | Active subtitle language tag, or `"off"`. | |
| `GetEnableChrome` | number | `1` when the control bar is enabled, `0` when disabled. | |
| `GetPlaybackRate` | number | The rate actually applied by the player. | Always reflects reality, even if a requested rate was clamped. |
| `GetAvailablePlaybackRate` | number | The available rate at `index` (see `GetAvailablePlaybackRateCount`). Returns `0` if out of range. | Parameter: `index` (number). |
| `GetAvailablePlaybackRateCount` | number | The number of available playback rates for the current video. | |
| `GetVideoTitle` | string | The current video's title. | Unofficial API; may be `""` for live/age-restricted videos. |
| `GetPlayerUrl` | string | The player's current canonical URL. | May differ from `URL` — see [§7](#7-gotchas--caveats). |
| `GetVideoLoadedFraction` | number | Fraction (0..1) of the video that has buffered. | |

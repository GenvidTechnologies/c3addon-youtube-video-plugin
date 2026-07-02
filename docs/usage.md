# YouTube Video Plugin — Usage Guide

> **⚠️ Partially out of date — being rewritten for YouTube.** Section 1
> (Loading a video) below is current for the YouTube IFrame Player API. The
> rest of this guide (subtitles, low latency, DVR, and the other ACEs) still
> documents the GCore-era surface and does not yet apply to this fork; the
> YouTube rewrite of those sections is tracked in
> [issue #11](https://github.com/GenvidTechnologies/c3addon-youtube-video-plugin/issues/11).

**Audience:** Construct 3 game developers using the plugin's ACEs

This guide covers how to drive the plugin from Construct 3 event sheets. It does
not cover plugin internals; for those see [`architecture.md`](architecture.md)
and [`youtube-player-api.md`](youtube-player-api.md).

---

## 1. Loading a video

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

**Loading resets subtitle state.** Every call to Load Video clears the active
subtitle selection and any side-loaded subtitle sources. Always call subtitle
actions after loading the video.

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

Event sheets that do not `Await Load Video` are unaffected — back-compat is preserved.

---

## 2. Low latency (live streams)

The **No low latency flag** property and **Set No Low Latency** action control
which manifest path is used for live streams.

- Default (`false`): low-latency CMAF manifest — suitable for interactive use
  cases where minimal glass-to-glass delay matters.
- `true`: non-low-latency MPEG-TS manifest — better compatibility with older
  players or networks that do not handle CMAF well.

This flag only affects live (`/streams/`) embed URLs. For VOD or direct manifest
URLs it has no effect on the path (though it does set an hls.js flag as a
secondary safeguard for direct CMAF URLs).

Changing this flag while a video is playing triggers a player rebuild (brief
interruption). Set it before calling Load Video when possible.

You can read the current flag value with the **NoLowLatency** expression
(returns `1` when set, `0` otherwise).

---

## 3. Subtitles

The plugin supports two kinds of subtitle tracks:

- **In-manifest tracks** — subtitle renditions embedded in the HLS manifest
  (`#EXT-X-MEDIA:TYPE=SUBTITLES`). These are provided by GCore and are
  available automatically for streams that include them.
- **Side-loaded tracks** — external `.vtt` files or project files added by
  your event sheet.

### 3a. Selecting an in-manifest track

Use **Set Subtitles** with a BCP-47 language code (e.g. `"en"`, `"fr"`, `"ja"`)
to enable an in-manifest track, or `"off"` to disable subtitles.

```
Action: GCoreVideoPlugin → Set Subtitles("en")
Action: GCoreVideoPlugin → Set Subtitles("off")
```

The plugin matches by language code first, then by track name. Non-Latin names
(Japanese, Chinese) are matched by language code.

### 3b. Side-loading a subtitle file by URL

Use **Add Subtitle Source** after Load Video to inject an external track:

| Parameter | Description |
|---|---|
| URL | URL of the `.vtt` subtitle file |
| Language | BCP-47 language code — use a tag distinct from any in-manifest track (e.g. `"en-ext"`) |
| Label | Human-readable name shown in UI (e.g. `"English (External)"`) |

Then select it with **Set Subtitles** using the same language tag:

```
Event: On start of layout
Action: Load Video("https://player.gvideo.co/videos/421804_abc123", false)
Action: Add Subtitle Source("https://cdn.example.com/subs/en.vtt", "en-ext", "English")
Action: Set Subtitles("en-ext")
```

**Why a distinct language tag?** In-manifest tracks and side-loaded tracks are
selected by different internal mechanisms. If you use `"en"` for a side-loaded
track and the manifest also has an `"en"` rendition, the in-manifest track
shadows the external one. A tag like `"en-ext"` is unambiguous.

### 3c. Side-loading from a Construct project file

Use **Add Project Subtitle Source** with a project file asset instead of a URL.
Parameters and ordering rules are identical to Add Subtitle Source. The action
is async — Construct resolves the file to a URL at runtime.

```
Action: Add Project Subtitle Source(subtitles_en.vtt, "en-ext", "English")
Action: Set Subtitles("en-ext")
```

### 3d. Building a subtitle menu

Use the **On subtitles available** trigger — fires when the track list is first
known or changes — to populate a dynamic subtitle menu.

Expressions and conditions for querying the track list:

| ACE | Description |
|---|---|
| `GetSubtitleCount` | Total number of available tracks (side-loaded + in-manifest) |
| `GetSubtitleLanguageAt(index)` | Language code of the track at this index |
| `GetSubtitleLabelAt(index)` | Display label of the track at this index |
| **Has subtitles** condition | True if any tracks are available |
| **Has subtitle language** condition | True if a track with the given language code exists |
| **Has subtitle label** condition | True if a track with the given label exists |

Side-loaded tracks are listed before in-manifest tracks in the index order, so
their positions are stable even before the manifest finishes loading.

**Subtitle menu pattern:**

```
Trigger: GCoreVideoPlugin → On subtitles available
  (clear existing menu items)
  Repeat GCoreVideoPlugin.GetSubtitleCount times
    Action: Add menu item with text GCoreVideoPlugin.GetSubtitleLabelAt(loopindex)
            and tag GCoreVideoPlugin.GetSubtitleLanguageAt(loopindex)

Event: Player clicks menu item
  Action: GCoreVideoPlugin → Set Subtitles(clickedItem.tag)
```

The **Subtitles** expression returns the currently active language tag
(`"off"` when disabled).

---

## 4. Player controls (chrome)

The player's built-in control bar (play/pause button, seek bar, volume slider)
is called the "chrome." It is enabled by default in v2.0.0.

**When to turn it off:** if your game provides its own playback controls, hide
the built-in bar to avoid duplicate UI.

| ACE | Description |
|---|---|
| **Enable Chrome** property | Sets initial state. Default: on. |
| **Set Enable Chrome** action | Toggle the control bar live (no player rebuild required). |
| `GetEnableChrome` expression | Returns `1` when enabled, `0` when disabled. |

```
Action: GCoreVideoPlugin → Set Enable Chrome(false)   // hide built-in controls
Action: GCoreVideoPlugin → Set Enable Chrome(true)    // restore built-in controls
```

The toggle takes effect immediately on a playing video.

---

## 5. DVR (seekable live window)

DVR mode allows viewers to seek within a live stream's rolling window.

| ACE | Description |
|---|---|
| **Enable DVR** property | Opt into DVR mode at plugin creation. |
| **Set Enable DVR** action | Toggle DVR mode (requires a player rebuild). |
| **Is DVR** condition | True when the current stream reports a DVR window. |
| `GetSeekableStart` | Start of the seekable window in seconds (`0` when unknown or not DVR). |
| `GetSeekableEnd` | End of the seekable window in seconds (`-1` when unknown or not DVR). |

To seek within the DVR window use **Set playback time** (see section 6).

> **Not yet verified against a live DVR stream.** DVR support is implemented
> and shipped in v2.0.0.0 but has not been confirmed against a real DVR stream.
> The seekable-window boundaries read from private player fields that may change
> in a future player update. See `docs/gcore-player-api.md` section A6.

---

## 6. Other ACEs — quick reference

### Actions

| Action | Parameters | Notes |
|---|---|---|
| **Play** | — | Start or resume playback. |
| **Pause** | — | Pause playback. |
| **Set muted** | mute (boolean) | `true` = mute, `false` = unmute. |
| **Set playback time** | playbackTime (number, seconds) | Seek to a position. Use within `GetSeekableStart`..`GetSeekableEnd` for DVR. |
| **Set Volume** | level (0..1) | `0` = silent, `1` = full volume. |
| **Resize** | — | Force-sync player dimensions to its container. Normally automatic via ResizeObserver. |

### Conditions

| Condition | Description |
|---|---|
| **Is playing** | Playback is active. |
| **Is paused** | Playback is paused. |
| **Is ended** | VOD playback reached the end. |
| **Is muted** | Player is muted. |
| **Is loading** | Player is buffering or loading a new video. |
| **Is ready** | Player has loaded the manifest and is ready to play. |
| **Is offline** | No video is loaded. |
| **On state changed** | Trigger — fires on any state transition (playing, paused, ended, loading, ready, offline). |
| **On error** | Trigger — fires on a player error. Note: fires once per hls.js retry on a bad URL, not once per failure event. |

### Expressions

| Expression | Return type | Description |
|---|---|---|
| `State` | string | Current player state: `"playing"`, `"paused"`, `"ended"`, `"loading"`, `"ready"`, `"offline"`. |
| `GetLastErrorMessage` | string | Message from the most recent error. |
| `GetLastErrorCategory` | string | Error source: `"gcore"` or `"iframe"`. |
| `GetCurrentPlaybackTime` | number | Current playback position in seconds. |
| `GetCurrentVolume` | number | Current volume, 0..1. |
| `GetDuration` | number | Stream duration in seconds (may be `Infinity` for live). |
| `URL` | string | The URL last passed to Load Video. |
| `Subtitles` | string | Active subtitle language tag, or `"off"`. |
| `NoLowLatency` | number | `1` when the no-low-latency flag is set, `0` otherwise. |

---

## 7. Upgrading to v2.0.0 — breaking changes

Two changes require updating existing event sheets.

### Volume range changed from 0..100 to 0..1

The **Set Volume** action and **GetCurrentVolume** expression now use a `0..1`
scale. In v1, the value was passed through unchanged; in v2, the plugin wraps
the conversion at the boundary so you always work in 0..1.

| v1 | v2 equivalent |
|---|---|
| `Set Volume(50)` | `Set Volume(0.5)` |
| `Set Volume(100)` | `Set Volume(1)` |

### Load Video no longer has a subtitles parameter

In v1, **Load Video** accepted a subtitle language as a third parameter. That
parameter is gone in v2. Use **Set Subtitles** after loading:

```
// v1 (no longer works)
Load Video(url, false, "en")

// v2
Load Video(url, false)
Set Subtitles("en")
```

### Chrome defaults to on

The **Enable Chrome** property defaults to `true` in v2 (it was `false` in v1).
Existing projects that relied on the control bar being hidden need to add
`Set Enable Chrome(false)` or change the property in the editor. Existing
projects that expected the control bar to be visible require no change.

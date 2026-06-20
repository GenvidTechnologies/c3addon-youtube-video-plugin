# Plan: Port GCore video plugin to the new `@gcorevideo/player` v2 API

Branch: `BUR-0000-port-player-api-v2`

## Problem

The old GCore embed API (`https://vplatform.gvideo.co/_players/latest/gplayerAPI.min.js`)
is broken. `src/plugin.ts` already points the remote dependency at the new build
(`https://player.gvideo.co/v2/assets/latest/index.js`), but the DOM-side
integration in `src/c3runtime/dom/ElementHandler.ts` still speaks the old,
now-nonexistent API. The plugin must be ported to the new API with the same
functionality and the minimal footprint.

## API differences

| Concern | Old (broken) | New (`@gcorevideo/player`) |
|---|---|---|
| Access | `globalThis.GcorePlayer.gplayerAPI` global | ESM-only named exports, **no global** |
| DOM | `new gplayerAPI(iframe)`, set `iframe.src` | `new Player({sources})` + `player.attachTo(div)` |
| Events | `.on("play"/"pause"/"timeupdate"/...)` | `player.on(PlayerEvent.X, …)` |
| Commands | `.method({name,params,callback})` (async) | direct sync `play/pause/seek/setVolume/getVolume/mute/unmute/getDuration` |
| timeupdate | `{current}` | `{current, total}` |
| Teardown | `.removeAllListeners()` | `.destroy()` |

## Key insight — minimal footprint

The runtime side (`instance.ts`, `actions.ts`, `conditions.ts`, `expressions.ts`)
and the `domSide.ts` message bridge talk to the DOM side through a generic,
API-agnostic message protocol. None of that changes. All GCore API coupling
lives in `ElementHandler.ts`. Total footprint: 3 files (+ the pre-existing
plugin.ts URL swap and SDK/lockfile bumps).

## Decisions

- **Autoplay:** muted autoplay (`mute:true, autoPlay:true`); the game unmutes via
  the existing Unmute action. Preserves old auto-play-on-load behavior, avoids
  browser autoplay blocks.
- **Scope:** strictly minimal — restore function. Subtitles / no-low-latency kept
  as the existing `?sub_lang=` / `no_low_latency` URL query params. Proper
  Subtitles-plugin support is a noted follow-up.
- **Module loading:** dependency declared `AddRemoteScriptDependency(url, "module")`
  (classic `<script>` can't parse ESM). Game-side `ElementHandler.ts` reaches the
  `Player` reference via a cached dynamic `import()` of the same URL (module
  registry dedupes). The `await` on that import also defers `attachTo` until after
  Construct has mounted the div (there is no iframe `load` event anymore).

## Tasks

1. **(prep)** Save `plan.md`.
2. `src/plugin.ts`: add `"module"` type to `AddRemoteScriptDependency`. Commit
   together with the pre-existing SDK submodule + package-lock bumps.
3. `src/c3runtime/domSide.ts` + `src/c3runtime/dom/ElementHandlerMap.ts`:
   create a `<div>` instead of `<iframe>`; `HTMLIFrameElement` → `HTMLElement`.
4. `src/c3runtime/dom/ElementHandler.ts`: full rewrite.
   - Module-scope cached loader: `import(url)` → register `SourceController` +
     `MediaControl` once → resolve `{ Player, PlayerEvent }`.
   - `CreatePlayer(url)` (async): derive `mimeType` from path
     (`.mpd` → `application/dash+xml`, else `application/x-mpegurl`),
     `new Player({autoPlay:true, mute:true, sources:[{source:url, mimeType}]})`,
     register events, `attachTo(this.element)`.
   - Events: `Play`→playing, `Pause`→paused, `Ended`→ended,
     `TimeUpdate`→`{currentPlaybackTime:current}`,
     `VolumeUpdate`→`{currentVolume: isMuted()?0:getVolume()}`,
     `Error`→error, `Ready`→post `getDuration()` + volume.
   - Methods: direct sync calls; `OnMute`/`OnUnmute` still post `audioState`;
     `DestroyPlayer` → `player.destroy()`.
   - Track `currentUrl` (replaces old `iframe.src` comparison).

## Gate

`npm run lint && npm run build`, then `genvid-dev:code-reviewer`.

## Flagged for runtime verification (not blockers)

- `TimeUpdate` payload assumed `{current, total}`; `Error` assumed `{message, code}`.
- `setVolume` range is `0..1` in the new API (passed through from the existing ACE).
- Subtitle `?sub_lang=` / `no_low_latency` query params honored by the manifest endpoint.

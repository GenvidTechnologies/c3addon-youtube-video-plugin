# Architecture

This add-on wraps the YouTube IFrame Player API as a Construct 3 plugin.
Understanding two boundaries is essential before changing anything — they are why
player-API migrations stay small.

## Editor side vs. game (runtime) side

Construct 3 plugins run code in two completely separate contexts:

| File / location | Context | Runs when |
|---|---|---|
| `src/plugin.ts` | **Editor side** | In the Construct 3 editor (and at export time). Declares the plugin, its properties, ACEs, script dependencies, and which runtime scripts to load. **Does not run in the game.** |
| `src/c3runtime/**` | **Game (runtime) side** | In the exported/previewed game. |

So a call like `this._info.AddRemoteScriptDependency(url)` in `plugin.ts` is a
*declaration* made in the editor: it instructs Construct to inject a `<script
src=url>` (here, the YouTube IFrame API) into the **game** at runtime. The actual
use of that script happens on the game side.

## Runtime side: worker vs. DOM split

Within the game, the runtime is split again (Construct's "worker mode"):

- **Runtime side** (`instance.ts`, `actions.ts`, `conditions.ts`,
  `expressions.ts`, `main.ts`) may run in a Web Worker with **no DOM access**.
  It holds plugin state and exposes the ACEs the game author uses.
- **DOM side** (`dom/domSide.ts`, `dom/ElementHandler.ts`,
  `dom/ElementHandlerMap.ts`) runs in the main document and can touch the DOM.
  `plugin.ts` registers these via `SetDOMSideScripts([...])`.

The two halves communicate only through a **generic, API-agnostic message
bridge** (Construct's `DOMElementHandler` / `ISDKDOMInstanceBase`
`postMessage`-style helpers). The runtime side posts intent messages — `play`,
`pause`, `seek`, `setVolume`, `mute`, `unmute`, and element-state updates — and
receives back `state-changed` and `error` messages, which it folds into plugin
state (`playerState`, `audioState`, `currentVolume`, `duration`,
`currentPlaybackTime`). Note `instance.ts` treats `currentVolume === 0` as
muted.

## Why this matters: player-API coupling is isolated to one file

Because the bridge protocol is generic, **all coupling to the YouTube player API
lives in `src/c3runtime/dom/ElementHandler.ts`**. The runtime side, the ACEs,
and the message bridge know nothing about YouTube specifics.

Practical consequence: porting from one player API to another (as in the
GCore→YouTube fork) is almost entirely a rewrite of `ElementHandler.ts`, plus
minor edits to the container element type in `domSide.ts`/`ElementHandlerMap.ts`
and the dependency declaration in `plugin.ts`. Resist the urge to thread API
details through the runtime side — keep `ElementHandler.ts` the single seam.

See [`youtube-player-api.md`](youtube-player-api.md) for the player API surface
used by `ElementHandler.ts`.

## Plugin properties: the positional contract

Editor properties declared in `plugin.ts` reach the runtime in **declaration
order**, and several sites depend on that order. A property added in the wrong
place silently mis-reads every property after it — including in **already-saved
Construct projects and savegames**. The flow:

1. `plugin.ts` `SetProperties([...])` — an **ordered** array; the position of each
   `SDK.PluginProperty` defines its index.
2. `src/c3runtime/instance.ts` constructor — reads each property **positionally**
   as `properties[N]` (the only index-based read).
3. `instance.ts` `_getElementState()` / `_saveToJson()` / `_loadFromJson()` —
   carry the same values **by key** (not position) across the message bridge and
   in/out of savegames.
4. `instance.ts` `_getDebuggerProperties()` — surfaces them in the debugger.

Rules that follow:

- **Append new properties at the end**, never insert or reorder. Inserting shifts
  every later `properties[N]` index, so an existing project saved with the old
  order is read incorrectly. The keyed `_loadFromJson` defaults missing keys, so
  old savegames load cleanly only when the new property is *appended* (absent →
  default), not inserted.
- **Keep all sites in sync** — a new property touches `plugin.ts` (declare),
  `instance.ts` (positional read + `_getElementState` + save/load + debugger),
  and `src/lang/en-US.json` (a `properties` entry whose **key exactly matches the
  property id** — a mismatch is a silent missing editor label).
- **Removals must renumber in the same commit** — deleting a property (e.g.
  retiring the GCore-only `no-low-latency`/`enable-dvr`) shifts the indices of
  everything after it, so the `properties[N]` reads in `instance.ts` must be
  renumbered together with the `SetProperties` removal.

Property *values* stay API-agnostic across the bridge; only
`ElementHandler.ts` maps them to YouTube specifics (e.g. `playerVars`), per the
single-seam rule above.

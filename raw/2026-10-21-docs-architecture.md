# Architecture

This add-on wraps the YouTube IFrame Player API as a Construct 3 plugin.
Understanding two boundaries is essential before changing anything — they are why
player-API migrations stay small.

## Editor side vs. game (runtime) side

Construct 3 plugins run code in two completely separate contexts:

| File / location | Context | Runs when |
|---|---|---|
| `src/plugin.ts` | **Editor side** | In the Construct 3 editor (and at export time). Declares the plugin, its properties, ACEs, script dependencies, and which runtime scripts to load. **Does not run in the game.** |
| `src/instance.ts` | **Editor side** | In the editor's layout view — the World instance that draws the placeholder (`Draw` / `_UpdateWebGLText`). Distinct from the runtime instance below. **Does not run in the game.** |
| `src/c3runtime/**` | **Game (runtime) side** | In the exported/previewed game. |

> **Two files named `instance.ts`.** `src/instance.ts` is the *editor-side* World
> instance (placeholder rendering); `src/c3runtime/instance.ts` is the *runtime*
> instance (plugin state + ACEs). When removing or renaming a symbol, grep the
> **whole `src/` tree**, not just the runtime file — both can reference a feature
> (e.g. a property id surfaced in the editor placeholder).

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
state. That state set grows as ACEs are added (`playerState`, `audioState`,
`currentVolume`, `duration`, `currentPlaybackTime`, and the playback-rate /
video-metadata fields from [ADR-0008](decisions/0008-playback-rate-and-metadata-aces.md),
among others) — treat the list as illustrative, not exhaustive. Note `instance.ts`
treats `currentVolume === 0` as muted.

### Bridge modes: fire-and-forget vs. async round-trip

The bridge supports two calling modes on the runtime side:

- **Fire-and-forget** — `_postToDOMElement(handler, data)`: posts a message to
  the DOM side and returns `void`. Used for `play`, `pause`, `seek`,
  `setVolume`, `mute`, `unmute`, `resize`, and `UpdateState`. The DOM handler's
  return value is discarded.
- **Async round-trip** — `_postToDOMElementAsync(handler, data): Promise<JSONValue>`:
  posts a message and returns a promise that resolves when the DOM handler's own
  returned `Promise<JSONValue>` settles. Used when the runtime needs to await a
  DOM-side outcome — for example, knowing when video metadata has loaded.

The `"loadVideo"` handler (`set-url` / Load Video) is the first user of the
async mode in this fork. Because the void-typed handler registration in
`domSide.ts` would discard a `Promise` return value, `"loadVideo"` is registered
separately so its promise propagates through the bridge correctly.

Using the async mode is appropriate when: (a) the DOM side must await a
player-API event or poll before the action is considered complete, and (b) the
runtime needs to surface that completion to the event sheet as an awaitable
action (`isAsync: true` in `aces.json`). See
[ADR-0005](decisions/0005-awaitable-load-video.md) for the design rationale.

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

## Adding an ACE (action / expression)

New ACEs follow two fixed wiring chains. The fastest way to add one is to copy an
existing ACE of the same kind end to end — `set-volume` is the canonical **action**
template, `get-duration` the canonical **expression** template.

**Action** — a one-way command to the player:

1. `src/aces.json` — append an `actions` entry (`id`, `scriptName`, `params`).
2. `src/lang/en-US.json` — append the matching `list-name` / `display-text` /
   `description` / `params` strings.
3. `src/c3runtime/actions.ts` — a thin dispatcher: `SetX(this, …) { this._SetX(…); }`.
4. `src/c3runtime/instance.ts` — `_SetX(…) { this._postToDOMElement("setX", {…}); }`.
5. `src/c3runtime/domSide.ts` — register `["setX", (elem, e) => …OnSetX(e)]` and add
   `OnSetX` to `IElementHandler`.
6. `src/c3runtime/dom/ElementHandler.ts` — `OnSetX(state) { …this.player?.setX(…); }`
   — the only place the YouTube API is touched.

**Expression** — a value read from the event sheet. **Expressions read a
synchronous cached instance field; they never round-trip to the DOM.** So the value
must be *pushed* from the seam ahead of time (the ADR-0003 pattern):

1. `src/aces.json` + `src/lang/en-US.json` — append the `expressions` entry
   (`id`, `expressionName`, `returnType`; `params` if parameterized — see
   `get-available-playback-rate`, the surface's first parameterized expression).
2. `src/c3runtime/expressions.ts` — `GetX(this) { return this._x; }` — returns a
   **cached field**, nothing more.
3. `src/c3runtime/instance.ts` — declare `_x`, default it in `_InitializeState()`
   (so it resets on load/offline), and store it in `_OnStateChanged` with the
   `state.x !== undefined` guard (so a legitimate `0` / `""` is not dropped).
4. `src/c3runtime/dom/ElementHandler.ts` — **push** the value via
   `PostStateToRuntime({ x: … })` at the right moments (on `onReady`, on the
   relevant `onStateChange` transition, on a dedicated poll, etc.). A pull-style
   YouTube getter (`getPlaybackRate`, `getVideoData`) must be converted to push
   here.

Two conventions apply to both: the surface is **additive-only and frozen** — append
to the end of the `aces.json` arrays, never insert/reorder/rename (see ADR-0001/0002)
— and `src/aces.json` + `src/lang/en-US.json` are **UTF-8 with a BOM** (a multi-line
`Edit` can fail to match; the fallback is to `Write` the whole file and restore the
BOM — see `CLAUDE.md`). `npm run lint` runs `validate-aces.mjs`, which fails if any
ACE or param lacks a lang string.

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

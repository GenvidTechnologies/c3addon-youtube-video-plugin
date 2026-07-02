# 0006. Video URL Parsing Scope — Parse-Only, Defer Playlist Load/Nav

- **Status:** Accepted
- **Date:** 2026-07-02
- **Issue:** [GenvidTechnologies/c3addon-youtube-video-plugin#8](https://github.com/GenvidTechnologies/c3addon-youtube-video-plugin/issues/8)

## Context

`ElementHandler.extractVideoId()` already handled bare 11-character ids,
`watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`, and `/v/`. Issue #8 asked to (1)
confirm and document the full set of URL shapes Construct authors will paste,
(2) decide whether to support **playlists** (`list=` → `loadPlaylist` /
`playerVars.listType`) and playlist **navigation** (`nextVideo()` /
`previousVideo()` / `playVideoAt()`), or scope the plugin to single videos for
now, and (3) handle invalid/empty input gracefully (already the case: an
unmatched URL yields `""` and the element goes offline).

YouTube also serves live-stream watch pages under `/live/<id>` (e.g. links
shared while a broadcast is live); this shape was not one of the matched
patterns, so those URLs fell through to the empty-id "offline" branch.

`extractVideoId`'s patterns match on path/query **substrings**, not a parsed
hostname. As a side effect, several YouTube-family domains already matched
before this decision — `youtube-nocookie.com` (privacy-enhanced embeds),
`m.youtube.com` (mobile links), and `music.youtube.com` — but this was an
accident of the regexes, not a stated guarantee.

Construct authors frequently paste full share URLs, which often carry a
`list=` playlist parameter alongside `watch?v=` (e.g. copied from inside a
"Play all" queue), plus other passthrough params such as `t=`, `si=`, and
`index=`.

A distinct URL shape, `youtube.com/attribution_link?...u=%2Fwatch%3Fv%3DID...`,
buries a URL-encoded `v=` inside another query parameter's value. Matching it
would require URL-decoding untrusted input before running the extraction
patterns.

## Decision

Scope this issue to **parse-only, defer load**: harden and document what
`extractVideoId()` accepts and ignores; leave playlist *loading* and
*navigation* to a follow-up issue.

### 1. Locked single-video URL set

`extractVideoId()`'s guaranteed input set is now a documented contract, not
just whatever the regex list happens to match: bare id
(`^[A-Za-z0-9_-]{11}$`), `watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`,
`/v/`, and newly `/live/` (YouTube live-stream watch URLs).

### 2. Host-agnostic guarantee

The patterns match on path/query substrings rather than hostname, so
`youtube-nocookie.com`, `m.youtube.com`, and `music.youtube.com` are
supported. This is promoted from incidental regex behavior to a documented
guarantee that future changes to `extractVideoId()` must preserve.

### 3. Ignored-but-recognized params

`list=`, `t=`, `si=`, and `index=` are common in real share URLs.
`extractVideoId()` does not let their presence affect id extraction — a
`watch?v=ID&list=PL…` URL loads only the single video `ID`. Two additive
`console.debug` calls were added to `UpdateState` — one when a `list=` param
is present but ignored, one when a playlist-only URL (no `v=`) yields no
video id and the element goes offline — so both cases are observable to a
developer instead of silently looking like a bug. (Chosen over a
runtime-visible warning: neither case is an error condition for the single-
video contract this issue scopes to.)

### 4. Known non-match, intentionally unfixed

`attribution_link` URLs with a URL-encoded `v=` nested in a `u=` value are
not decoded or matched. This is a documented limitation, not a bug to be
filed later.

### 5. Playlist load and navigation deferred

`loadPlaylist` / `cuePlaylist` / `playerVars.listType`, and the navigation
ACEs `NextVideo` / `PreviousVideo` / `PlayVideoAt`, are deferred to
[issue #12](https://github.com/GenvidTechnologies/c3addon-youtube-video-plugin/issues/12).
A playlist-only URL (`playlist?list=…`, no `v=`) has no extractable video id
under this decision and stays "offline" — expected behavior under parse-only
scope, not a defect.

## Compromise

### Rejected: full playlist load + navigation support now

Implementing `loadPlaylist`/`cuePlaylist` and the navigation ACEs alongside
the URL-shape hardening would have closed issue #8 completely, but conflates
two differently-sized changes: URL parsing needed to be correct now, while
playlist load/navigation needs its own ACE surface and player wiring.
Rejected as scope that belongs to issue #12.

### Rejected: change `extractVideoId`'s return type to `{videoId, listId}`

Returning a struct instead of a bare id string was considered so a caller
could act on the playlist id later. Rejected because nothing consumes
`listId` under parse-only scope — the extra structure would be dead weight.
That data-model decision belongs to issue #12, once playlist loading has an
actual consumer for `listId`.

### Accepted cost: `attribution_link` URLs unsupported

Matching the `v=` value embedded inside `attribution_link`'s `u=` parameter
would require URL-decoding arbitrary input before pattern matching — a
broader behavior change to support one uncommon share-link shape. Left
unmatched.

## Consequences

- `extractVideoId()`'s accepted-URL-shape set, including `/live/`, is
  documented as a contract rather than left implicit in the regex list.
- The host-agnostic guarantee (`youtube-nocookie.com`, `m.youtube.com`,
  `music.youtube.com`) is now a committed contract that future edits to
  `extractVideoId()` must preserve.
- A `watch?v=ID&list=PL…` share URL plays only the single video `ID`, by
  design; the two new `console.debug` lines make the ignored-`list=` and
  playlist-only-offline cases observable without changing behavior.
- Playlist-only URLs remain "offline" until issue #12 lands.
- The awaitable-load contract from [ADR-0005](0005-awaitable-load-video.md)
  is unaffected — this decision changes which URLs successfully extract a
  video id, not the load path itself.
- The `ElementHandler` isolation seam is untouched — no new bridge message or
  `YTPlayer` method was introduced.

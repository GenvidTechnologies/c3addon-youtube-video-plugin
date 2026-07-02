# Documentation Index

<!--
Genvid plugin skills consult this index to find your project's docs.
Each entry should be a one-line description. Add docs here as they are
written so the plugin's skills can discover them.
-->

- [usage.md](usage.md) — user-facing guide for Construct 3 developers. **Being rewritten for YouTube** (still describes the GCore-era surface; see open issues).
- [architecture.md](architecture.md) — editor/runtime split, the DOM message bridge, and why player-API coupling is isolated to `ElementHandler.ts`.
- [youtube-player-api.md](youtube-player-api.md) — the YouTube IFrame Player API surface used by the plugin (loading the API, building `YT.Player`, events, methods). Currently a scaffold; findings are filled in as the integration is built.

## Process

- [issue-triage.md](issue-triage.md) — issue-triage conventions (flat-label variant) consumed by `/genvid-dev:triage-issues`: category labels, required fields, splitting/duplicates/dependencies policy, and the `gh` mutation recipes.

## Decision Records

- [decisions/0001-additive-v2-api-expansion.md](decisions/0001-additive-v2-api-expansion.md) — **inherited from the GCore upstream (historical).** Additive-only ACE expansion, construction-time rebuild discipline, and empirical verification mandate for the GCore v2 API conversion. Its "(issue #1)" refers to the upstream GCore repo, not this fork's issue #1 (the YouTube port epic).
- [decisions/0002-playervars-mapping-constraints.md](decisions/0002-playervars-mapping-constraints.md) — playerVars wiring constraints from issue #3: mute ownership deferred to #4, append-only positional property contract (idx5/idx6 for loop/start; renumber in #7), origin scheme guard, modestbranding omitted, loop/start build-time-only.
- [decisions/0003-mute-state-decoupled-from-volume.md](decisions/0003-mute-state-decoupled-from-volume.md) — mute state (`audioState`) is authoritative from the DOM seam (`YT.Player.isMuted()`), decoupled from reported volume; establishes the pattern for all future player-derived state (issue #4, epic #1).
- [decisions/0004-retire-pre-release-quality-aces.md](decisions/0004-retire-pre-release-quality-aces.md) — pre-release ACE removal policy; retires `SetQuality`, `GetCurrentQuality`, `GetQualityCount` (issue #5, epic #1). Supersedes ADR-0001 §1 for the pre-release window.
- [decisions/0005-awaitable-load-video.md](decisions/0005-awaitable-load-video.md) — `Load Video` made awaitable via polled `getDuration() > 0`; explains why GCore's resolve-at-`Ready` doesn't port and why `PLAYING` is unreliable; settle-on-all-outcomes semantics, generation counter, 15s timeout (issue #18).
- [decisions/0006-video-url-parsing-scope.md](decisions/0006-video-url-parsing-scope.md) — `extractVideoId()` scoped to parse-only: locks the guaranteed single-video URL set (adds `/live/`), documents the host-agnostic guarantee (nocookie/mobile/music subdomains) and the ignored `list=`/`t=`/`si=`/`index=` params; playlist load/navigation deferred to issue #12 (issue #8).

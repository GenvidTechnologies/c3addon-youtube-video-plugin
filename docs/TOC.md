# Documentation Index

<!--
Genvid plugin skills consult this index to find your project's docs.
Each entry should be a one-line description. Add docs here as they are
written so the plugin's skills can discover them.
-->

- [usage.md](usage.md) — user-facing guide for Construct 3 developers. **Being rewritten for YouTube** (still describes the GCore-era surface; see open issues).
- [architecture.md](architecture.md) — editor/runtime split, the DOM message bridge, and why player-API coupling is isolated to `ElementHandler.ts`.
- [youtube-player-api.md](youtube-player-api.md) — the YouTube IFrame Player API surface used by the plugin (loading the API, building `YT.Player`, events, methods). Currently a scaffold; findings are filled in as the integration is built.

## Decision Records

- [decisions/0001-additive-v2-api-expansion.md](decisions/0001-additive-v2-api-expansion.md) — additive-only ACE expansion, construction-time rebuild discipline, and empirical verification mandate for the full v2 API conversion (issue #1).

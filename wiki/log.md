# Wiki Log

Record of every `ingest` run: what changed, why, and which `raw/` source
drove it, grouped under `## YYYY-MM-DD` date headings (ISO 8601) with the
**newest date group first**. Entries are prose bullets, e.g. `* **Update**:
…`, `* **Creation**: …`, `* **Deprecation**: …` — the leading bold word is a
convention, not a requirement.

**Add newest first, never edit or remove a prior entry.** "Newest first"
means a new entry (and, if today isn't already the top group, a new
`## YYYY-MM-DD` heading) is *prepended* above everything else — the
insertion point moves from the bottom to the top, but prepending never
touches a prior entry's text, so the append-only guarantee holds exactly as
before. If a past entry itself needs correcting, add a new entry that says
so; never edit or remove the old one in place. See `wiki/schema.md` for
the full maintenance schema.

## 2026-10-22

* **Update**: releasing.md — #37 no longer waits for a release to close: its acceptance criteria were edited down to the source-string match, so it closes with the fix (PR #38); corrects the earlier "Refs until a release" note below. Source: issue #37 as edited 2026-10-22.
* **Update**: sample-project.md — added the identity-metadata (author) lockstep rule and the validate-sample / validate-addons blind spots; source: issue #37 and session insight.
* **Update**: releasing.md — added release-time verification of addon author metadata; source: issue #37 and session insight.

## 2026-10-21

* **Creation**: architecture.md — distilled from `raw/2026-10-21-docs-architecture.md` (moved from `docs/architecture.md`).
* **Creation**: youtube-player-api.md — distilled from `raw/2026-10-21-docs-youtube-player-api.md` (moved from `docs/youtube-player-api.md`).
* **Creation**: debugging-the-player.md — distilled from `raw/2026-10-21-claude-md-gotchas.md` (moved from `CLAUDE.md` § Debugging the player).
* **Creation**: releasing.md — distilled from `raw/2026-10-21-claude-md-gotchas.md` (moved from `CLAUDE.md` § Releasing).
* **Creation**: addon-manifest-bom.md — distilled from `raw/2026-10-21-claude-md-gotchas.md` (moved from `CLAUDE.md` § Editing the addon-definition files (UTF-8 BOM)).
* **Creation**: sample-project.md — distilled from `raw/2026-10-21-claude-md-gotchas.md` (moved from `CLAUDE.md` §§ The sample project and C3 domain tooling).
* **Creation**: index.md — now the project's documentation index, replacing `docs/TOC.md` (captured as `raw/2026-10-21-docs-TOC.md`); decisions/index.md created for the decision records.
* **Migration**: usage.md — moved verbatim from `docs/usage.md`; frontmatter and a Related section added.
* **Migration**: issue-triage.md — moved verbatim from `docs/issue-triage.md`; frontmatter added.
* **Migration**: decisions/0001-additive-v2-api-expansion.md — moved verbatim from `docs/decisions/`; frontmatter added (status stable).
* **Migration**: decisions/0002-playervars-mapping-constraints.md — moved verbatim from `docs/decisions/`; frontmatter added (status stable).
* **Migration**: decisions/0003-mute-state-decoupled-from-volume.md — moved verbatim from `docs/decisions/`; frontmatter added (status stable).
* **Migration**: decisions/0004-retire-pre-release-quality-aces.md — moved verbatim from `docs/decisions/`; frontmatter added (status stable).
* **Migration**: decisions/0005-awaitable-load-video.md — moved verbatim from `docs/decisions/`; frontmatter added (status stable).
* **Migration**: decisions/0006-video-url-parsing-scope.md — moved verbatim from `docs/decisions/`; frontmatter added (status stable).
* **Migration**: decisions/0007-captions-map-retire-subtitle-aces.md — moved verbatim from `docs/decisions/`; frontmatter added (status stable).
* **Migration**: decisions/0008-playback-rate-and-metadata-aces.md — moved verbatim from `docs/decisions/`; frontmatter added (status stable).
* **Migration**: decisions/0009-gate-docs-drift-against-ace-surface.md — moved verbatim from `docs/decisions/`; frontmatter added (status stable).

---
okf_version: "0.2"
---

# Wiki Index

This is the project's documentation table of contents — every page under `wiki/`,
grouped under section headings, one line each. The plugin's planning skills read it
as the docs index. `/gvt-dev:maintain-wiki` keeps this list current: a new page is
added here when it's created, and `lint` flags any page listed in **no** index —
here, or in a subdirectory's own `index.md`. Each entry's description is the linked
page's frontmatter `description`, so the index and the page can't drift.
See [schema.md](schema.md) for the page format and maintenance rules.

## Using the plugin

* [YouTube Video Plugin Usage Guide](usage.md) - User-facing, task-oriented guide for Construct 3 developers - instance properties, loading a video, playback control, playback rate, subtitles, chrome, gotchas, and an ACE quick reference.

## Architecture & player API

* [Architecture](architecture.md) - Editor/runtime split, the DOM message bridge, why player-API coupling is isolated to ElementHandler.ts, and the wiring chains for adding ACEs and plugin properties.
* [YouTube IFrame Player API notes](youtube-player-api.md) - The YouTube IFrame Player API surface used by the plugin - loading the API, the pre-created credentialless iframe, the playerVars mapping, methods, and the per-feature findings and hazards.
* [Debugging the player](debugging-the-player.md) - How to debug player-internal behavior empirically with test/player-test.html and the Playwright MCP, what the harness does and does not verify, and verifying helpers and the runtime reducer in Node.

## Development

* [The sample project and C3 domain tooling](sample-project.md) - The sample/ Construct 3 project - its lockstep coupling to the ACE/property surface and to the addon's identity metadata (author), the validate-sample gate and what it misses, safe programmatic JSON editing, and the c3-domain-manager setup gotchas.
* [Editing the addon-definition files (UTF-8 BOM)](addon-manifest-bom.md) - The three SDK manifest files (addon.json, aces.json, en-US.json) are UTF-8 with a BOM that must be preserved, and how to edit them when a multi-line Edit fails to match.
* [Releasing](releasing.md) - The tag-triggered release process - what release.yml does, the three-step ritual, why not to run gh release create locally, the never-reuse-2.1.0.0 version-number hazard, and verifying addon identity metadata (author) at release time.

## Process

* [Issue Triage Conventions](issue-triage.md) - Issue-triage conventions (flat-label variant) consumed by /gvt-dev:triage-issues - category labels, required fields, splitting/duplicates/dependencies policy, and the gh mutation recipes.

## Decision Records

* [Decision Records](decisions/index.md) - Index of the architecture and compromise decisions (ADR-0001 through ADR-0009); each record is listed there.

## Schema

* [Wiki Maintenance Schema](schema.md) - The maintenance rules for this wiki — page format, create-vs-update lifecycle, raw/ immutability, staleness policy and the verb contract.

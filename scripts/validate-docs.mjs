#!/usr/bin/env node
// Validate docs/usage.md against the current ACE/property surface, so it stops
// silently drifting the way README/usage prose otherwise can: `npm run build`
// copies only src/, ESLint is scoped to *.ts/*.json, and validate-sample.mjs
// only checks the sample/ project — nothing gates markdown. See CLAUDE.md
// memory "Docs coupled to ACE surface, ungated".
//
// Runs two independent checks:
//
// CHECK A — doc-drift gate. Every ACE/property name referenced in
// docs/usage.md's "8. Quick reference" tables, and every backticked
// PascalCase identifier anywhere in the doc, must resolve to a real
// action/condition/expression/property name in the current
// src/aces.json + src/lang/en-US.json surface (or be on the ALLOWLIST of
// genuine non-ACE terms). Catches renamed/retired ACEs left stale in prose.
//
// CHECK B — semantic-drift regression guard. For every boolean ("check"-type)
// instance property, if its en-US.json `desc` asserts "on by default" or
// "off by default", that assertion must match the actual default literal in
// src/plugin.ts's `new SDK.PluginProperty(...)` call. Catches a doc/code
// default going out of sync (see the "enable-chrome" default-description fix,
// PR #33).
//
// The ALLOWLIST errs toward inclusion: a missing entry is a false POSITIVE
// (breaks lint) whereas an over-broad entry is only a harmless false
// negative. If a legitimate non-ACE backticked term trips Check A, add it
// here rather than to aces.json/en-US.json.
import { readFileSync } from "node:fs";

// Backticked PascalCase tokens that are NOT ACEs -- Construct/DOM/YT-API
// terms referenced in prose (matched by prefix).
const ALLOWLIST_PREFIXES = ["Await", "ResizeObserver"];

const stripBom = (s) => s.replace(/^﻿/, "");
const readJson = (p) => JSON.parse(stripBom(readFileSync(p, "utf8")));
const normalize = (s) => s.toLowerCase().trim().replace(/\s+/g, " ");

// --- Current plugin surface (source of truth) --------------------------------
const aces = readJson("src/aces.json");
const exprNames = new Set(); // lower-cased (Construct expressions are case-insensitive)
for (const [cat, catVal] of Object.entries(aces)) {
  if (cat.startsWith("$") || !catVal || typeof catVal !== "object") continue;
  for (const e of catVal.expressions ?? []) {
    exprNames.add((e.expressionName ?? e.id).toLowerCase());
  }
}

const lang = readJson("src/lang/en-US.json");
const plugins = lang?.text?.plugins;
const pluginKey = plugins && Object.keys(plugins)[0];
if (!pluginKey) {
  console.error("validate-docs: could not find a plugin under text.plugins in en-US.json");
  process.exit(2);
}
const L = plugins[pluginKey];

const displayNames = new Set(); // normalized (lowercased, collapsed whitespace)
const propDescs = new Map(); // property id -> desc
for (const [id, p] of Object.entries(L.properties ?? {})) {
  if (p.name) displayNames.add(normalize(p.name));
  if (p.desc) propDescs.set(id, p.desc);
}
for (const c of Object.values(L.conditions ?? {})) {
  if (c["list-name"]) displayNames.add(normalize(c["list-name"]));
}
for (const a of Object.values(L.actions ?? {})) {
  if (a["list-name"]) displayNames.add(normalize(a["list-name"]));
}

// Boolean ("check"-type) property defaults from src/plugin.ts.
const pluginTs = readFileSync("src/plugin.ts", "utf8");
const boolDefaults = new Map(); // property id -> boolean default
const propRe = /new\s+SDK\.PluginProperty\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*([^)]+)\)/g;
for (let m; (m = propRe.exec(pluginTs)); ) {
  const [, type, id, rawDefault] = m;
  if (type !== "check") continue;
  const def = rawDefault.trim();
  if (def === "true") boolDefaults.set(id, true);
  else if (def === "false") boolDefaults.set(id, false);
}

const problems = [];

// --- CHECK A: doc-drift gate --------------------------------------------------
const usage = readFileSync("docs/usage.md", "utf8");
const lines = usage.split(/\r?\n/);

const isHeading = (line) => /^#{1,6}\s/.test(line);

const tableRowsAfter = (headingIdx) => {
  const rows = [];
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (isHeading(line)) break;
    if (line.trim().startsWith("|")) rows.push(line);
  }
  return rows;
};

const firstCellToken = (row) => {
  const cells = row.split("|");
  let token = (cells[1] ?? "").trim();
  const bold = token.match(/^\*\*(.*)\*\*$/);
  if (bold) token = bold[1].trim();
  const code = token.match(/^`(.*)`$/);
  if (code) token = code[1].trim();
  return token;
};

const qrHeadingIdx = lines.findIndex((l) => /^##\s+8\.\s*Quick reference/i.test(l.trim()));
if (qrHeadingIdx === -1) {
  problems.push('docs/usage.md: could not find "## 8. Quick reference" heading');
} else {
  for (const [heading, kind] of [
    ["### Actions", "aceName"],
    ["### Conditions", "aceName"],
    ["### Expressions", "exprName"],
  ]) {
    const headingIdx = lines.findIndex(
      (l, i) => i > qrHeadingIdx && l.trim() === heading
    );
    if (headingIdx === -1) {
      problems.push(`docs/usage.md: could not find "${heading}" under "## 8. Quick reference"`);
      continue;
    }
    const rows = tableRowsAfter(headingIdx);
    const dataRows = rows.slice(2); // skip header row + |---| separator row
    for (const row of dataRows) {
      const token = firstCellToken(row);
      if (!token) continue;
      const resolved =
        kind === "exprName" ? exprNames.has(token.toLowerCase()) : displayNames.has(normalize(token));
      if (!resolved) {
        problems.push(`docs/usage.md: "${heading}" row references unknown ${kind === "exprName" ? "expression" : "ACE"} "${token}"`);
      }
    }
  }
}

const backtickRe = /`([A-Z]\w+)`/g;
for (let m; (m = backtickRe.exec(usage)); ) {
  const token = m[1];
  if (ALLOWLIST_PREFIXES.some((p) => token.startsWith(p))) continue;
  const resolved = exprNames.has(token.toLowerCase()) || displayNames.has(normalize(token));
  if (!resolved) {
    problems.push(`docs/usage.md: backticked identifier "${token}" is not in the current ACE surface (and not allowlisted)`);
  }
}

// --- CHECK B: semantic-drift regression guard ---------------------------------
for (const [id, desc] of propDescs) {
  const m = desc.match(/(on|off)\s+by\s+default/i);
  if (!m) continue;
  const asserted = m[1].toLowerCase() === "on";
  const actual = boolDefaults.get(id);
  if (actual === undefined) continue; // not a boolean-literal property; can't verify
  if (asserted !== actual) {
    problems.push(
      `src/lang/en-US.json: property "${id}" desc asserts "${m[1]} by default" but src/plugin.ts default is ${actual}`
    );
  }
}

// --- Report --------------------------------------------------------------------
if (problems.length) {
  console.error(`validate-docs: ${problems.length} problem(s):`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log("validate-docs: OK (docs/usage.md matches the current ACE surface and property defaults)");

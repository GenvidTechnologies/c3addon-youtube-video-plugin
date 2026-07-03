#!/usr/bin/env node
// Validate that the sample/ Construct 3 project only uses the plugin's CURRENT
// ACE/property surface, so GCore-era drift (retired actions/conditions/params/
// expressions/properties) fails locally instead of only when Construct loads the
// sample. sample/ has no other gate: `npm run build` copies only src/, and ESLint
// is scoped to src/, so nothing here is otherwise checked until a manual C3 load.
//
// It checks, for every reference to one of THIS plugin's object types in the
// sample event sheets and layouts:
//   - condition / action ids exist in src/aces.json (or are Construct common ACEs),
//   - action parameter keys are declared params of that action,
//   - `<PluginType>.<Expr>` expressions name a real expression (or a common one), and
//   - instance property keys exist in the plugin's property set (src/plugin.ts).
// Missing (vs. extra) params/props are NOT flagged — Construct fills those with
// defaults on load; only stale references break it. See CLAUDE.md "The sample
// project (sample/)".
//
// Construct's COMMON ACEs (set-visible, X/Y/Width, ...) live on every world
// instance and are NOT in a plugin's aces.json, so they are allow-listed below.
// The lists err toward inclusion: a missing entry is a false POSITIVE (breaks
// lint) whereas an over-broad entry is only a harmless false negative. If a real
// common ACE trips this, add its id/name here rather than to aces.json.
import { readFileSync, readdirSync } from "node:fs";

const COMMON_ACE_IDS = new Set([
  // common world-instance actions
  "destroy", "set-visible", "set-enabled", "set-position", "set-position-to-object",
  "set-x", "set-y", "move-to-layer", "move-to-top", "move-to-bottom", "move-to-object",
  "set-z-index", "set-z-elevation", "set-angle", "rotate-clockwise", "rotate-counter-clockwise",
  "rotate-toward-angle", "rotate-toward-position", "set-opacity", "set-size", "set-width",
  "set-height", "set-scale", "set-scale-x", "set-scale-y", "set-mirrored", "set-flipped",
  "set-effect-enabled", "set-effect-parameter", "set-blend-mode", "load-from-json-string",
  "set-instance-variable", "add-to-instance-variable", "subtract-from-instance-variable",
  "set-boolean-instance-variable", "toggle-boolean-instance-variable",
  // common world-instance conditions
  "is-visible", "is-enabled", "on-created", "on-destroyed", "is-on-screen", "is-outside-layout",
  "compare-x", "compare-y", "compare-opacity", "compare-instance-variable",
  "is-boolean-instance-variable-set", "pick-instance", "pick-all", "pick-by-comparison",
  "pick-by-evaluate", "pick-nth-instance", "pick-random-instance", "is-picked",
]);
const COMMON_EXPR = new Set([
  "x", "y", "width", "height", "angle", "angledegrees", "opacity", "zindex", "zelevation",
  "layernumber", "layername", "count", "pickedcount", "uid", "iid", "bboxleft", "bboxright",
  "bboxtop", "bboxbottom", "imagepointx", "imagepointy", "imagepointcount",
]);

const stripBom = (s) => s.replace(/^﻿/, "");
const readJson = (p) => JSON.parse(stripBom(readFileSync(p, "utf8")));
const listJson = (dir) => readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => `${dir}/${f}`);

// --- Current plugin surface (source of truth) --------------------------------
const addon = readJson("src/addon.json");
const pluginId = addon.id;

const aces = readJson("src/aces.json");
const conditionIds = new Set();
const actionIds = new Set();
const actionParams = new Map(); // action id -> Set(param id)
const expressionNames = new Set(); // lower-cased (Construct expressions are case-insensitive)
for (const [cat, catVal] of Object.entries(aces)) {
  if (cat.startsWith("$") || !catVal || typeof catVal !== "object") continue;
  for (const c of catVal.conditions ?? []) conditionIds.add(c.id);
  for (const a of catVal.actions ?? []) {
    actionIds.add(a.id);
    actionParams.set(a.id, new Set((a.params ?? []).map((p) => p.id)));
  }
  for (const e of catVal.expressions ?? []) expressionNames.add((e.expressionName ?? e.id).toLowerCase());
}

// Instance property ids from src/plugin.ts (skip non-serialized property kinds).
const pluginTs = readFileSync("src/plugin.ts", "utf8");
const propIds = new Set();
const propRe = /new\s+SDK\.PluginProperty\(\s*"([^"]+)"\s*,\s*"([^"]+)"/g;
for (let m; (m = propRe.exec(pluginTs)); ) {
  if (["group", "link", "info"].includes(m[1])) continue; // headers/buttons, not instance props
  propIds.add(m[2]);
}

// Which sample object types are instances of THIS plugin (usually just VideoPlayer).
const pluginTypes = new Set();
for (const f of listJson("sample/objectTypes")) {
  const ot = readJson(f);
  if (ot["plugin-id"] === pluginId) pluginTypes.add(ot.name);
}

// --- Walk the sample and collect stale references ----------------------------
const problems = [];
const exprRe = new RegExp(`\\b(${[...pluginTypes].join("|")})\\.([A-Za-z_]\\w*)`, "g");

const checkParamStrings = (params, where) => {
  for (const v of Object.values(params ?? {})) {
    if (typeof v !== "string") continue;
    for (let m; (m = exprRe.exec(v)); ) {
      const name = m[2].toLowerCase();
      if (!expressionNames.has(name) && !COMMON_EXPR.has(name)) {
        problems.push(`${where}: expression "${m[1]}.${m[2]}" is not in the current expression surface`);
      }
    }
  }
};

const walkEvents = (evs, where) => {
  for (const ev of evs ?? []) {
    for (const c of ev.conditions ?? []) {
      if (pluginTypes.has(c.objectClass) && c.id && !conditionIds.has(c.id) && !COMMON_ACE_IDS.has(c.id)) {
        problems.push(`${where}: condition "${c.objectClass}.${c.id}" is not in the current ACE surface`);
      }
      checkParamStrings(c.parameters, where);
    }
    for (const a of ev.actions ?? []) {
      if (pluginTypes.has(a.objectClass) && a.id) {
        if (!actionIds.has(a.id)) {
          if (!COMMON_ACE_IDS.has(a.id)) {
            problems.push(`${where}: action "${a.objectClass}.${a.id}" is not in the current ACE surface`);
          }
        } else {
          for (const key of Object.keys(a.parameters ?? {})) {
            if (!actionParams.get(a.id).has(key)) {
              problems.push(`${where}: action "${a.objectClass}.${a.id}" has stale param "${key}"`);
            }
          }
        }
      }
      checkParamStrings(a.parameters, where);
    }
    walkEvents(ev.children, where);
  }
};

const walkInstances = (insts, where) => {
  for (const inst of insts ?? []) {
    if (!pluginTypes.has(inst.type)) continue;
    for (const key of Object.keys(inst.properties ?? {})) {
      if (!propIds.has(key)) problems.push(`${where}: ${inst.type} instance has stale property "${key}"`);
    }
  }
};

for (const f of listJson("sample/eventSheets")) walkEvents(readJson(f).events, f);
for (const f of listJson("sample/layouts")) {
  const ml = readJson(f);
  for (const layer of ml.layers ?? []) walkInstances(layer.instances, f);
  walkInstances(ml["nonworld-instances"], f);
}

// --- Report ------------------------------------------------------------------
if (pluginTypes.size === 0) {
  console.error(`validate-sample: no sample object type references plugin id ${pluginId}`);
  process.exit(2);
}
if (problems.length) {
  console.error(`validate-sample: ${problems.length} stale reference(s) to the retired GCore surface:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`validate-sample: OK (sample uses only the current ${[...pluginTypes].join(", ")} surface)`);

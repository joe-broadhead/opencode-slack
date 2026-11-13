// @we-the-rebel-alliance/source-contract 0.1.0. Built by scripts/build.mjs; do not edit.
import {
  SUPPORTED_CONTRACT_VERSIONS
} from "./chunk-ELPJD3ND.js";
import {
  EVENT_KINDS,
  MAX_BYTES,
  isEventKind
} from "./chunk-ZTRH3FEM.js";
import {
  OUTPUT_NAMES,
  isOutputName
} from "./chunk-UGUA267L.js";
import {
  _enum,
  array,
  boolean,
  looseObject,
  number,
  object,
  problemsOf,
  record,
  string,
  unknown
} from "./chunk-6RDMPYYW.js";

// src/descriptor.ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
var MAX_BYTES_LIMIT = MAX_BYTES.max;
var DEFAULT_MAX_BYTES = MAX_BYTES.default;
var SOURCE_ID = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
var METHOD = /^[A-Za-z0-9_.-]{1,100}$/;
var ACTION = /^[A-Za-z0-9_.-]{1,200}$/;
var OPERATION = /^[A-Za-z0-9_.-]{1,200}$/;
var DETAIL_FIELDS = ["external_id", "kind", "occurred_at", "url", "thread", "actors", "labels", "hash"];
var action = string().regex(ACTION, "must be a permission action, such as gws.events_list");
var operation = string().regex(OPERATION, "must be an operation name of letters, digits, dots, underscores or hyphens");
var price = object({ per: string().min(1).max(40), usd: number().nonnegative().finite() });
var item = looseObject({
  id: string().regex(SOURCE_ID, "must be the plugin's name and the source's, dotted and lowercase, such as gws.gmail"),
  kind: _enum(["events", "snapshot"]),
  tool: string().regex(METHOD, "must be a tools-RPC method name"),
  input: record(string(), unknown()).optional(),
  // PROVISIONAL (app#2346 decisions D13 and D15, PR #7): one event kind, core or x-<plugin>/<kind>. Whether `reads`
  // takes a list, and whether an extension's <plugin> must match the descriptor's, are not agreed yet.
  reads: string().refine(isEventKind, `must be an event kind: ${EVENT_KINDS.join(", ")}, or x-<plugin>/<kind>`).optional(),
  output: string().optional(),
  params: record(string(), looseObject({ relative: boolean().optional(), me: boolean().optional() })).optional(),
  accounts: looseObject({ named: boolean().optional() }).optional(),
  scope: looseObject({ keys: array(string().regex(/^[a-z][a-zA-Z0-9_-]{0,39}$/)).min(1), describe: string().max(200).optional() }).optional(),
  details: array(
    looseObject({
      id: string().regex(SOURCE_ID),
      tool: string().regex(METHOD),
      from: array(_enum(DETAIL_FIELDS)).min(1)
    })
  ).optional(),
  permission: looseObject({
    events: action.optional(),
    tool: action.optional(),
    operations: array(operation).min(1, "must name at least one operation: grants and off switches key on them")
  }),
  private: boolean().optional(),
  cost: looseObject({ class: _enum(["free", "metered", "billed"]), units: array(price).optional(), probe: price.optional() }),
  cadence: looseObject({ providerMinMinutes: number().int().positive().optional() }).optional(),
  maxBytes: number().int().positive().max(MAX_BYTES_LIMIT, `must be at most ${MAX_BYTES_LIMIT} (1 MB)`).optional(),
  maxAgeSec: number().int().positive().optional(),
  retentionDays: number().int().positive().optional(),
  urlHosts: array(string().min(1).max(253)).optional()
}).superRefine((source, context) => {
  const problem = (path, message) => context.addIssue({ code: "custom", path, message });
  if (source.kind === "events") {
    if (source.reads === void 0) problem(["reads"], "an events source must say which event kind it reads");
    if (source.permission.events === void 0) problem(["permission", "events"], "an events source must name its method's action");
    if (source.output !== void 0) problem(["output"], "only a snapshot source has an output");
  } else {
    if (source.output === void 0) problem(["output"], `a snapshot source must name its output (${OUTPUT_NAMES.join(", ")})`);
    else if (!isOutputName(source.output)) problem(["output"], `"${source.output}" is not a registered output (${OUTPUT_NAMES.join(", ")})`);
    if (source.permission.tool === void 0) problem(["permission", "tool"], "a snapshot source must name its method's action");
    if (source.details !== void 0) problem(["details"], "only an events source has detail reads");
  }
  if (source.permission.events !== void 0 && source.permission.tool !== void 0) problem(["permission"], "name one method action: events or tool, not both");
  if (source.cost?.class === "billed" && (source.cost.units === void 0 || source.cost.units.length === 0)) {
    problem(["cost", "units"], "a billed source must state its price units");
  }
});
var sources = looseObject({
  contractVersion: number().int().refine((version) => SUPPORTED_CONTRACT_VERSIONS.includes(version), {
    message: `must be a contract version this package reads (${SUPPORTED_CONTRACT_VERSIONS.join(", ")})`
  }),
  items: array(item).min(1, "must declare at least one source")
}).superRefine((value, context) => {
  const seen = /* @__PURE__ */ new Set();
  for (const [index, source] of value.items.entries()) {
    for (const id of [source.id, ...(source.details ?? []).map((detail) => detail.id)]) {
      if (seen.has(id)) context.addIssue({ code: "custom", path: ["items", index, "id"], message: `"${id}" is declared twice` });
      seen.add(id);
    }
  }
});
function checkSources(value) {
  const result = sources.safeParse(value);
  if (result.success) return { ok: true, value };
  return { ok: false, problems: problemsOf(result.error).map((problem) => `sources.${problem}`.replace("sources.the value", "sources")) };
}
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.keys(value).sort().filter((key) => value[key] !== void 0).map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
function descriptorHash(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}
function readInstalledDescriptor(directory, options = {}) {
  const file = join(directory, "package.json");
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    const reason = error.code === "ENOENT" ? "there is no package.json there" : "its package.json is not JSON";
    return { ok: false, problems: [`no descriptor at ${directory}: ${reason}`] };
  }
  if (typeof pkg !== "object" || pkg === null || Array.isArray(pkg)) return { ok: false, problems: [`no descriptor at ${directory}: its package.json is not an object`] };
  const { name, version, sources: declared } = pkg;
  if (typeof name !== "string" || typeof version !== "string") return { ok: false, problems: [`no descriptor at ${directory}: its package.json has no name and version`] };
  if (options.version !== void 0 && options.version !== version) {
    return { ok: false, problems: [`${name} at ${directory} is version ${version}, not the ${options.version} the install names`] };
  }
  if (declared === void 0) return { ok: false, problems: [`${name} ${version} declares no sources (no top-level "sources" key)`] };
  const checked = checkSources(declared);
  if (!checked.ok) return { ok: false, problems: checked.problems.map((problem) => `${name} ${version}: ${problem}`) };
  return { ok: true, value: { package: name, version, directory, sources: checked.value, hash: descriptorHash(declared) } };
}
function findInstalledPackage(name, from) {
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name)) return void 0;
  let directory = from;
  for (; ; ) {
    const candidate = join(directory, "node_modules", ...name.split("/"));
    if (existsSync(join(candidate, "package.json"))) return candidate;
    const parent = dirname(directory);
    if (parent === directory) return void 0;
    directory = parent;
  }
}
function findSource(descriptor, id) {
  return descriptor.items.find((source) => source.id === id);
}
function maxBytesOf(source) {
  return source.maxBytes ?? DEFAULT_MAX_BYTES;
}

export {
  MAX_BYTES_LIMIT,
  DEFAULT_MAX_BYTES,
  DETAIL_FIELDS,
  checkSources,
  canonicalJson,
  descriptorHash,
  readInstalledDescriptor,
  findInstalledPackage,
  findSource,
  maxBytesOf
};

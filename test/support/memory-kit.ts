// Memory's conformance kit for a connector plugin (Memory Jobs design §9.3). Shared module: each connector plugin
// keeps an identical copy at `test/support/memory-kit.ts`, because each suite stands alone; `scripts/check-copies.mjs`
// fails when a copy drifts. Change it in every plugin at once, then update the hash there.
//
// What it checks, against `package.json#memory` (schema v2) and the plugin's own answers:
//
// 1. **The declaration.** The schema's frame, the reserved and read-only verbs, `{account}` as the only placeholder,
//    and that every declared read declares its scope inputs.
// 2. **The reads.** Run against a fixture in a session whose rules are exactly the declared grants: each must succeed,
//    and a **recording permission context** refuses any action the declaration does not grant, so a read that asserts
//    one is caught here rather than in Memory's collector.
// 3. **The identity read** answers a stable account and owner.
// 4. **`events_list`**, when declared, passes `eventsListConformance` plus contract 2 under that same session.
// 5. **Templates** are checked as declarations only: the item schema and the selection are Memory's job runner's to
//    dry-run, and the plugin holds no copy of it. `templateProblems` is what this kit can prove.
//
// It never contacts Memory, the source's server or the network: a fixture answers, and a fake permission context
// records what was asked. This module has no imports beyond `events-list.ts`, so a plugin can carry it as-is.
import {
  EVENT_KINDS,
  type ConformanceFixtures,
  type EventsListInput,
  eventsListConformance,
  resultProblems,
} from "../../src/host/events-list.js"

/** The verbs Memory accepts in a read's name. `fetch` is not one (it can send data out). */
export const READ_VERBS: readonly string[] = ["read", "get", "list", "search", "lookup", "view", "describe", "history", "query", "count"]

/** Verbs that change something, or send something out. A read's name may contain none of them. */
export const WRITE_VERBS: readonly string[] = [
  "send", "create", "update", "delete", "write", "post", "remove", "add", "set", "schedule", "upload", "download",
  "archive", "unarchive", "move", "merge", "close", "reopen", "approve", "reject", "share", "invite", "react",
  "draft", "complete", "run", "exec", "execute", "edit", "patch", "put", "push", "commit", "comment", "reply",
  "message", "broadcast", "follow", "block", "mute", "pin", "unpin", "star", "assign", "label", "lock", "trash",
]

/** Namespaces a plugin may not declare, because they are Memory's or the host's. */
export const RESERVED_NAMESPACES: readonly string[] = ["memory", "mem", "opencode", "records", "plugin", "system", "builtin", "core"]

/** The schema this kit reads. */
export const MEMORY_SCHEMA = "memory-plugin.v2.json"

/** A permission action and its resource, as the declaration writes them. */
export interface Grant {
  readonly action: string
  readonly resource: string
}

/** A declaration's problems, one sentence each; none when it keeps the frame. */
export function memoryDeclarationProblems(declaration: unknown): string[] {
  if (!plainObject(declaration)) return ["the memory key is not an object"]
  const problems: string[] = []
  const allowed = ["$schema", "version", "namespace", "connector", "sources", "templates"]
  for (const key of Object.keys(declaration)) if (!allowed.includes(key)) problems.push(`the memory key has "${key}", which schema v2 does not define`)
  const schema = declaration["$schema"]
  if (typeof schema !== "string" || !schema.endsWith(MEMORY_SCHEMA)) problems.push(`"$schema" must name ${MEMORY_SCHEMA}`)
  if (declaration["version"] !== 2) problems.push(`"version" must be 2`)
  const namespace = declaration["namespace"]
  if (typeof namespace !== "string" || !/^[a-z][a-z0-9-]{0,23}$/.test(namespace)) problems.push(`"namespace" must be a lowercase word`)
  else if (RESERVED_NAMESPACES.includes(namespace)) problems.push(`"namespace" must not be one of the reserved names ${RESERVED_NAMESPACES.join(", ")}`)
  const connector = declaration["connector"]
  if (connector === undefined) problems.push(`the memory key has no "connector"`)
  else problems.push(...connectorProblems(connector, typeof namespace === "string" ? namespace : ""))

  const sources = declaration["sources"]
  const sourceIds: string[] = []
  const connectorScope = scopeKeys(connector)
  const declared = new Set(connectorActions(connector).map((grant) => grant.action))
  if (sources !== undefined) {
    if (!Array.isArray(sources) || sources.length === 0) problems.push(`"sources" must be a list of at least one source`)
    else for (const [index, source] of sources.entries()) {
      const where = `sources[${index}]`
      problems.push(...sourceProblems(source, where, connectorScope, declared))
      if (plainObject(source) && typeof source["id"] === "string") sourceIds.push(source["id"])
    }
    if (new Set(sourceIds).size !== sourceIds.length) problems.push(`"sources" repeats an id`)
  }

  const templates = declaration["templates"]
  if (templates !== undefined) {
    if (!Array.isArray(templates)) problems.push(`"templates" must be a list`)
    else {
      if (templates.length > 8) problems.push(`"templates" holds ${templates.length}, over 8`)
      const ids: string[] = []
      for (const [index, template] of templates.entries()) {
        problems.push(...templateProblems(template, `templates[${index}]`, sourceIds, new Set(connectorReadNames(connector))))
        if (plainObject(template) && typeof template["id"] === "string") ids.push(template["id"])
      }
      if (new Set(ids).size !== ids.length) problems.push(`"templates" repeats an id`)
    }
  }
  return problems
}

/** `memoryDeclarationProblems`, for a test: throws one error that lists every problem. */
export function assertMemoryDeclaration(declaration: unknown): void {
  const problems = memoryDeclarationProblems(declaration)
  if (problems.length > 0) throw new Error(`the memory declaration breaks the frame:\n- ${problems.join("\n- ")}`)
}

/** A read's name as words, split at `_`, `.` and `-`. */
export const words = (name: string) => name.toLowerCase().split(/[._-]+/).filter((word) => word !== "")

/** Why a method or action's name is not a read's, or undefined when it is one. */
export function readVerbProblem(name: string): string | undefined {
  if (name.length === 0) return "a read must be named"
  const parts = words(name)
  const writes = parts.filter((word) => WRITE_VERBS.includes(word))
  if (writes.length > 0) return `"${name}" contains the write verb ${writes.join(", ")}`
  if (!parts.some((word) => READ_VERBS.includes(word))) return `"${name}" has no read verb (${READ_VERBS.join(", ")})`
  return undefined
}

/** Every grant the connector declares: its identity read, its reads and the source probes. */
export function connectorActions(connector: unknown): Grant[] {
  if (!plainObject(connector)) return []
  const grants: unknown[] = []
  const identity = connector["identity"]
  if (plainObject(identity)) grants.push(...(Array.isArray(identity["grants"]) ? identity["grants"] : []))
  const reads = connector["reads"]
  if (Array.isArray(reads)) for (const read of reads) if (plainObject(read) && Array.isArray(read["grants"])) grants.push(...read["grants"])
  const sources = connector["sources"]
  if (Array.isArray(sources)) for (const source of sources) if (plainObject(source) && plainObject(source["probe"])) grants.push(...(Array.isArray(source["probe"]["grants"]) ? source["probe"]["grants"] : []))
  return grants.flatMap((grant) => (plainObject(grant) && typeof grant["action"] === "string" && typeof grant["resource"] === "string" ? [{ action: grant["action"], resource: grant["resource"] }] : []))
}

/** The scope keys a connector declares. */
export function scopeKeys(connector: unknown): string[] {
  const scope = plainObject(connector) ? connector["scope"] : undefined
  if (!Array.isArray(scope)) return []
  return scope.flatMap((entry) => (plainObject(entry) && typeof entry["key"] === "string" ? [entry["key"]] : []))
}

/** The tool names a connector's reads name in their `input`. */
export function connectorReadNames(connector: unknown): string[] {
  const reads = plainObject(connector) ? connector["reads"] : undefined
  if (!Array.isArray(reads)) return []
  return reads.flatMap((read) => {
    const input = plainObject(read) ? read["input"] : undefined
    return plainObject(input) && typeof input["tool"] === "string" ? [input["tool"]] : []
  })
}

function connectorProblems(connector: unknown, namespace: string): string[] {
  if (!plainObject(connector)) return [`"connector" must be an object`]
  const problems: string[] = []
  const allowed = ["accounts", "identity", "reads", "scope", "billing"]
  for (const key of Object.keys(connector)) if (!allowed.includes(key)) problems.push(`"connector" has "${key}", which schema v2 does not define`)
  const accounts = connector["accounts"]
  if (accounts !== "single" && accounts !== "multi") problems.push(`"connector.accounts" must be "single" or "multi"`)

  const scope = connector["scope"]
  if (!Array.isArray(scope)) problems.push(`"connector.scope" must be a list, empty when the connector needs none`)
  else {
    const keys: string[] = []
    for (const [index, entry] of scope.entries()) {
      const at = `connector.scope[${index}]`
      if (!plainObject(entry)) {
        problems.push(`${at} is not an object`)
        continue
      }
      for (const key of Object.keys(entry)) if (!["key", "title", "kind", "pattern", "max", "required", "suggest"].includes(key)) problems.push(`${at} has "${key}", which schema v2 does not define`)
      const key = entry["key"]
      if (typeof key !== "string" || !/^[a-z][a-z0-9]{0,23}$/.test(key)) problems.push(`${at}.key must be a lowercase word of at most 24 characters`)
      else {
        keys.push(key)
      }
      if (typeof entry["title"] !== "string" || entry["title"].length === 0 || entry["title"].length > 60) problems.push(`${at}.title must be 1 to 60 characters`)
      if (entry["kind"] !== "ids") problems.push(`${at}.kind must be "ids"`)
      const pattern = entry["pattern"]
      if (typeof pattern !== "string" || pattern.length > 120) problems.push(`${at}.pattern must be a regular expression of at most 120 characters`)
      else {
        try {
          new RegExp(pattern)
        } catch {
          problems.push(`${at}.pattern is not a regular expression`)
        }
      }
      if (typeof entry["max"] !== "number" || !Number.isInteger(entry["max"]) || entry["max"] < 1 || entry["max"] > 64) problems.push(`${at}.max must be an integer from 1 to 64`)
      if (typeof entry["required"] !== "boolean") problems.push(`${at}.required must be true or false`)
      if (typeof entry["suggest"] !== "boolean") problems.push(`${at}.suggest must be true or false`)
    }
    if (new Set(keys).size !== keys.length) problems.push(`"connector.scope" repeats a key`)
  }

  const identity = connector["identity"]
  if (!plainObject(identity)) problems.push(`"connector.identity" must be an object: the account and owner call`)
  else {
    for (const key of Object.keys(identity)) if (!["method", "input", "grants", "account", "owner"].includes(key)) problems.push(`"connector.identity" has "${key}", which schema v2 does not define`)
    if (identity["method"] !== "read") problems.push(`"connector.identity.method" must be "read"`)
    if (!plainObject(identity["input"]) || Object.keys(identity["input"]).length === 0) problems.push(`"connector.identity.input" must name the read's input`)
    problems.push(...grantProblems(identity["grants"], `connector.identity.grants`, namespace))
    for (const field of ["account", "owner"]) {
      if (field === "account" && (typeof identity["account"] !== "string" || !identity["account"].startsWith("$."))) problems.push(`"connector.identity.account" must be a JSONPath starting $.`)
    }
    const owner = identity["owner"]
    if (!plainObject(owner) || typeof owner["id"] !== "string" || !owner["id"].startsWith("$.") || typeof owner["label"] !== "string" || !owner["label"].startsWith("$.")) {
      problems.push(`"connector.identity.owner" must be { id, label }, both JSONPaths starting $.`)
    }
  }

  const reads = connector["reads"]
  if (!Array.isArray(reads) || reads.length === 0) problems.push(`"connector.reads" must be a list of at least one read`)
  else {
    if (reads.length > 32) problems.push(`"connector.reads" holds ${reads.length}, over 32`)
    const keys = scopeKeys({ scope })
    const scoped = keys.length > 0
    for (const [index, read] of reads.entries()) {
      const at = `connector.reads[index ${index}]`
      if (!plainObject(read)) {
        problems.push(`${at} is not an object`)
        continue
      }
      for (const key of Object.keys(read)) if (!["method", "input", "grants", "scopeInputs", "kinds", "cursor", "billing"].includes(key)) problems.push(`${at} has "${key}", which schema v2 does not define`)
      if (read["method"] !== "read") problems.push(`${at}.method must be "read"`)
      const input = read["input"]
      if (!plainObject(input) || Object.keys(input).length === 0) problems.push(`${at}.input must name the read's tool or operation`)
      problems.push(...grantProblems(read["grants"], `${at}.grants`, namespace))
      const inputs = read["scopeInputs"]
      if (inputs === undefined) {
        if (scoped) problems.push(`${at}.scopeInputs is missing, so the read is unscoped, and a scoped connector cannot grant it`)
      } else if (!plainObject(inputs)) problems.push(`${at}.scopeInputs must be an object of read inputs to scope keys`)
      else {
        for (const [field, key] of Object.entries(inputs)) {
          if (typeof key !== "string" || !keys.includes(key)) problems.push(`${at}.scopeInputs.${field} names the scope key ${String(key)}, which "connector.scope" does not declare`)
        }
      }
      const kinds = read["kinds"]
      if (kinds !== undefined && (!Array.isArray(kinds) || kinds.some((kind) => !(EVENT_KINDS as readonly unknown[]).includes(kind)))) {
        problems.push(`${at}.kinds must be a list of ${EVENT_KINDS.join(", ")}`)
      }
      const billing = read["billing"]
      if (billing !== null && billing !== undefined && !billingShape(billing)) problems.push(`${at}.billing must be null or { unit: "call", note }`)
    }
  }

  const billing = connector["billing"]
  if (billing !== null && !billingShape(billing)) problems.push(`"connector.billing" must be null or { unit: "call", note }`)
  return problems
}

const billingShape = (value: unknown): boolean =>
  plainObject(value) && value["unit"] === "call" && typeof value["note"] === "string" && value["note"].length > 0 && value["note"].length <= 200

function grantProblems(grants: unknown, where: string, namespace: string): string[] {
  if (!Array.isArray(grants) || grants.length === 0) return [`"${where}" must be a list of at least one grant`]
  const problems: string[] = []
  if (grants.length > 8) problems.push(`"${where}" holds ${grants.length}, over 8`)
  for (const [index, grant] of grants.entries()) {
    const at = `${where}[${index}]`
    if (!plainObject(grant) || typeof grant["action"] !== "string" || typeof grant["resource"] !== "string") {
      problems.push(`${at} must be { action, resource }`)
      continue
    }
    const action = grant["action"]
    const problem = readVerbProblem(action)
    if (problem !== undefined) problems.push(`${at}: ${problem}`)
    if (namespace !== "" && !action.startsWith(`${namespace}_`) && !action.startsWith(`${namespace}.`)) {
      problems.push(`${at}.action "${action}" is not in this plugin's namespace "${namespace}"`)
    }
    const resource = grant["resource"]
    if (resource !== "*" && !/^(\{account\})(:[A-Za-z0-9._-]+)?$/.test(resource)) problems.push(`${at}.resource must be "*" or a template whose only placeholder is {account}`)
  }
  return problems
}

function sourceProblems(source: unknown, where: string, connectorScope: readonly string[], declared: ReadonlySet<string>): string[] {
  if (!plainObject(source)) return [`${where} is not an object`]
  const problems: string[] = []
  const allowed = ["id", "title", "summary", "contract", "kinds", "grants", "probe", "scope", "cadence", "billing", "setup", "input"]
  for (const key of Object.keys(source)) if (!allowed.includes(key)) problems.push(`${where} has "${key}", which schema v2 does not define`)
  if (typeof source["id"] !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(source["id"])) problems.push(`${where}.id must be a lowercase word of at most 40 characters`)
  const title = source["title"]
  if (typeof title !== "string" || title.length === 0 || title.length > 60) problems.push(`${where}.title must be 1 to 60 characters`)
  const about = source["summary"]
  if (typeof about !== "string" || about.length === 0 || about.length > 200) problems.push(`${where}.summary must be 1 to 200 characters`)
  if (source["contract"] !== 2) problems.push(`${where}.contract must be 2: a declared source needs the owner-only call`)
  const kinds = source["kinds"]
  if (!Array.isArray(kinds) || kinds.length === 0 || kinds.some((kind) => !(EVENT_KINDS as readonly unknown[]).includes(kind))) {
    problems.push(`${where}.kinds must be a non-empty list of ${EVENT_KINDS.join(", ")}`)
  }
  problems.push(...grantProblems(source["grants"], `${where}.grants`, "").map((problem) => problem.replace(/^"/, `"${where}.`)))
  const grants = Array.isArray(source["grants"]) ? source["grants"].flatMap((grant) => (plainObject(grant) && typeof grant["action"] === "string" ? [grant["action"]] : [])) : []
  for (const action of grants) if (!declared.has(action)) problems.push(`${where}.grants names ${action}, which no read, identity or probe of "connector" declares`)
  const probe = source["probe"]
  if (probe !== undefined) {
    if (!plainObject(probe)) problems.push(`${where}.probe must be an object`)
    else {
      for (const key of Object.keys(probe)) if (key !== "grants") problems.push(`${where}.probe has "${key}", which schema v2 does not define`)
      if (probe["grants"] !== undefined) problems.push(...grantProblems(probe["grants"], `${where}.probe.grants`, "").map((problem) => problem.replace(/^"/, `"${where}.probe.`)))
    }
  }
  const scope = source["scope"]
  if (scope !== undefined) {
    if (!Array.isArray(scope)) problems.push(`${where}.scope must be a list of the connector's scope keys`)
    else for (const [index, entry] of scope.entries()) {
      if (!plainObject(entry) || typeof entry["key"] !== "string") problems.push(`${where}.scope[${index}] must be a scope key object`)
      else if (!connectorScope.includes(entry["key"])) problems.push(`${where}.scope[${index}] names ${entry["key"]}, which "connector.scope" does not declare`)
    }
  }
  const cadence = source["cadence"]
  if (!plainObject(cadence) || typeof cadence["everyMinutes"] !== "number" || !Number.isInteger(cadence["everyMinutes"]) || cadence["everyMinutes"] < 15) {
    problems.push(`${where}.cadence.everyMinutes must be an integer of at least 15`)
  }
  if (source["billing"] !== null && !billingShape(source["billing"])) problems.push(`${where}.billing must be null or { unit: "call", note }`)
  const setup = source["setup"]
  if (typeof setup !== "string" || setup.length > 300) problems.push(`${where}.setup must be a string of at most 300 characters`)
  return problems
}

const OUTPUT_KINDS = ["journal", "timeline", "proposal:decision", "proposal:fact", "proposal:commitment_open", "proposal:commitment_close", "proposal:procedure", "proposal:person", "proposal:link"]
const WINDOWS = ["1d", "7d", "31d"]
const ENGINES = ["render", "extract", "synthesize"]

function templateProblems(template: unknown, where: string, sources: readonly string[], reads: ReadonlySet<string>): string[] {
  if (!plainObject(template)) return [`${where} is not an object`]
  const problems: string[] = []
  const allowed = ["id", "title", "summary", "trigger", "extract", "transform", "curate", "outputs", "budget"]
  for (const key of Object.keys(template)) if (!allowed.includes(key)) problems.push(`${where} has "${key}", which a template does not define`)
  if (typeof template["id"] !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(template["id"])) problems.push(`${where}.id must be a lowercase word of at most 40 characters`)
  const title = template["title"]
  if (typeof title !== "string" || title.length === 0 || title.length > 60) problems.push(`${where}.title must be 1 to 60 characters`)
  const summary = template["summary"]
  if (typeof summary !== "string" || summary.length === 0 || summary.length > 200) problems.push(`${where}.summary must be 1 to 200 characters`)
  const trigger = template["trigger"]
  if (!plainObject(trigger)) problems.push(`${where}.trigger must be an object`)
  else {
    const schedule = trigger["schedule"]
    if (!plainObject(schedule) || typeof schedule["every"] !== "string" || !/^\d{1,3}(m|h|d)$/.test(schedule["every"])) problems.push(`${where}.trigger.schedule.every must be a span such as 30m or 1d`)
  }
  const extract = template["extract"]
  if (!Array.isArray(extract) || extract.length === 0) problems.push(`${where}.extract must be a list of at least one step`)
  else {
    for (const [index, step] of extract.entries()) {
      const at = `${where}.extract[${index}]`
      if (!plainObject(step)) {
        problems.push(`${at} is not an object`)
        continue
      }
      for (const key of Object.keys(step)) if (!["use", "call", "connector", "for", "with", "paginate", "cursor", "emit", "scope"].includes(key)) problems.push(`${at} has "${key}", which a step does not define`)
      if (typeof step["connector"] !== "string" || step["connector"].length === 0) problems.push(`${at}.connector must name the plugin`)
      if (step["use"] !== undefined && step["call"] !== undefined) problems.push(`${at} has both "use" and "call"`)
      if (step["use"] !== undefined && step["use"] !== "events_list") problems.push(`${at}.use must be "events_list"`)
      if (step["call"] !== undefined && (typeof step["call"] !== "string" || !reads.has(step["call"]))) problems.push(`${at}.call must name one of the connector's declared reads`)
      const inputs: unknown = step["with"] === undefined ? {} : step["with"]
      if (!plainObject(inputs)) problems.push(`${at}.with must be an object`)
      // A step's inputs are binding values only: a collected item's text may never reach a remote service.
      for (const [field, value] of Object.entries(plainObject(inputs) ? inputs : {})) {
        if (typeof value === "string" && /\{\{\s*(item|doc|transform|unit)s?[.\]]/i.test(value)) problems.push(`${at}.with.${field} reads collected text, which a step's input may not`)
      }
    }
  }
  const transform = template["transform"]
  if (!plainObject(transform) || transform["into"] !== "events") problems.push(`${where}.transform.into must be "events"`)
  const curate = template["curate"]
  if (!plainObject(curate) || !Array.isArray(curate["stages"]) || curate["stages"].length === 0) problems.push(`${where}.curate.stages must be a list of at least one stage`)
  else {
    for (const [index, stage] of curate["stages"].entries()) problems.push(...stageProblems(stage, `${where}.curate.stages[${index}]`, sources))
  }
  const outputs = template["outputs"]
  if (!Array.isArray(outputs) || outputs.length === 0) problems.push(`${where}.outputs must be a list of at least one output`)
  else for (const output of outputs) if (!OUTPUT_KINDS.includes(output) && !/^section:[A-Z][A-Za-z0-9 ]{0,39}$/.test(String(output))) problems.push(`${where}.outputs names ${String(output)}, which is not an output kind`)
  const budget = template["budget"]
  if (budget !== undefined) {
    if (!plainObject(budget) || typeof budget["tokensPerRun"] !== "number" || !Number.isInteger(budget["tokensPerRun"]) || budget["tokensPerRun"] < 500 || budget["tokensPerRun"] > 25000) {
      problems.push(`${where}.budget.tokensPerRun must be an integer from 500 to 25000`)
    }
  }
  return problems
}

function stageProblems(stage: unknown, where: string, sources: readonly string[]): string[] {
  if (!plainObject(stage)) return [`${where} is not an object`]
  const problems: string[] = []
  for (const key of Object.keys(stage)) if (!["engine", "select", "render", "hints", "outputs"].includes(key)) problems.push(`${where} has "${key}", which a stage does not define`)
  const engine = stage["engine"]
  if (!ENGINES.includes(String(engine))) problems.push(`${where}.engine must be one of ${ENGINES.join(", ")}`)
  const select = stage["select"]
  if (!plainObject(select)) problems.push(`${where}.select must be an object`)
  else {
    const named = select["sources"]
    if (!Array.isArray(named) || named.length === 0) problems.push(`${where}.select.sources must name at least one source`)
    else for (const source of named) if (!sources.includes(String(source))) problems.push(`${where}.select.sources names ${String(source)}, which this plugin does not declare`)
    if (select["unit"] !== "event" && select["unit"] !== "thread") problems.push(`${where}.select.unit must be "event" or "thread"`)
    if (!WINDOWS.includes(String(select["window"]))) problems.push(`${where}.select.window must be one of ${WINDOWS.join(", ")}`)
    const max = select["maxUnits"]
    if (max !== undefined && (typeof max !== "number" || !Number.isInteger(max) || max < 1 || max > 200)) problems.push(`${where}.select.maxUnits must be an integer from 1 to 200`)
    const kinds = select["kinds"]
    if (kinds !== undefined && (!Array.isArray(kinds) || kinds.some((kind) => !(EVENT_KINDS as readonly unknown[]).includes(kind)))) problems.push(`${where}.select.kinds must be event kinds`)
  }
  const render = stage["render"]
  if (engine === "render" && !plainObject(render)) problems.push(`${where}.render is required for the render engine`)
  if (render !== undefined) {
    if (!plainObject(render)) problems.push(`${where}.render must be an object`)
    else {
      if (render["into"] !== "journal" && render["into"] !== "section") problems.push(`${where}.render.into must be "journal" or "section"`)
      if (typeof render["heading"] !== "string" || render["heading"].length === 0 || render["heading"].length > 60) problems.push(`${where}.render.heading must be 1 to 60 characters`)
      if (typeof render["line"] !== "string" || render["line"].length === 0 || render["line"].length > 300) problems.push(`${where}.render.line must be 1 to 300 characters`)
      const max = render["max"]
      if (max !== undefined && (typeof max !== "number" || !Number.isInteger(max) || max < 1 || max > 50)) problems.push(`${where}.render.max must be an integer from 1 to 50`)
    }
  }
  if (engine !== "render" && stage["outputs"] !== undefined) {
    const outputs = stage["outputs"]
    if (!Array.isArray(outputs)) problems.push(`${where}.outputs must be a list`)
    else for (const output of outputs) if (!OUTPUT_KINDS.includes(output)) problems.push(`${where}.outputs names ${String(output)}, which an extract stage may not write`)
  }
  const hints = stage["hints"]
  if (hints !== undefined && (typeof hints !== "string" || hints.length > 1500)) problems.push(`${where}.hints must be a string of at most 1500 characters`)
  return problems
}

// ── A recording session ─────────────────────────────────────────────────

/** One executor a fixture serves, as OpenCode lists it. */
export interface FixtureTool {
  readonly id: string
  execute(input: Record<string, unknown>, context: unknown): Promise<unknown>
}

/** What a session did: each action it asserted, each tool it called, and any action the grants do not hold. */
export interface RecordingSession {
  readonly assertions: { readonly action: string; readonly resources: readonly string[] }[]
  readonly calls: string[]
  readonly undeclared: string[]
  readonly permission: { assert: (input: { readonly action: string; readonly resources?: readonly string[] }) => Promise<void> }
  readonly tool: { list: () => Promise<readonly FixtureTool[]> }
}

/**
 * A session whose rules are exactly `grants`: an action it does not hold is recorded in `undeclared` and refused with
 * the same shape OpenCode refuses one, so a read that asserts more than its declaration says fails here.
 */
export function recordingSession(grants: readonly Grant[], tools: readonly FixtureTool[], actionOf: (id: string) => string = (id) => id): RecordingSession {
  const held = new Set(grants.map((grant) => `${grant.action}\u0000${grant.resource}`))
  const allowed = (action: string) => held.has(`${action}\u0000*`) || [...held].some((entry) => entry.startsWith(`${action}\u0000`) && !entry.endsWith("\u0000*"))
  const assertions: RecordingSession["assertions"] = []
  const calls: string[] = []
  const undeclared: string[] = []
  return {
    assertions,
    calls,
    undeclared,
    permission: {
      assert: async (input) => {
        const resources = input.resources ?? ["*"]
        assertions.push({ action: input.action, resources })
        if (allowed(input.action)) return
        undeclared.push(input.action)
        throw Object.assign(new Error(`Permission denied: ${input.action}`), { _tag: "Tool.Error", error: { _tag: "Permission.DeniedError" } })
      },
    },
    tool: {
      list: async () =>
        tools.map((tool) => ({
          id: tool.id,
          execute: async (input: Record<string, unknown>, context: unknown) => {
            calls.push(tool.id)
            const action = actionOf(tool.id)
            assertions.push({ action, resources: ["*"] })
            if (!allowed(action)) {
              undeclared.push(action)
              throw Object.assign(new Error(`Permission denied: ${action}`), { _tag: "Tool.Error", error: { _tag: "Permission.DeniedError" } })
            }
            return tool.execute(input, context)
          },
        })),
    },
  }
}

// ── Conformance ─────────────────────────────────────────────────────────

/** A source's events_list as the plugin holds it: the session's read, then the caller's input. */
export type EventsListWithRead = (input: EventsListInput, read: KitRead) => Promise<unknown>

/** A source's events_list as `eventsListConformance` calls it. */
export type EventsListInputFunction = (input: EventsListInput) => Promise<unknown>

/** What a fixture's executor answers, as the plugin's own `Read` does. */
export type KitRead = (tool: string, input: Record<string, unknown>) => Promise<{ readonly output?: unknown; readonly text: string }>

/** What the kit runs: a declaration, a fixture's tools, and the source's events_list when it declares one. */
export interface MemoryConformance {
  readonly declaration: unknown
  /** Every action the declaration holds: the union of its identity, reads and probes. */
  readonly tools?: readonly FixtureTool[]
  /** The permission action an executor id asserts; the identity by default, as an MCP tool's is. */
  readonly actionOf?: (id: string) => string
  /** The id OpenCode lists a declared read's tool under, when it is not the tool's own name (an MCP server prefixes it). */
  readonly executorIdOf?: (tool: string) => string
  /** A sample input for each declared read, by its tool name, so the kit can run it. */
  readonly samples?: Readonly<Record<string, Record<string, unknown>>>
  /** The source's events_list, run as its tool or RPC method does, over the fixture. */
  readonly eventsList?: EventsListWithRead
  readonly eventsFixtures?: ConformanceFixtures
  /** The session's context, passed to every executor. */
  readonly context?: unknown
}

/**
 * Every way the plugin breaks Memory's connector pattern over its own fixture, one sentence each; none when it keeps
 * it. The declaration must pass the frame; every declared read must run in a session whose rules are exactly the
 * declared grants, and a recording context must see no action the declaration does not grant; `events_list` must pass
 * `eventsListConformance` and contract 2 under that same session; and the identity read must answer a stable account and
 * owner. Templates are checked as declarations (step 5 of §9.3 needs Memory's job runner, which a plugin does not hold).
 */
export async function memoryConformance(input: MemoryConformance): Promise<string[]> {
  const problems = memoryDeclarationProblems(input.declaration)
  const grants = connectorGrantList(input.declaration)
  const actionOf = input.actionOf ?? ((id: string) => id)
  const executorIdOf = input.executorIdOf ?? ((tool: string) => tool)
  const session = recordingSession(grants, input.tools ?? [], actionOf)
  const executors = await session.tool.list()

  for (const [index, read] of declaredReads(input.declaration).entries()) {
    const tool = plainObject(read["input"]) ? read["input"]["tool"] : undefined
    if (typeof tool !== "string") continue
    const sample = input.samples?.[tool]
    if (sample === undefined) {
      problems.push(`connector.reads[index ${index}] (${tool}) has no sample input, so the kit cannot run it`)
      continue
    }
    const executor = executors.find((entry) => entry.id === executorIdOf(tool))
    if (executor === undefined) {
      problems.push(`connector.reads[index ${index}] (${tool}) has no executor in the fixture`)
      continue
    }
    try {
      await executor.execute(sample, input.context)
    } catch (error) {
      problems.push(`the declared read ${tool} failed with its declared grants: ${error instanceof Error ? error.message.split("\n", 1)[0] : String(error)}`)
    }
  }

  if (input.eventsList !== undefined && input.eventsFixtures !== undefined) {
    const eventsList = input.eventsList
    const list: EventsListInputFunction = (call) => eventsListThrough(eventsList, call, executors, input.context, executorIdOf)
    problems.push(...(await eventsListConformance(list, input.eventsFixtures)).map((problem) => `events_list: ${problem}`))
    const declared = declaredSource(input.declaration)
    if (declared !== undefined) {
      const kinds = Array.isArray(declared["kinds"]) ? declared["kinds"] : []
      const result = await list({ limit: 1 }).catch(() => undefined)
      if (plainObject(result) && Array.isArray(result["events"])) {
        for (const event of result["events"]) {
          if (plainObject(event) && !kinds.includes(event["kind"])) problems.push(`events_list lists a ${String(event["kind"])} event, which the source does not declare`)
        }
      }
    }
    const identity = declaredIdentity(input.declaration)
    const ownerOnly = await list({ limit: 0 }).catch((error: unknown) => error)
    if (ownerOnly instanceof Error) problems.push(`events_list's owner-only call failed: ${ownerOnly.message.split("\n", 1)[0]}`)
    else {
      problems.push(...resultProblems(ownerOnly, 0).map((problem) => `the owner-only call: ${problem}`))
      if (plainObject(ownerOnly) && plainObject(identity)) {
        const account = pathValue(ownerOnly, identity["account"])
        const owner = plainObject(identity["owner"]) ? identity["owner"] : {}
        const id = pathValue(ownerOnly, owner["id"])
        const label = pathValue(ownerOnly, owner["label"])
        if (account === undefined) problems.push(`the identity read's account path ${String(identity["account"])} finds nothing in events_list's answer`)
        if (id === undefined || label === undefined) problems.push(`the identity read's owner paths find nothing in events_list's answer`)
      }
    }
  }

  for (const action of new Set(session.undeclared)) {
    problems.push(`a read asserted ${action}, which the declaration does not grant`)
  }
  return problems
}

/** `memoryConformance`, for a test: throws one error that lists every problem. */
export async function assertMemoryConformance(input: MemoryConformance): Promise<void> {
  const problems = await memoryConformance(input)
  if (problems.length > 0) throw new Error(`the plugin breaks Memory's connector pattern:\n- ${problems.join("\n- ")}`)
}

/**
 * A source's `events_list`, given the session's executors instead of the host's: the kit's `Read` answers in the same
 * `{ output?, text }` shape the plugin's own reader does, so `eventsListConformance` runs the real parser and the real
 * permission asserts.
 */
function eventsListThrough(list: EventsListWithRead, call: EventsListInput, executors: readonly FixtureTool[], context: unknown, executorIdOf: (tool: string) => string): Promise<unknown> {
  const read: KitRead = async (tool, input) => {
    const executor = executors.find((entry) => entry.id === executorIdOf(tool))
    if (executor === undefined) throw new Error(`the fixture has no ${tool}`)
    const result = (await executor.execute(input, context)) as { content?: unknown; output?: unknown }
    const text = typeof result.content === "string" ? result.content : Array.isArray(result.content) ? (result.content as { type?: string; text?: string }[]).flatMap((part) => (part.type === "text" && part.text !== undefined ? [part.text] : [])).join("\n") : ""
    return result.output === undefined ? { text } : { output: result.output, text }
  }
  return list(call, read)
}

const plainObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

/** The connector's grants, flattened: the identity's, the reads' and the source probes'. */
function connectorGrantList(declaration: unknown): Grant[] {
  const connector = plainObject(declaration) ? declaration["connector"] : undefined
  return connectorActions(connector)
}

function declaredReads(declaration: unknown): Record<string, unknown>[] {
  const connector = plainObject(declaration) ? declaration["connector"] : undefined
  const reads = plainObject(connector) ? connector["reads"] : undefined
  return Array.isArray(reads) ? reads.filter(plainObject) : []
}

function declaredSource(declaration: unknown): Record<string, unknown> | undefined {
  const sources = plainObject(declaration) ? declaration["sources"] : undefined
  return Array.isArray(sources) ? sources.filter(plainObject)[0] : undefined
}

function declaredIdentity(declaration: unknown): Record<string, unknown> | undefined {
  const connector = plainObject(declaration) ? declaration["connector"] : undefined
  const identity = plainObject(connector) ? connector["identity"] : undefined
  return plainObject(identity) ? identity : undefined
}

/** A `$.a.b` path's value in `value`, or undefined. */
export function pathValue(value: unknown, path: unknown): unknown {
  if (typeof path !== "string" || !path.startsWith("$.")) return undefined
  let current: unknown = value
  for (const part of path.slice(2).split(".")) {
    if (!plainObject(current)) return undefined
    current = current[part]
  }
  return current
}

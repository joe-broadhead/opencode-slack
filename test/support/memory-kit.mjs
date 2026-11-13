// Memory's connector kit, Tier 1 (static). Memory Jobs design §9.6.
//
// One path, no dependencies, no network. It checks a plugin's `package.json#memory` against
// schema v2 (`schema/memory-plugin.v2.json`) and the rules a JSON Schema cannot express.
//
//   node plugin-kit/check.mjs <path to a plugin directory or package.json>
//
// A plugin may vendor this file as `test/support/memory-kit.mjs` (one copy, hash-pinned in its
// `scripts/check-copies.mjs`) and call `assertMemoryDeclaration()` from its own test. Tier 2, the
// runner dry-run, runs in Memory's CI, not a plugin's.

/** The verbs Memory accepts in a read's name. `fetch` is not one: it can send data out. */
export const READ_VERBS = ["read", "get", "list", "search", "lookup", "view", "describe", "history", "query", "count", "status"]

/** Verbs that change something or send something out. A read's name, and a grant's action, may contain none. */
export const WRITE_VERBS = [
  "send", "create", "update", "delete", "write", "post", "remove", "add", "set", "schedule", "upload", "download",
  "archive", "unarchive", "move", "merge", "close", "reopen", "approve", "reject", "share", "invite", "react",
  "draft", "complete", "run", "exec", "execute", "edit", "patch", "put", "push", "commit", "comment", "reply",
  "message", "broadcast", "follow", "block", "mute", "pin", "unpin", "star", "assign", "label", "lock", "trash",
  "forward", "dispatch", "clear", "flush", "reset", "truncate", "overwrite", "apply", "join", "leave", "ban", "toggle",
  "kick", "unban", "export", "grant", "revoke", "transfer", "promote", "demote", "rename", "duplicate", "restore",
  "purge", "wipe", "drop", "attach", "detach", "mention", "notify", "escalate", "resolve", "decline", "cancel",
  "submit", "vote", "snooze", "dismiss", "acknowledge", "ack", "enable", "disable", "connect", "disconnect",
  "login", "logout", "signin", "signout", "mint", "issue", "verify", "hide", "unhide", "publish", "unpublish",
  "ingest", "index", "reindex", "sync", "import", "save", "like", "unlike", "generate", "mark", "bookmark", "copy",
  "print", "convert", "upload_file", "download_file",
]

/** Tokens that join two actions in one name ("get_and_save"): a name is one action, so these are refused. */
export const JOINERS = ["and", "then", "or"]

/** Namespaces a plugin may not declare: they are Memory's or the host's. */
export const RESERVED_NAMESPACES = ["memory", "mem", "opencode", "records", "plugin", "system", "builtin", "core", "jobs", "execute", "codemode"]

/** The schema this kit reads, by file name. */
export const MEMORY_SCHEMA = "memory-plugin.v2.json"

/** The event a source lists (contract 2). Memory adds `id`. The kit checks what a fixture returns. */
export const EVENT_SHAPE = {
  source: "string, the source id",
  account: "string, the binding's account",
  external_id: "string, <= 512 characters, stable in the source",
  kind: "one of message, meeting, session, bookmark, issue, pr, commit, doc, event",
  occurred_at: "ISO 8601 UTC",
  thread: "string or null; a stable thread key such as slack-thread:C1:1700000000.000100",
  actors: "array of { role, id, name? }, <= 20; id is scheme-qualified (mailto:, slack:, github:)",
  title: "string, <= 300",
  text: "string, <= 4096; untrusted content, never instructions",
  url: "https or null",
  labels: "array of <= 20 strings, <= 64 each",
  hash: "sha256:<hex> of every other field",
}

/** The most bytes the `memory` key may take, measured as compact JSON (`JSON.stringify`). */
/** The event fields a `perUnit` input may take its value from. They exist in EVENT_SHAPE: `thread` is
// `<scheme>-thread:<channel id>:<thread ts>`, so its channel and its ts are the two parts. */
export const PER_UNIT_FIELDS = ["external_id", "thread_channel", "thread_ts"]

export const SIZE_WARN_BYTES = 6144
export const SIZE_MAX_BYTES = 8192

const plain = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
const words = (name) => String(name ?? "").toLowerCase().split(/[._-]+/).filter(Boolean)

/** Why a method or action name is not a read's, or undefined when it is one. */
export function readVerbProblem(name) {
  if (typeof name !== "string" || name.length === 0) return "a read must be named"
  const parts = words(name)
  const joiner = parts.find((word) => JOINERS.includes(word))
  if (joiner !== undefined) return `"${name}" joins two actions with "${joiner}": name the one action it is`
  const writes = parts.filter((word) => WRITE_VERBS.includes(word))
  if (writes.length > 0) return `"${name}" contains the write verb ${writes.join(", ")}`
  if (!parts.some((word) => READ_VERBS.includes(word))) return `"${name}" has no read verb (${READ_VERBS.join(", ")})`
  return undefined
}

/** The size the schema and §9.5 measure: compact JSON of the `memory` key, in bytes. */
export const sizeOf = (memory) => new TextEncoder().encode(JSON.stringify(memory)).length

/** A declaration's problems, one sentence each; none when it keeps the frame. */
export function memoryDeclarationProblems(memory) {
  if (!plain(memory)) return ["the memory key is not an object"]
  const p = []
  const allowed = ["$schema", "version", "namespace", "connector", "sources", "templates"]
  for (const key of Object.keys(memory)) if (!allowed.includes(key)) p.push(`the memory key has "${key}", which schema v2 does not define`)
  if (typeof memory.$schema !== "string" || !memory.$schema.endsWith(MEMORY_SCHEMA)) p.push(`"$schema" must name ${MEMORY_SCHEMA}`)
  if (memory.version !== 2) p.push(`"version" must be 2`)
  const ns = memory.namespace
  if (typeof ns !== "string" || !/^[a-z][a-z0-9]{0,23}$/.test(ns)) p.push(`"namespace" must be a lowercase word of at most 24 characters`)
  else if (RESERVED_NAMESPACES.includes(ns)) p.push(`"namespace" must not be one of ${RESERVED_NAMESPACES.join(", ")}`)

  const connector = memory.connector
  if (connector === undefined) p.push(`the memory key has no "connector"`)
  else p.push(...connectorProblems(connector, typeof ns === "string" ? ns : ""))

  const scopeKeys = connectorScopeKeys(connector)
  const declaredActions = new Set(connectorGrants(connector).map((g) => g.action))
  const suggestGrants = connectorSuggestGrants(connector)
  const sourceIds = []
  const suggestActions = new Set(connectorSuggestGrants(connector).map((grant) => grant.action))
  if (memory.sources !== undefined) {
    if (!Array.isArray(memory.sources)) p.push(`"sources" must be a list`)
    else for (const [i, source] of memory.sources.entries()) {
      p.push(...sourceProblems(source, `sources[${i}]`, scopeKeys, declaredActions, ns, plain(connector) && (connector.identity !== undefined || connector.identityRead !== undefined)))
      if (plain(source) && typeof source.id === "string") sourceIds.push(source.id)
      // §9.1 D: a source's grants are a job's grants, so a suggestBy grant here has entered a job by the back door.
      if (plain(source) && Array.isArray(source.grants)) {
        for (const grant of source.grants) if (plain(grant) && suggestActions.has(grant.action)) p.push(`sources[${i}].grants names ${grant.action}, which is a suggestBy grant: suggestBy runs only at bind, so it is never a job's (§9.1 D)`)
      }
    }
  }
  if (plain(connector) && connector.identityRead !== undefined && Array.isArray(memory.sources) && memory.sources.length > 0) {
    p.push(`"connector.identityRead" is for a connector with no sources (a direct-read-only connector); this one declares sources, so each source carries its identity (§9.2)`)
  }
  if (memory.templates !== undefined) {
    if (!Array.isArray(memory.templates)) p.push(`"templates" must be a list`)
    else {
      if (memory.templates.length > 8) p.push(`"templates" holds ${memory.templates.length}, over 8`)
      for (const [i, template] of memory.templates.entries()) p.push(...templateProblems(template, `templates[${i}]`, sourceIds, ns, readByMethod(connector)))
    }
  }

  const bytes = sizeOf(memory)
  if (bytes > SIZE_MAX_BYTES) p.push(`the memory key is ${bytes} bytes of compact JSON, over the ${SIZE_MAX_BYTES}-byte maximum`)
  else if (bytes > SIZE_WARN_BYTES) p.push(`the memory key is ${bytes} bytes of compact JSON, over the ${SIZE_WARN_BYTES}-byte goal`)
  return p
}

/** `memoryDeclarationProblems`, for a test: throws one error listing every problem. */
export function assertMemoryDeclaration(memory) {
  const problems = memoryDeclarationProblems(memory)
  if (problems.length > 0) throw new Error(`the memory declaration breaks the frame:\n- ${problems.join("\n- ")}`)
}

const GRANT = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/
const ACCOUNT_RESOURCE = /^\{account\}:[A-Za-z0-9._-]{1,200}$/

function grantProblems(grants, where, ns) {
  if (!Array.isArray(grants) || grants.length === 0) return [`"${where}" must be a list of at least one grant`]
  const p = []
  if (grants.length > 8) p.push(`"${where}" holds ${grants.length}, over 8`)
  for (const [i, grant] of grants.entries()) {
    const at = `${where}[${i}]`
    if (!plain(grant) || typeof grant.action !== "string" || typeof grant.resource !== "string") { p.push(`${at} must be { action, resource }`); continue }
    if (!GRANT.test(grant.action)) p.push(`${at}.action "${grant.action}" is not a dotted action name`)
    const verb = readVerbProblem(grant.action)
    if (verb !== undefined) p.push(`${at}: ${verb}`)
    if (ns && !grant.action.startsWith(`${ns}_`) && !grant.action.startsWith(`${ns}.`)) p.push(`${at}.action "${grant.action}" is not in the namespace "${ns}"`)
    if (grant.resource !== "*" && !ACCOUNT_RESOURCE.test(grant.resource)) p.push(`${at}.resource must be "*" or {account}:<operation>`)
    if (grant.resource !== "*") {
      // The operation's last dotted segment is the verb, and it must START with a read verb: an allowlist, so
      // insert, batchModify, watch, quickAdd, emptyTrash and untrash are refused without being listed.
      const segments = grant.resource.slice("{account}:".length).split(".")
      const last = segments[segments.length - 1] ?? ""
      const head = words(last)[0] ?? ""
      const verb = READ_VERBS.find((read) => head.startsWith(read) || last.startsWith(read))
      if (verb === undefined) {
        p.push(`${at}.resource operates "${last}", which does not start with a read verb (${READ_VERBS.join(", ")}): a read never sends, changes or watches`)
      }
    }
  }
  return p
}

function identityProblems(identity, where, ns, { sourceLevel }) {
  const p = []
  const allowed = ["method", "input", "grants", "account", "owner"]
  for (const key of Object.keys(identity)) if (!allowed.includes(key)) p.push(`${where} has "${key}", which schema v2 does not define`)
  const method = identity.method
  // One meaning (§9.2): a source's identity is always the events_list owner-only call; a connector's
  // identityRead is always a tools RPC read method.
  if (sourceLevel) {
    if (method !== "events_list") p.push(`${where}.method must be "events_list": a source's identity is its limit:0 call`)
  } else if (typeof method !== "string" || method === "events_list") {
    p.push(`${where}.method must name the tools RPC read method that answers the account (not events_list; that is a source's identity)`)
  } else {
    const verb = readVerbProblem(method)
    if (verb !== undefined) p.push(`${where}.method: ${verb}`)
  }
  if (identity.input !== undefined && !plain(identity.input)) p.push(`${where}.input must be an object`)
  else if (sourceLevel && method === "events_list") {
    const input = identity.input ?? {}
    const allowed = ["source", "account", "limit"]
    for (const key of Object.keys(input)) if (!allowed.includes(key)) p.push(`${where}.input has "${key}": an events_list identity sends only source, account and limit`)
    if (input.limit !== 0) p.push(`${where}.input.limit must be 0: the identity is the owner-only call, and any other limit reads events`)
  }
  p.push(...grantProblems(identity.grants, `${where}.grants`, ns))
  if (typeof identity.account !== "string" || !identity.account.startsWith("$.")) p.push(`${where}.account must be a JSONPath starting $.`)
  const owner = identity.owner
  if (!plain(owner) || typeof owner.id !== "string" || !owner.id.startsWith("$.") || typeof owner.label !== "string" || !owner.label.startsWith("$.")) {
    p.push(`${where}.owner must be { id, label }, both JSONPaths starting $.`)
  }
  return p
}

function connectorProblems(connector, ns) {
  if (!plain(connector)) return [`"connector" must be an object`]
  const p = []
  const allowed = ["accounts", "identity", "identityRead", "operationScoped", "reads", "scope", "billing", "urlHosts"]
  for (const key of Object.keys(connector)) if (!allowed.includes(key)) p.push(`"connector" has "${key}", which schema v2 does not define`)
  if (connector.accounts !== "single" && connector.accounts !== "multi") p.push(`"connector.accounts" must be "single" or "multi"`)
  if (connector.operationScoped !== undefined && typeof connector.operationScoped !== "boolean") p.push(`"connector.operationScoped" must be true or false`)
  if (connector.identity !== undefined) p.push(...identityProblems(connector.identity, "connector.identity", ns, { sourceLevel: true }))
  if (connector.identityRead !== undefined) {
    p.push(...identityProblems(connector.identityRead, "connector.identityRead", ns, { sourceLevel: false }))
  }

  const scope = connector.scope
  const keys = []
  if (!Array.isArray(scope)) p.push(`"connector.scope" must be a list, empty when none`)
  else for (const [i, entry] of scope.entries()) {
    const at = `connector.scope[${i}]`
    if (!plain(entry)) { p.push(`${at} is not an object`); continue }
    const ok = ["key", "title", "kind", "pattern", "max", "required", "suggest", "suggestBy"]
    for (const key of Object.keys(entry)) if (!ok.includes(key)) p.push(`${at} has "${key}", which schema v2 does not define`)
    if (typeof entry.key !== "string" || !/^[a-z][a-z0-9_]{0,31}$/.test(entry.key)) p.push(`${at}.key must be a lowercase word`)
    else keys.push(entry.key)
    if (entry.kind !== "ids") p.push(`${at}.kind must be "ids"`)
    if (typeof entry.pattern !== "string" || entry.pattern.length > 120) p.push(`${at}.pattern must be a regular expression of at most 120 characters`)
    if (typeof entry.max !== "number" || !Number.isInteger(entry.max) || entry.max < 1 || entry.max > 64) p.push(`${at}.max must be 1 to 64`)
    if (typeof entry.required !== "boolean") p.push(`${at}.required must be true or false`)
    if (entry.suggest !== undefined && typeof entry.suggest !== "boolean") p.push(`${at}.suggest must be true or false`)
    if (entry.suggestBy !== undefined) {
      const s = entry.suggestBy
      if (!plain(s)) p.push(`${at}.suggestBy must be an object`)
      else {
        const verb = readVerbProblem(s.method)
        if (verb !== undefined) p.push(`${at}.suggestBy.method: ${verb}`)
        p.push(...grantProblems(s.grants, `${at}.suggestBy.grants`, ns))
        if (typeof s.ids !== "string" || !s.ids.startsWith("$.")) p.push(`${at}.suggestBy.ids must be a JSONPath starting $.`)
      }
    }
    if (entry.suggest === true && entry.suggestBy === undefined) p.push(`${at} claims suggest: true but declares no suggestBy, so Memory has nothing to call`)
  }

  // §9.1 D: a suggestBy read runs at bind only, so its grants never sit among a job's.
  const suggest = connectorSuggestGrants(connector).map((grant) => grant.action)
  const jobBearing = [connector.identity, connector.identityRead, ...(connector.reads ?? [])]
    .flatMap((block) => (plain(block) && Array.isArray(block.grants) ? block.grants : []))
    .map((grant) => (plain(grant) ? grant.action : ""))
  for (const action of new Set(suggest)) {
    if (jobBearing.includes(action)) p.push(`${action} is a suggestBy grant and also a job-bearing grant: suggestBy runs only at bind, so its grants must not appear in an identity, identityRead or read`)
  }

  if (connector.operationScoped === true) {
    const dotted = connectorGrants(connector).filter((grant) => grant.action.includes("."))
    for (const grant of dotted) {
      if (grant.resource === "*") p.push(`"connector.operationScoped" is true, so ${grant.action} must name {account}:<operation>, not "*"`)
    }
    const missing = dotted.filter((grant) => grant.resource === "*")
    if (dotted.length === 0) p.push(`"connector.operationScoped" is true but no read declares a dotted action with an operation resource`)
    if (missing.length > 0) p.push(`"connector.operationScoped" is true, so every dotted action's grant names its operation`)
  }

  const reads = connector.reads ?? []
  if (!Array.isArray(reads)) p.push(`"connector.reads" must be a list`)
  else {
    if (reads.length > 16) p.push(`"connector.reads" holds ${reads.length}, over 16`)
    for (const [i, read] of reads.entries()) {
      const at = `connector.reads[${i}]`
      if (!plain(read)) { p.push(`${at} is not an object`); continue }
      const ok = ["method", "input", "grants", "scopeInputs", "kinds", "cursor", "billing"]
      for (const key of Object.keys(read)) if (!ok.includes(key)) p.push(`${at} has "${key}", which schema v2 does not define`)
      const verb = readVerbProblem(read.method)
      if (verb !== undefined) p.push(`${at}.method: ${verb}`)
      p.push(...grantProblems(read.grants, `${at}.grants`, ns))
      p.push(...scopeInputProblems(read.scopeInputs, `${at}.scopeInputs`, keys))
      if (read.kinds !== undefined && (!Array.isArray(read.kinds) || read.kinds.length === 0)) p.push(`${at}.kinds must be a non-empty list of event kinds`)
    }
  }
  if (connector.billing !== null && connector.billing !== undefined && !billingShape(connector.billing)) p.push(`"connector.billing" must be null or { unit: "call", note }`)
  // §9.4: the hosts a templated {url} may point at; an undeclared host never renders.
  if (connector.urlHosts !== undefined) {
    if (!Array.isArray(connector.urlHosts)) p.push(`"connector.urlHosts" must be a list of host patterns`)
    else {
      if (connector.urlHosts.length > 8) p.push(`"connector.urlHosts" holds ${connector.urlHosts.length}, over 8`)
      for (const host of connector.urlHosts) {
        const problem = urlHostProblem(host)
        if (problem) p.push(`"connector.urlHosts" has ${JSON.stringify(host)}, which ${problem}`)
      }
    }
  }
  return p
}

function scopeInputProblems(inputs, where, keys) {
  if (inputs === undefined) return [`${where} is missing: a read must declare the inputs that narrow it, or it is unscoped and not grantable`]
  if (!plain(inputs)) return [`${where} must be an object`]
  const p = []
  if (Object.keys(inputs).length === 0) p.push(`${where} is empty: a read with no scope input is unscoped and not grantable`)
  let bound = 0
  const binds = new Set()
  for (const [field, value] of Object.entries(inputs)) {
    if (typeof value === "string") {
      if (!keys.includes(value)) p.push(`${where}.${field} names the scope key "${value}", which connector.scope does not declare`)
      else bound += 1
    } else if (plain(value)) {
      const ok = Object.keys(value).every((k) => k === "perUnit" || k === "bind")
      if (!ok) p.push(`${where}.${field} may hold only perUnit and bind`)
      if (!PER_UNIT_FIELDS.includes(value.perUnit)) p.push(`${where}.${field}.perUnit must be one of ${PER_UNIT_FIELDS.join(", ")} (fields of the event shape)`)
      if (typeof value.bind !== "string" || !keys.includes(value.bind)) p.push(`${where}.${field}: perUnit needs bind to name a declared scope key, so the per-unit id stays inside the confirmed scope`)
      else binds.add(value.bind)
    } else p.push(`${where}.${field} must be a scope key or { perUnit, bind }`)
  }
  // §9.1 C: a thread_ts is meaningless without its channel, so both are perUnit inputs on the same confirmed key.
  const perUnitFields = Object.entries(inputs).filter(([, value]) => plain(value) && typeof value.perUnit === "string")
  const ts = perUnitFields.find(([, value]) => value.perUnit === "thread_ts")
  if (ts) {
    const channel = perUnitFields.find(([, value]) => value.perUnit === "thread_channel" && value.bind === ts[1].bind)
    if (!channel) {
      p.push(`${where}.${ts[0]}: a thread_ts needs a thread_channel input on the same bind, so the thread's channel is pinned to the confirmed scope`)
    } else if (!keys.includes(ts[1].bind)) {
      p.push(`${where}.${ts[0]}: the thread's channel must be pinned to a confirmed scope key, and ${String(ts[1].bind)} is not one`)
    }
  }
  // §9.1 C: a read is pinned by a binding-key input, or by perUnit inputs that all agree on one bind.
  if (binds.size > 1) p.push(`${where} binds per-unit inputs to ${[...binds].join(", ")}: they must all name one scope key`)
  if (bound === 0 && binds.size === 0) p.push(`${where} pins no binding-key input, so the read is not scoped to what the person confirmed`)
  // §9.1 C: external_id names no conversation, so it cannot be a read's only pin.
  if (perUnitFields.length > 0 && perUnitFields.every(([, value]) => value.perUnit === "external_id")) p.push(`${where} is pinned only by external_id, which names no conversation: a read needs a confirmed scope key (§9.1 C)`)
  if (bound > 0 && binds.size > 0 && ![...binds].every((key) => Object.values(inputs).includes(key))) {
    p.push(`${where} pins a per-unit input through an unrelated key: its bind is not one of this read's binding-key inputs`)
  }
  return p
}

function sourceProblems(source, where, scopeKeys, declared, ns, identityByDefault) {
  if (!plain(source)) return [`${where} is not an object`]
  const p = []
  const ok = ["id", "title", "summary", "contract", "kinds", "grants", "identity", "scope", "cadence", "billing", "setupHint"]
  for (const key of Object.keys(source)) {
    if (!ok.includes(key)) p.push(`${where} has "${key}", which schema v2 does not define${key === "setup" ? ' (rename it setupHint)' : ""}`)
  }
  if (typeof source.id !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(source.id)) p.push(`${where}.id must be a lowercase word of at most 40 characters`)
  if (source.contract !== 2) p.push(`${where}.contract must be 2: a declared source needs the owner-only call`)
  if (!Array.isArray(source.kinds) || source.kinds.length === 0) p.push(`${where}.kinds must be a non-empty list of event kinds`)
  p.push(...grantProblems(source.grants, `${where}.grants`, ns))
  const actions = Array.isArray(source.grants) ? source.grants.flatMap((g) => (plain(g) && typeof g.action === "string" ? [g.action] : [])) : []
  const own = new Set(plain(source.identity) && Array.isArray(source.identity.grants)
    ? source.identity.grants.flatMap((grant) => (plain(grant) && typeof grant.action === "string" ? [grant.action] : []))
    : [])
  for (const action of actions) {
    const eventsAction = /_events_list$/.test(action) || /\.events_list$/.test(action)
    if (!eventsAction && !own.has(action) && !declared.has(action)) {
      p.push(`${where}.grants names ${action}, which no read of "connector" and no identity of this source declares`)
    }
  }
  // §9.2: an identity's grants are only what `limit: 0` asserts, and they must be among the source's, because the
  // source's list is what a job's session allows for it.
  for (const action of own) {
    if (!actions.includes(action)) p.push(`${where}.identity grants ${action}, which ${where}.grants does not list: an identity's grants must be among the source's`)
  }
  if (source.identity !== undefined) p.push(...identityProblems(source.identity, `${where}.identity`, "", { sourceLevel: true }))
  else if (!identityByDefault) p.push(`${where} declares no identity and the connector has none`)
  const scope = source.scope ?? []
  if (!Array.isArray(scope)) p.push(`${where}.scope must be a list`)
  else for (const [i, entry] of scope.entries()) {
    if (!plain(entry) || typeof entry.key !== "string") p.push(`${where}.scope[${i}] must be a scope key object`)
    else if (!scopeKeys.includes(entry.key)) p.push(`${where}.scope[${i}] names ${entry.key}, which connector.scope does not declare`)
  }
  const cadence = source.cadence
  if (!plain(cadence) || !Number.isInteger(cadence.everyMinutes) || cadence.everyMinutes < 15) p.push(`${where}.cadence.everyMinutes must be an integer of at least 15`)
  if (source.billing !== null && source.billing !== undefined && !billingShape(source.billing)) p.push(`${where}.billing must be null or { unit: "call", note }`)
  if (source.setupHint !== undefined && (typeof source.setupHint !== "string" || source.setupHint.length > 300)) p.push(`${where}.setupHint must be a string of at most 300 characters`)
  return p
}

const billingShape = (v) => plain(v) && v.unit === "call" && typeof v.note === "string" && v.note.length > 0 && v.note.length <= 200
/** The markup a template's literal line may not carry (§9.4): a comment (a lens marker is one), an image, a link, an HTML tag, a heading or a quote. */
const LINE_MARKUP = [
  [/<!--|-->/, "an HTML comment, or a lens marker"],
  [/!\[/, "an image"],
  [/\]\(/, "a link"],
  [/<\/?[a-z]/i, "an HTML tag"],
  [/^\s*#{1,6}\s/, "a heading"],
  [/^\s*>\s/, "a quote"],
]

/**
 * The multi-label public suffixes a person can register under but not *be*, the
 * hosts anyone can claim, and the measurement and advertising hosts a collected
 * link must never point at. A small embedded list; the registrable-domain rule
 * catches a suffix it misses.
 */
const PUBLIC_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "net.uk", "sch.uk", "ltd.uk", "plc.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au", "co.nz", "net.nz", "org.nz", "govt.nz",
  "co.jp", "ne.jp", "or.jp", "go.jp", "co.kr", "or.kr", "co.in", "net.in", "org.in", "co.za",
  "com.br", "net.br", "org.br", "com.mx", "com.ar", "com.co", "com.pe", "com.ve", "com.uy",
  "com.tr", "com.cn", "com.tw", "com.hk", "com.sg", "com.my", "com.ph", "com.vn", "com.pk",
  "com.ng", "com.sa", "com.eg", "com.ua", "com.pl", "com.es", "com.gr", "com.pt", "com.ro",
  "co.id", "co.il", "co.ke", "co.th", "co.ae", "co.ma", "co.bw", "co.zw", "co.tz", "co.ug",
])
const SHARED_HOSTS = new Set([
  "cloudfront.net", "amazonaws.com", "storage.googleapis.com", "blob.core.windows.net", "web.core.windows.net",
  "herokuapp.com", "vercel.app", "netlify.app", "pages.dev", "workers.dev", "github.io", "githubusercontent.com",
  "gitlab.io", "bitbucket.io", "appspot.com", "firebaseapp.com", "web.app", "azurewebsites.net", "elasticbeanstalk.com",
  "onrender.com", "railway.app", "fly.dev", "deno.dev", "glitch.me", "repl.co", "surge.sh", "ngrok.io", "r2.dev",
  "blogspot.com", "wordpress.com", "wixsite.com", "translate.goog", "ipfs.io", "dweb.link", "bit.ly", "tinyurl.com",
])
const TRACKER_HOSTS = new Set([
  "doubleclick.net", "google-analytics.com", "googletagmanager.com", "googleadservices.com", "googlesyndication.com",
  "2mdn.net", "facebook.net", "scorecardresearch.com", "criteo.com", "taboola.com", "outbrain.com", "adnxs.com",
  "hotjar.com", "segment.io", "mixpanel.com", "amplitude.com", "quantserve.com", "moatads.com", "adsrvr.org",
  "casalemedia.com", "rubiconproject.com", "pubmatic.com", "openx.net", "clarity.ms", "branch.io", "appsflyer.com",
  "adjust.com", "kochava.com", "smartadserver.com", "teads.tv", "yieldmo.com", "bat.bing.com",
])

/**
 * The second-level labels a ccTLD hands out as registry rules (com.de, gov.in,
 * co.uk): a pattern of one of these plus a two-letter code names no site.
 */
const EFFECTIVE_SLD = new Set([
  "com", "co", "gov", "org", "net", "ac", "edu", "ne", "or", "go", "nic", "mil", "sch", "ltd", "plc",
  "gen", "web", "biz", "info", "nom", "res", "idv", "gob", "gouv", "gv", "k12", "muni",
])

/** Why a host pattern is too broad to mean anything, or null (§9.4). */
export function urlHostProblem(host) {
  if (typeof host !== "string" || !/^(?:\*\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(host)) return "is not a host pattern (a domain such as slack.com, or *.slack.com)"
  const bare = host.toLowerCase().replace(/^\*\./, "")
  const labels = bare.split(".")
  if (labels.length < 2) return "names no registrable domain (a host needs at least two labels)"
  // A punycode label hides what the host is: another script, or a lookalike.
  if (labels.some((label) => label.startsWith("xn--"))) return "is a punycode host (a label starting xn--), which hides what it is"
  let suffix = null
  for (const size of [3, 2]) if (labels.length > size && PUBLIC_SUFFIXES.has(labels.slice(-size).join("."))) { suffix = labels.slice(-size).join("."); break }
  if (PUBLIC_SUFFIXES.has(bare)) return `is a public suffix (${bare}), which names no site`
  if (labels.length === 2 && EFFECTIVE_SLD.has(labels[0]) && /^[a-z]{2}$/.test(labels[1])) return `is an effective-TLD rule (${bare}), which names no site`
  if (suffix && bare === suffix) return `is a public suffix (${suffix}), which names no site`
  for (const listed of SHARED_HOSTS) if (bare === listed || bare.endsWith(`.${listed}`)) return `is a shared host (${listed}), which anyone can claim`
  for (const listed of TRACKER_HOSTS) if (bare === listed || bare.endsWith(`.${listed}`)) return `is a tracker (${listed}), which is no source's destination`
  return null
}

/** The characters that turn two placeholders into markup: `!{title}({url})`. */
const MARKUP_NEIGHBOURS = new Set(["!", "[", "]", "(", ")"])

const STAGE_OUTPUTS = ["journal", "timeline", "proposal:decision", "proposal:fact", "proposal:commitment_open", "proposal:commitment_close", "proposal:procedure", "proposal:person", "proposal:link"]
const section = (v) => typeof v === "string" && /^section:[A-Z][A-Za-z0-9 ]{0,39}$/.test(v)

/** The connector's declared reads, by method: what a step's `with` may not touch. */
function readByMethod(connector) {
  const out = new Map()
  if (plain(connector) && Array.isArray(connector.reads)) for (const read of connector.reads) if (plain(read) && typeof read.method === "string") out.set(read.method, read)
  return out
}

function templateProblems(template, where, sourceIds, ns, reads = new Map()) {
  if (!plain(template)) return [`${where} is not an object`]
  const p = []
  const ok = ["id", "title", "summary", "trigger", "extract", "transform", "curate", "outputs", "budget"]
  for (const key of Object.keys(template)) if (!ok.includes(key)) p.push(`${where} has "${key}", which a template does not define`)
  if (typeof template.id !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(template.id)) p.push(`${where}.id must be a lowercase word`)
  if (typeof template.title !== "string" || template.title.length === 0 || template.title.length > 60) p.push(`${where}.title must be 1 to 60 characters`)
  if (typeof template.summary !== "string" || template.summary.length === 0 || template.summary.length > 200) p.push(`${where}.summary must be 1 to 200 characters`)

  const steps = plain(template.extract) && Array.isArray(template.extract.steps) ? template.extract.steps : undefined
  if (!steps || steps.length === 0) p.push(`${where}.extract must be { steps: [...] } with at least one step`)
  else for (const [i, step] of steps.entries()) {
    const at = `${where}.extract.steps[${i}]`
    if (!plain(step)) { p.push(`${at} is not an object`); continue }
    const usedOk = (step.use === "events_list") !== (typeof step.call === "string")
    if (!usedOk) p.push(`${at} needs exactly one of "use" (events_list) and "call"`)
    if (typeof step.call === "string") {
      const verb = readVerbProblem(step.call)
      if (verb !== undefined) p.push(`${at}.call: ${verb}`)
    }
    if (typeof step.connector !== "string" || !/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(step.connector)) p.push(`${at}.connector must be a plugin id such as ${ns}.plugin`)
    if (typeof step.source !== "string" || !sourceIds.includes(step.source)) p.push(`${at}.source must name one of this plugin's declared sources`)
    if (step.for !== undefined && step.for !== "thread" && step.for !== "unit") p.push(`${at}.for must be "thread" or "unit"`)
    if (plain(step.with)) {
      // §9.1 C: the read pins these from the confirmed scope, so a template may not replace one.
      const pinned = new Set(Object.keys(plain(reads.get(step.call)?.scopeInputs) ? reads.get(step.call).scopeInputs : {}))
      for (const key of Object.keys(step.with)) if (pinned.has(key)) p.push(`${at}.with may not set ${key}: the read pins it from the person's confirmed scope (§9.1 C)`)
      for (const value of JSON.stringify(step.with).matchAll(/\{\{([^}]+)\}\}/g)) {
        const ref = value[1].trim()
        if (!/^(account|since|cursor\.[a-z][a-z0-9_]*|scope\.[a-z][a-z0-9_]*)$/.test(ref)) p.push(`${at}.with uses {{${ref}}}: only binding values are allowed, never item text`)
      }
    }
  }
  if (plain(template.transform) && template.transform.into !== "events" && template.transform.into !== "documents") p.push(`${where}.transform.into must be "events" or "documents"`)

  const stages = plain(template.curate) && Array.isArray(template.curate.stages) ? template.curate.stages : undefined
  const stageOutputs = []
  if (!stages || stages.length === 0) p.push(`${where}.curate must be { stages: [...] } with at least one stage`)
  else for (const [i, stage] of stages.entries()) {
    const at = `${where}.curate.stages[${i}]`
    if (!plain(stage)) { p.push(`${at} is not an object`); continue }
    if (!["render", "extract", "synthesize"].includes(stage.engine)) { p.push(`${at}.engine must be render, extract or synthesize`); continue }
    if (stage.engine === "render") {
      if (!section(stage.into) && stage.into !== "journal" && stage.into !== "timeline") p.push(`${at}.into must be journal, timeline or section:<Heading>`)
      if (typeof stage.line !== "string" || stage.line.length === 0 || stage.line.length > 400) p.push(`${at}.line must be 1 to 400 characters`)
      else {
        for (const match of stage.line.matchAll(/\{([^{}]*)\}/g)) {
          const before = match.index > 0 ? stage.line[match.index - 1] : ""
          const after = stage.line[match.index + match[0].length] ?? ""
          for (const [side, neighbour] of [["before", before], ["after", after]]) {
            if (MARKUP_NEIGHBOURS.has(neighbour)) p.push(`${at}.line: the placeholder ${match[0]} sits next to "${neighbour}" (${side} it), which makes markup. Put a space between them`)
          }
        }
        const literal = stage.line.replace(/\{[^{}]*\}/g, " ")
        const markup = LINE_MARKUP.find(([pattern]) => pattern.test(literal))
        if (markup) p.push(`${at}.line carries markup: ${markup[1]}. A line is text; the block's markers are Memory's`)
      }
      if (!Number.isInteger(stage.max) || stage.max < 1 || stage.max > 50) p.push(`${at}.max must be 1 to 50`)
      if (stage.heading !== undefined && (typeof stage.heading !== "string" || stage.heading.length > 60)) p.push(`${at}.heading must be at most 60 characters`)
      stageOutputs.push(section(stage.into) ? stage.into : stage.into)
    }
    if (stage.engine === "extract") {
      if (!Array.isArray(stage.outputs) || stage.outputs.length === 0) p.push(`${at}.outputs must be a non-empty list`)
      else for (const out of stage.outputs) {
        if (out === "journal" || out === "timeline" || section(out) || STAGE_OUTPUTS.includes(out)) stageOutputs.push(out)
        else p.push(`${at}.outputs names ${out}, which is not an output kind`)
      }
      if (stage.hints !== undefined && (typeof stage.hints !== "string" || stage.hints.length > 1500)) p.push(`${at}.hints must be at most 1500 characters`)
    }
    if (stage.engine === "synthesize") {
      if (!section(stage.into)) p.push(`${at}.into must be section:<Heading>`)
      if (!Number.isInteger(stage.max) || stage.max < 1 || stage.max > 50) p.push(`${at}.max must be 1 to 50`)
      stageOutputs.push(stage.into)
    }
    if (plain(stage.select) && Array.isArray(stage.select.sources)) {
      for (const s of stage.select.sources) if (!sourceIds.includes(s)) p.push(`${at}.select.sources names ${s}, which is not one of this plugin's sources`)
    }
  }

  const outputs = template.outputs
  if (!Array.isArray(outputs) || outputs.length === 0) p.push(`${where}.outputs must be a non-empty list`)
  else {
    for (const out of outputs) if (!STAGE_OUTPUTS.includes(out) && !section(out) && out !== "journal" && out !== "timeline") p.push(`${where}.outputs names ${out}, which is not an output kind`)
    // §9.4: a template's outputs must cover every stage's.
    for (const out of new Set(stageOutputs)) if (!outputs.includes(out)) p.push(`${where}.outputs must include ${out}, which a stage writes`)
  }
  if (plain(template.budget) && template.budget.tokensPerRun !== undefined) {
    const t = template.budget.tokensPerRun
    if (!Number.isInteger(t) || t < 1000 || t > 25000) p.push(`${where}.budget.tokensPerRun must be 1000 to 25000`)
  }
  return p
}

function connectorSuggestGrants(connector) {
  if (!plain(connector) || !Array.isArray(connector.scope)) return []
  return connector.scope.flatMap((key) => (plain(key) && plain(key.suggestBy) && Array.isArray(key.suggestBy.grants) ? key.suggestBy.grants : []))
}

function connectorGrants(connector) {
  if (!plain(connector)) return []
  const all = []
  for (const block of [connector.identity, connector.identityRead]) if (plain(block) && Array.isArray(block.grants)) all.push(...block.grants)
  if (Array.isArray(connector.reads)) for (const read of connector.reads) if (plain(read) && Array.isArray(read.grants)) all.push(...read.grants)
  return all.filter((g) => plain(g) && typeof g.action === "string" && typeof g.resource === "string")
}

function connectorScopeKeys(connector) {
  if (!plain(connector) || !Array.isArray(connector.scope)) return []
  return connector.scope.filter((e) => plain(e) && typeof e.key === "string").map((e) => e.key)
}

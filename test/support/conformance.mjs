// Tier 1's fixture half: a recording permission context and the `events_list` contract check, ported from the two
// pilots so a plugin does not write them again (Memory Jobs design §9.6, §10 §5).
//
//   const session = recordingSession(source.grants, tools, actionOf)
//   await eventsListConformance({ list, declared }, fixtures)
//
// No dependencies, no network. A fixture answers, and the recording session refuses any action the declaration does
// not hold, so a read that asserts more than its grants fails here rather than in Memory's collector.

/** A permission action and its resource, as a declaration writes them. */
const key = (action, resource) => `${action}\u0000${resource}`

/**
 * A session whose rules are exactly `grants`. `tool.list()` answers the fixture's tools; each call records the actions
 * the fixture asserts through `permission.assert`. An action outside the grants is refused the way OpenCode refuses one
 * (`Tool.Error` shape) and listed in `undeclared`.
 */
export function recordingSession(grants, tools, actionOf = (id) => id) {
  const held = new Set(grants.map((grant) => key(grant.action, grant.resource)))
  const asserted = new Set()
  const assertions = []
  const calls = []
  const undeclared = []
  const permission = {
    async assert(input) {
      const resources = input.resources ?? ["*"]
      for (const resource of resources) {
        assertions.push({ action: input.action, resources })
        const ok = [...held].some((entry) => {
          const [action, allowed] = entry.split("\u0000")
          const hit = sameResource(allowed, resource) && wildcard(action, input.action)
          if (hit) asserted.add(entry)
          return hit
        })
        if (!ok) {
          undeclared.push(input.action)
          throw Object.assign(new Error(`${input.action} needs a grant this declaration does not hold`), { _tag: "Tool.Error" })
        }
      }
    },
  }
  const list = async () =>
    tools.map((tool) => ({
      id: tool.id,
      execute: async (input, context) => {
        calls.push(tool.id)
        return await tool.execute(input, { ...context, permission })
      },
    }))
  /**
   * The grants the fixture never asserted: declared but unused, so the declaration over-grants. A declared resource
   * with `{account}` matches the concrete account the fixture asserted, and every resource of a call counts.
   */
  const unused = () => grants.filter((grant) => !assertionMatches(assertions, grant))
  return { assertions, calls, undeclared, unused, permission, tool: { list }, actionOf }
}

/** True when some assertion is the grant's action on one of its resources, with `{account}` bound to any account. */
export function assertionMatches(assertions, grant) {
  return assertions.some((assertion) => assertion.action === grant.action
    && (assertion.resources ?? ["*"]).some((resource) => sameResource(grant.resource, resource)))
}

/** `{account}` is a wildcard for the account a call names; everything else must match exactly, or by `*`. */
export function sameResource(declared, asserted) {
  if (declared === asserted || declared === "*") return true
  if (String(declared).startsWith("{account}:")) {
    return wildcard(String(declared).slice("{account}:".length), String(asserted).replace(/^[^:]*:/, ""))
  }
  return wildcard(String(declared), String(asserted))
}

const wildcard = (pattern, value) => {
  const expression = String(pattern).replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*").replaceAll("?", ".")
  return new RegExp(`^${expression}$`).test(String(value))
}

const EVENT_KINDS = ["message", "meeting", "session", "bookmark", "issue", "pr", "commit", "doc", "event"]
const isPlain = (value) => typeof value === "object" && value !== null && !Array.isArray(value)
const iso = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value))

/**
 * `events_list` against contract 2. `list(input) → answer`, and `declared` is the source's declaration
 * (`{ id, kinds, scope }`). `fixtures` is a list of `{ input, expect }` cases; `expect` is `"events"`, `"empty"` or
 * `{ refuses: /message/ }`. Answers are checked for shape, the owner, the scope echo, `setup`, `more`, `cursor`,
 * `trust`, `gap` and each event's fields.
 */
export async function eventsListConformance({ list, declared, grants, assertions }, fixtures = []) {
  const problems = []
  const check = (answer, where) => {
    if (!isPlain(answer)) { problems.push(`${where}: the answer is not an object`); return }
    if (answer.source !== declared.id) problems.push(`${where}: source is ${JSON.stringify(answer.source)}, not ${declared.id}`)
    if (typeof answer.account !== "string" || answer.account.length === 0) problems.push(`${where}: account is missing`)
    if (!isPlain(answer.owner) || typeof answer.owner.id !== "string" || typeof answer.owner.label !== "string") {
      problems.push(`${where}: owner must be { id, label }`)
    }
    if (!isPlain(answer.scope)) problems.push(`${where}: scope must be an object, {{}} for the whole source`)
    if (typeof answer.setup !== "string") problems.push(`${where}: setup must be a string, empty when nothing is missing`)
    if (answer.trust !== "untrusted") problems.push(`${where}: trust must be "untrusted"`)
    if (typeof answer.more !== "boolean") problems.push(`${where}: more must be true or false`)
    if (typeof answer.cursor !== "string" || answer.cursor.length > 1024) problems.push(`${where}: cursor must be a string of at most 1024 characters`)
    if (answer.gap !== undefined) {
      const gap = answer.gap
      if (!isPlain(gap) || !["sync-token-expired", "cursor-invalid", "window-truncated"].includes(gap.reason)) {
        problems.push(`${where}: gap.reason must be sync-token-expired, cursor-invalid or window-truncated`)
      } else if (!iso(gap.since) || (gap.until !== undefined && !iso(gap.until))) problems.push(`${where}: gap.since and gap.until must be ISO 8601`)
      else if (gap.until !== undefined && Date.parse(gap.since) > Date.parse(gap.until)) problems.push(`${where}: gap.since is after gap.until`)
    }
    const events = Array.isArray(answer.events) ? answer.events : undefined
    if (!events) { problems.push(`${where}: events must be a list`); return }
    if (answer.more !== true && events.length === 0 && answer.cursor === "") problems.push(`${where}: an empty page must still carry a cursor`)
    for (const event of events) {
      if (event.source !== answer.source) problems.push(`${where}: an event names another source`)
      if (event.account !== answer.account) problems.push(`${where}: an event names another account`)
      if (typeof event.external_id !== "string" || event.external_id.length === 0 || event.external_id.length > 512) problems.push(`${where}: an event's external_id must be 1 to 512 characters`)
      if (!EVENT_KINDS.includes(event.kind)) problems.push(`${where}: an event's kind is not one of ${EVENT_KINDS.join(", ")}`)
      if (Array.isArray(declared.kinds) && !declared.kinds.includes(event.kind)) problems.push(`${where}: the event kind ${event.kind} is not among the declared kinds`)
      if (!iso(event.occurred_at)) problems.push(`${where}: occurred_at must be ISO 8601`)
      if (event.thread !== null && typeof event.thread !== "string") problems.push(`${where}: thread must be a string or null`)
      if (!Array.isArray(event.actors) || event.actors.length > 20) problems.push(`${where}: actors must be a list of at most 20`)
      if (typeof event.title !== "string" || event.title.length > 300) problems.push(`${where}: title must be at most 300 characters`)
      if (typeof event.text !== "string" || event.text.length > 4096) problems.push(`${where}: text must be at most 4096 characters`)
      if (event.url !== null && !/^https:\/\//.test(String(event.url))) problems.push(`${where}: url must be https or null`)
      if (!Array.isArray(event.labels) || event.labels.length > 20) problems.push(`${where}: labels must be a list of at most 20`)
      if (typeof event.hash !== "string" || !/^sha256:[0-9a-f]{64}$/.test(event.hash)) problems.push(`${where}: hash must be sha256:<hex>`)
    }
  }

  // Contract 2's owner-only call: the identity, and no event read.
  const ownerOnly = await list({ limit: 0 }).catch((error) => ({ error }))
  if (ownerOnly?.error) problems.push(`the owner-only call (limit: 0) failed: ${ownerOnly.error.message ?? ownerOnly.error}`)
  else {
    check(ownerOnly, "the owner-only call")
    if (Array.isArray(ownerOnly.events) && ownerOnly.events.length > 0) problems.push("the owner-only call listed events; it must read none")
  }

  for (const fixture of fixtures) {
    const where = `events_list(${JSON.stringify(fixture.input).slice(0, 80)})`
    const answer = await list(fixture.input).catch((error) => ({ error }))
    if (fixture.expect?.refuses) {
      if (!answer?.error) problems.push(`${where}: it must be refused`)
      else if (!fixture.expect.refuses.test(String(answer.error.message ?? answer.error))) problems.push(`${where}: refused with ${String(answer.error.message ?? answer.error).slice(0, 120)}, not the expected reason`)
      continue
    }
    if (answer?.error) { problems.push(`${where}: failed: ${answer.error.message ?? answer.error}`); continue }
    check(answer, where)
    if (fixture.expect === "empty" && answer.events.length !== 0) problems.push(`${where}: it must list nothing`)
    if (fixture.input?.scope && JSON.stringify(answer.scope) !== JSON.stringify(fixture.input.scope)) {
      problems.push(`${where}: the answer's scope must echo the call's scope`)
    }
  }
  // "Exactly what it asserts", after every call: a declared grant no call asserted is over-granting. The assertion
  // list covers the owner-only call and every fixture call; `{account}` is bound, and every resource counts.
  if (Array.isArray(grants) && Array.isArray(assertions)) {
    for (const grant of grants) {
      if (!assertionMatches(assertions, grant)) {
        problems.push(`the declaration grants ${grant.action} on ${grant.resource}, which no call asserts: a source's grants are exactly what it asserts`)
      }
    }
  }
  return problems
}

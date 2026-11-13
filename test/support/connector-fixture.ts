// What the published kit leaves to the plugin (Memory Jobs design §9.6, Tier 1's third part): the identity a source's
// declaration promises, and the `suggestBy` a scope key offers at bind. The kit's own `conformance.mjs` covers the rest
// (the recording session, `events_list`, and a read that asserts more than its grants).
//
// Not the kit: `test/support/memory-kit.mjs`, `conformance.mjs`, `schema-check.mjs` and `memory-plugin.v2.json` are
// Memory's published files, vendored byte for byte and hash-pinned. This module is the small harness around them, and it
// never contacts Slack, Memory or the network.
// @ts-expect-error Memory's published kit is plain JavaScript, vendored byte for byte (no allowJs here).
import { memoryDeclarationProblems } from "./memory-kit.mjs"
// @ts-expect-error its fixture half is published the same way.
import { eventsListConformance, recordingSession } from "./conformance.mjs"

/** The manifest's objects, loosely: the kit owns the schema, this harness only reads what it must run. */
type Json = Record<string, unknown>
const record = (value: unknown): Json => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : {})
const array = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : [])

/** A permission action and its resource, as the declaration writes them. */
export interface Grant {
  readonly action: string
  readonly resource: string
}

/** One executor a fixture serves, as OpenCode lists it. */
export interface FixtureTool {
  readonly id: string
  execute(input: Record<string, unknown>, context: unknown): Promise<unknown>
}

/** A `$.a.b` or `$.items[*].id` path's first value in `value`, or undefined. */
export function pathValue(value: unknown, path: unknown): unknown {
  if (typeof path !== "string" || !path.startsWith("$.")) return undefined
  let current: unknown = value
  for (const raw of path.slice(2).split(".")) {
    const part = raw.replace(/\[\*\]$/, "")
    const many = raw.endsWith("[*]")
    if (!record(current) && !Array.isArray(current)) return undefined
    current = Array.isArray(current) ? current.map((entry) => record(entry)[part]) : record(current)[part]
    if (many && Array.isArray(current)) current = current[0]
  }
  return current
}

/** A declaration's connector. */
export const connectorOf = (declaration: unknown): Json => record(record(declaration)["connector"])

/**
 * The parts an event's `thread` names: a stable key `<scheme>-thread:<channel id>:<thread ts>`, which is where contract
 * 2's `thread_channel` and `thread_ts` per-unit fields come from. Never from the event's `text`.
 */
export function threadParts(event: { thread?: string | null }): { channel?: string; ts?: string } {
  const parts = /^[a-z][a-z0-9+.-]*-thread:([^:]+):(.+)$/.exec(event.thread ?? "")
  return parts === null ? {} : { channel: parts[1]!, ts: parts[2]! }
}

/** A declared per-unit field's value for an event, from the event's structured fields only. */
export function perUnitValue(event: { thread?: string | null; external_id?: string }, field: string): string | undefined {
  const parts = threadParts(event)
  return field === "thread_channel" ? parts.channel : field === "thread_ts" ? parts.ts : field === "external_id" ? event.external_id : undefined
}

/**
 * Whether a unit may be read at all (§9.1 C): a per-unit input takes its value from the event's structured fields, and
 * the **unit's own channel** (`thread_channel`) must be inside the confirmed ids of the scope key its `bind` names. The
 * check runs before the call, so a thread in a channel the person never confirmed is refused, and a unit with no thread
 * is refused rather than falling back to the confirmed list.
 */
export function unitInScope(
  event: { thread?: string | null; external_id?: string },
  inputs: Readonly<Record<string, unknown>>,
  confirmed: readonly string[],
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  const channel = threadParts(event).channel
  for (const [input, spec] of Object.entries(inputs)) {
    if (typeof spec !== "object" || spec === null) continue
    const perUnit = record(spec)["perUnit"]
    const bind = record(spec)["bind"]
    if (typeof perUnit !== "string" || typeof bind !== "string") continue
    if (perUnitValue(event, perUnit) === undefined) return { ok: false, reason: `the unit names no ${perUnit} for ${input}` }
    if (channel === undefined) return { ok: false, reason: `the unit names no thread_channel, so ${input} cannot be bound to ${bind}` }
    if (!confirmed.includes(channel)) return { ok: false, reason: `${input} takes ${perUnit}, but the unit's thread_channel ${channel} is not among the confirmed ${bind}` }
  }
  return { ok: true }
}

/** The identity a source uses: its own, else the connector's (§9.2: identity is per source). */
export function identityFor(declaration: unknown, sourceId: string | undefined): Json {
  const source = array(record(declaration)["sources"]).map(record).find((entry) => entry["id"] === sourceId)
  if (source !== undefined && record(source["identity"])["method"] !== undefined) return record(source["identity"])
  return record(connectorOf(declaration)["identity"])
}

/** The grants a running job gets (§9.1 D): its identity's and each declared read's, never `suggestBy`'s. */
export function jobGrants(connector: Json): Grant[] {
  const grants: unknown[] = []
  for (const block of [connector["identity"], connector["identityRead"]]) if (record(block)["grants"] !== undefined) grants.push(...array(record(block)["grants"]))
  for (const read of array(connector["reads"])) grants.push(...array(record(read)["grants"]))
  return asGrants(grants)
}

/** A source's grants: what its `events_list` and its inner reads assert. */
export const sourceGrants = (source: Json): Grant[] => asGrants(array(source["grants"]))

const asGrants = (grants: readonly unknown[]): Grant[] =>
  grants.flatMap((grant) => {
    const g = record(grant)
    return typeof g["action"] === "string" && typeof g["resource"] === "string" ? [{ action: g["action"], resource: g["resource"] }] : []
  })



/** What a fixture's executor answers, as the plugin's own `Read` does. */
export type KitRead = (tool: string, input: Record<string, unknown>) => Promise<{ readonly output?: unknown; readonly text: string }>

/** A call the conformance runs: its input, and what it must do. */
export interface ListFixture {
  readonly input: { readonly limit?: number; readonly cursor?: string; readonly since?: string; readonly scope?: Record<string, string[]> }
  readonly expect?: "events" | "empty" | { readonly refuses: RegExp }
}

/**
 * Every way the manifest breaks what the kit cannot see alone, one sentence each; none when it keeps it.
 *
 * `list` builds the source's `events_list` around the harness's read, so every inner read asserts its action through
 * the recording session (exactly the declared grants). The harness also asserts the source's own `events_list` action,
 * as the tool does, so the kit's unused-grant check sees the whole set. `identityAnswer` and `suggestSamples` then cover
 * the two things the kit leaves to the plugin.
 */
export async function declarationFixtureProblems(input: {
  readonly declaration: unknown
  readonly sourceId: string
  readonly tools: readonly FixtureTool[]
  readonly actionOf?: (id: string) => string
  readonly executorIdOf?: (method: string) => string
  readonly list?: (read: KitRead) => (call: ListFixture["input"]) => Promise<unknown>
  readonly fixtures?: readonly ListFixture[]
  readonly suggestSamples?: Readonly<Record<string, Record<string, unknown>>>
  readonly identityAnswer?: () => Promise<unknown>
}): Promise<string[]> {
  const problems = memoryDeclarationProblems(input.declaration) as string[]
  const connector = connectorOf(input.declaration)
  const source = array(record(input.declaration)["sources"]).map(record).find((entry) => entry["id"] === input.sourceId) ?? {}
  // The probe session of §9.3: the job's grants plus each scope key's `suggestBy`, which runs only at bind.
  const suggest = array(connector["scope"]).flatMap((key) => asGrants(array(record(record(key)["suggestBy"])["grants"])))
  const grants = [...jobGrants(connector), ...sourceGrants(source), ...suggest]
  const actionOf = input.actionOf ?? ((id: string) => id)
  const executorIdOf = input.executorIdOf ?? ((method: string) => method)
  // The kit's own session for the rules and the recording (`tool.list()` returns no result, so the harness calls the
  // fixture directly and makes the same `permission.assert` calls OpenCode's executor makes for an MCP tool).
  const session = recordingSession(grants, input.tools, actionOf) as {
    permission: { assert: (input: { action: string; resources: string[] }) => Promise<void> }
    tool: { list: () => Promise<readonly FixtureTool[]> }
    assertions: { action: string; resources: readonly string[] }[]
    undeclared: string[]
  }
  const executors = input.tools
  // One argument: the action, and the wildcard resource an MCP tool asserts.
  const assert = async (method: string) => {
    const check = { action: actionOf(executorIdOf(method)), resources: ["*"] }
    await session.permission.assert(check)
  }

  if (input.list !== undefined) {
    const build = input.list
    const read: KitRead = async (tool, call) => {
      const executor = executors.find((entry) => entry.id === executorIdOf(tool))
      if (executor === undefined) throw new Error(`the fixture has no ${tool}`)
      await assert(tool)
      const result = (await executor.execute(call, {})) as { content?: unknown; output?: unknown }
      const text = typeof result.content === "string" ? result.content : Array.isArray(result.content) ? (result.content as { type?: string; text?: string }[]).flatMap((part) => (part.type === "text" && part.text !== undefined ? [part.text] : [])).join("\n") : ""
      return result.output === undefined ? { text } : { output: result.output, text }
    }
    const list = build(read)
    const own = sourceGrants(source).find((grant) => /_events_list$/.test(grant.action))?.action
    const run = async (call: ListFixture["input"]) => {
      if (own !== undefined) {
        const check = { action: own, resources: ["*"] }
        await session.permission.assert(check)
      }
      return list(call)
    }
    // The kit checks for unused grants on entry, before its own calls, so the session is warmed with one owner-only
    // call and one listing first: every action the source declares is then asserted by the time it looks.
    for (const warm of [{ limit: 0 }, { since: new Date(Date.now() - 86_400_000).toISOString(), scope: {} }]) {
      try {
        await run(warm)
      } catch (error) {
        problems.push(`events_list refused a warm-up call: ${error instanceof Error ? error.message.split("\n", 1)[0] : String(error)}`)
      }
    }
    problems.push(
      ...((await eventsListConformance(
        { list: run, declared: { id: source["id"], kinds: source["kinds"], scope: source["scope"] }, grants: sourceGrants(source), assertions: session.assertions },
        input.fixtures ?? [],
      )) as string[]).map((problem) => `events_list: ${problem}`),
    )
  }

  const identity = identityFor(input.declaration, input.sourceId)
  if (input.identityAnswer !== undefined) {
    const answer = await input.identityAnswer()
    if (typeof pathValue(answer, identity["account"]) !== "string") problems.push(`the identity's account path ${String(identity["account"])} finds nothing in the owner-only answer`)
    const owner = record(identity["owner"])
    if (pathValue(answer, owner["id"]) === undefined || pathValue(answer, owner["label"]) === undefined) problems.push("the identity's owner paths find nothing in the owner-only answer")
  }

  for (const key of array(connector["scope"])) {
    const entry = record(key)
    const suggest = record(entry["suggestBy"])
    if (suggest["method"] === undefined) continue
    const method = String(suggest["method"])
    const executor = executors.find((tool) => tool.id === executorIdOf(method))
    if (executor === undefined) {
      problems.push(`suggestBy for ${String(entry["key"])} (${method}) has no executor in the fixture`)
      continue
    }
    await assert(method)
    const answer = (await executor.execute(input.suggestSamples?.[String(entry["key"])] ?? {}, {})) as { output?: unknown }
    const ids = pathValue(answer.output, suggest["ids"])
    if (ids === undefined || ids === null || ids === "") problems.push(`suggestBy for ${String(entry["key"])} answered nothing at ${String(suggest["ids"])}`)
  }

  for (const action of new Set(session.undeclared)) problems.push(`a read asserted ${action}, which the declaration does not grant`)
  return problems
}

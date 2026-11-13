// Memory's connector pattern, revision 4 (Memory Jobs design §9 and §10), against this plugin's own declaration and
// its shaped fixture: the vendored kit's static frame (schema v2, verbs, identity, scopes, templates, size), and the
// fixture half the kit cannot run alone — every declared read in a session whose rules are exactly its grants, a
// recording permission context that fails on any undeclared action, the identity answer, `events_list` conformance and
// `suggestBy`. Nothing here contacts Slack, Memory or the network: `test/fixtures/fake-slack-shaped.ts` answers.
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { EVENTS_ACTION, scopeChannels, slackEvents, SCOPE_KEYS, setupLine, type Read } from "../../src/events.js"
import { gapProblems, GAP_MAX_DAYS, resultProblems } from "../../src/host/events-list.js"
import { KNOWN_TOOLS, READ_TOOLS } from "../../src/tools.js"
// @ts-expect-error the kit is Memory's published plain JavaScript (no allowJs here), vendored byte for byte.
import { assertMemoryDeclaration, memoryDeclarationProblems, readVerbProblem, sizeOf, SIZE_WARN_BYTES, WRITE_VERBS } from "../support/memory-kit.mjs"
// @ts-expect-error its schema checker is published the same way.
import { schemaProblems } from "../support/schema-check.mjs"
import { declarationFixtureProblems, identityFor, jobGrants, pathValue, type FixtureTool, type KitRead } from "../support/connector-fixture.js"
import schema from "../support/memory-plugin.v2.json" with { type: "json" }
import { createAnswers, SEED, tsOfOffset } from "../fixtures/fake-slack-shaped.js"

const ROOT = fileURLToPath(new URL("../..", import.meta.url))
const declaration = (): Record<string, unknown> => (JSON.parse(readFileSync(`${ROOT}/package.json`, "utf8")) as { memory: Record<string, unknown> }).memory

const NOW = Date.parse("2026-11-08T12:00:00Z") / 1000
const SINCE = "2026-10-31T00:00:00Z"
const PROJECT = "C0PILOT001"
const DM = "D0PILOT002"
const OTHER = "C0PILOT003"
const OWNER = { id: `slack:${SEED.owner.id}`, label: SEED.owner.name }
/** The fixture's answers, counted back from this suite's clock. */
const answers = createAnswers(NOW)
/** OpenCode lists an MCP tool as `<server>_<tool>`, which is also the action it asserts. */
const executorId = (method: string) => `slack_${method}`
const OPTION = [PROJECT, DM]

const fixtureTools = (): FixtureTool[] =>
  ["slack_read_user_profile", "slack_read_channel", "slack_read_thread", "slack_list_user_channels"].map((tool) => ({
    id: `slack_${tool}`,
    execute: async (input: Record<string, unknown>) => {
      const answer = answers(tool, input)
      return { output: answer, content: [{ type: "text", text: JSON.stringify(answer) }] }
    },
  }))

/** The events_list the declaration describes, over the fixture: the plugin option, then the call's scope. */
const eventsList = (read: KitRead) => (input: { limit?: number; cursor?: string; since?: string; scope?: Record<string, string[]> }) => slackEvents(read as Read, OPTION, input, NOW)


/** The fixture half: the published conformance over the shaped Slack server, plus identity and suggestBy. */
const fixtureProblems = (overrides: Record<string, unknown> = {}) =>
  declarationFixtureProblems({
    declaration: declaration(),
    sourceId: "slack",
    tools: fixtureTools(),
    // An MCP executor's id is the action OpenCode asserts, so only the method-to-id mapping is needed.
    executorIdOf: executorId,
    list: eventsList,
    fixtures: [
      { input: { since: SINCE, scope: { channels: OPTION } }, expect: "events" },
      { input: { since: "2999-01-01T00:00:00Z", scope: { channels: OPTION } }, expect: "empty" },
      { input: { cursor: "not-a-cursor" }, expect: { refuses: /CURSOR_INVALID/ } },
    ],
    suggestSamples: { channels: { types: "public_channel,private_channel,im,mpim", limit: 200 } },
    identityAnswer: () => slackEvents(async (tool, input) => ({ output: answers(tool, input), text: "" }), [], { limit: 0 }, NOW),
    ...overrides,
  })

const source = () => ((declaration()["sources"] as Record<string, unknown>[])[0]!)
const connector = () => declaration()["connector"] as Record<string, unknown>
const scopeOf = () => connector()["scope"] as Record<string, unknown>[]

describe("the memory declaration", () => {
  test("passes the published kit, the schema and §9.5's size goal", () => {
    expect(schemaProblems(schema, declaration())).toEqual([])
    expect(memoryDeclarationProblems(declaration())).toEqual([])
    assertMemoryDeclaration(declaration())
    expect(sizeOf(declaration())).toBeLessThanOrEqual(SIZE_WARN_BYTES)
    expect(sizeOf(declaration())).toBe(3_856)
  })

  test("declares only read verbs in this plugin's namespace", () => {
    for (const grant of [...jobGrants(connector()), ...((scopeOf()[0]!["suggestBy"] as { grants: { action: string; resource: string }[] }).grants)]) {
      expect({ action: grant.action, problem: readVerbProblem(grant.action) }).toEqual({ action: grant.action, problem: undefined })
      expect(grant.resource).toBe("*")
      expect(grant.action.startsWith("slack_")).toBe(true)
    }
    // The frame still refuses what it must, so the clean result above means something.
    for (const verb of ["send", "create", "delete", "schedule", "upload", "react"]) expect(readVerbProblem(`slack_slack_${verb}_message`)).toContain("write verb")
    expect(WRITE_VERBS).toContain("send")
    expect(readVerbProblem("slack_fetch_messages")).toContain("no read verb")
    const broken = structuredClone(declaration())
    ;((broken["connector"] as Record<string, unknown>)["identity"] as Record<string, unknown>)["grants"] = [{ action: "slack_slack_send_message", resource: "*" }]
    expect(memoryDeclarationProblems(broken)).toContainEqual(expect.stringContaining("contains the write verb"))
  })

  test("the thread read is per unit, bound to a confirmed channel, and the thread ts is not a scope key", () => {
    const thread = (connector()["reads"] as Record<string, unknown>[]).find((read) => read["method"] === "slack_read_thread")
    expect(thread).toBeDefined()
    // The published schema's perUnit enum names the event's fields: a thread's channel and ts are the two parts.
    expect(thread!["scopeInputs"]).toEqual({ channel_id: "channels", message_ts: { perUnit: "thread_ts", bind: "channels" } })
    expect(thread!["grants"]).toEqual([{ action: "slack_slack_read_thread", resource: "*" }])
    // Revision 4: the thread ts is per unit, so the connector offers only the channels for confirmation.
    expect(scopeOf().map((entry) => entry["key"])).toEqual(["channels"])
    // The fast path's narrowing is the channels the person confirms.
    expect((source()["scope"] as Record<string, unknown>[]).map((entry) => entry["key"])).toEqual(["channels"])
  })

  test("the channels key suggests at bind only, through a declared read", () => {
    const channels = scopeOf().find((entry) => entry["key"] === "channels")!
    expect(channels["suggest"]).toBe(true)
    expect(channels["suggestBy"]).toEqual({
      method: "slack_list_user_channels",
      input: { types: ["public_channel", "private_channel", "im", "mpim"], limit: 200 },
      grants: [{ action: "slack_slack_list_user_channels", resource: "*" }],
      ids: "$.channels[*].id",
      labels: "$.channels[*].name",
    })
    // A key that claims suggest: true with nothing to call is refused.
    const broken = structuredClone(declaration())
    const key = ((broken["connector"] as Record<string, unknown>)["scope"] as Record<string, unknown>[])[0]!
    delete key["suggestBy"]
    expect(memoryDeclarationProblems(broken)).toContainEqual(expect.stringContaining("declares no suggestBy"))
  })

  test("declares every read as a real read method of the tools RPC", () => {
    const declared = (connector()["reads"] as { method: string }[]).map((read) => read.method)
    expect(declared.length).toBeGreaterThan(0)
    for (const method of declared) expect({ method, read: READ_TOOLS.includes(method) }).toEqual({ method, read: true })
    // The identity is events_list, the plugin-owned read method, called as contract 2's owner-only call.
    expect((connector()["identity"] as Record<string, unknown>)["method"]).toBe("events_list")
    expect((connector()["identity"] as Record<string, unknown>)["input"]).toEqual({ limit: 0 })
    expect(EVENTS_ACTION).toBe("slack_events_list")
    expect(readVerbProblem(EVENTS_ACTION)).toBeUndefined()
    for (const tool of Object.keys(KNOWN_TOOLS)) if (KNOWN_TOOLS[tool] === "write") expect(readVerbProblem(`slack_${tool}`)).toBeDefined()
    // §9.1 D: suggestBy is not part of a running job's grants, only of the bind-time probe session's.
    expect(jobGrants(connector()).map((grant) => grant.action)).not.toContain("slack_slack_list_user_channels")
    expect(JSON.stringify(declaration())).toContain("slack_slack_list_user_channels")
  })

  test("the source declares contract 2, its grants, and setupHint rather than setup", () => {
    expect(source()["contract"]).toBe(2)
    expect(source()["kinds"]).toEqual(["message"])
    expect(source()["grants"]).toEqual([
      { action: "slack_events_list", resource: "*" },
      { action: "slack_slack_read_user_profile", resource: "*" },
      { action: "slack_slack_read_channel", resource: "*" },
    ])
    expect((source()["cadence"] as Record<string, unknown>)["everyMinutes"]).toBeGreaterThanOrEqual(15)
    expect(source()["setup"]).toBeUndefined()
    expect(String(source()["setupHint"]).length).toBeLessThanOrEqual(300)
    // Revision 4's rename is enforced, so the assertion above is not vacuous.
    const broken = structuredClone(declaration())
    const first = (broken["sources"] as Record<string, unknown>[])[0]!
    first["setup"] = first["setupHint"]
    delete first["setupHint"]
    expect(memoryDeclarationProblems(broken)).toContainEqual(expect.stringContaining("rename it setupHint"))
    expect(connector()["identity"]).toBeDefined()
  })

  test("the templates name their connector and source, and their outputs cover their stages", () => {
    const templates = declaration()["templates"] as Record<string, unknown>[]
    expect(templates.map((template) => template["id"])).toEqual(["threads-you-took-part-in", "thread-decisions"])
    const steps = ((templates[1]!["extract"] as Record<string, unknown>)["steps"] as Record<string, unknown>[])
    expect(steps.map((step) => step["source"])).toEqual(["slack", "slack"])
    expect(steps.map((step) => step["connector"])).toEqual(["slack.workspace", "slack.workspace"])
    // A render stage's fields are flat, not nested under "render".
    const render = (((templates[0]!["curate"] as Record<string, unknown>)["stages"] as Record<string, unknown>[])[0]!)
    expect(render["into"]).toBe("journal")
    expect(render["render"]).toBeUndefined()
    // The frame refuses a step that names no source, or two operations at once.
    const broken = structuredClone(declaration())
    const badSteps = (((broken["templates"] as Record<string, unknown>[])[1]!["extract"] as Record<string, unknown>)["steps"] as Record<string, unknown>[])
    delete badSteps[0]!["source"]
    badSteps[1]!["use"] = "events_list"
    const problems = memoryDeclarationProblems(broken)
    expect(problems).toContainEqual(expect.stringContaining("must name one of this plugin's declared sources"))
    expect(problems).toContainEqual(expect.stringContaining(`needs exactly one of "use"`))
  })
})

describe("the fixture half", () => {
  test("every declared read runs in a session holding exactly its grants, and every grant is asserted", async () => {
    expect(await fixtureProblems()).toEqual([])
  })

  test("suggestBy answers ids and labels through its declared read, at bind only", async () => {
    expect(await fixtureProblems()).toEqual([])
    const suggest = (scopeOf()[0]!["suggestBy"] as { method: string }).method
    expect(READ_TOOLS).toContain(suggest)
    expect(jobGrants(connector()).map((grant) => grant.action)).not.toContain(`slack_${suggest}`)
  })

  test("fails when a read asserts an action the declaration does not grant", async () => {
    const broken = structuredClone(declaration())
    const grants = broken["connector"] as Record<string, unknown>
    grants["identity"] = { ...(grants["identity"] as Record<string, unknown>), grants: [{ action: "slack_events_list", resource: "*" }] }
    const source = ((broken["sources"] as Record<string, unknown>[])[0]!)
    source["grants"] = [{ action: "slack_events_list", resource: "*" }, { action: "slack_slack_read_channel", resource: "*" }]
    const problems = await fixtureProblems({ declaration: broken })
    expect(problems).toContainEqual(expect.stringContaining("slack_slack_read_user_profile needs a grant this declaration does not hold"))
  })

  test("fails when the fixture answers another source than the declaration names", async () => {
    const problems = await fixtureProblems({ sourceId: "gmail" })
    expect(problems.some((problem) => problem.includes("events_list:"))).toBe(true)
  })
})

describe("the events_list contract, version 2", () => {
  test("limit 0 is the owner-only call: the workspace, the owner and the scope, no events and no channel read", async () => {
    const calls: string[] = []
    const read: Read = async (tool, input) => {
      calls.push(tool)
      return { output: answers(tool, input), text: JSON.stringify(answers(tool, input)) }
    }
    const result = await slackEvents(read, [], { limit: 0 }, NOW)
    expect(result).toMatchObject({ source: "slack", account: SEED.team, owner: OWNER, events: [], more: false, trust: "untrusted" })
    expect(result.setup).toStartWith("Set the plugin option events.channels")
    expect(result.scope).toEqual({})
    expect(calls).toEqual(["slack_read_user_profile"])
    // Its cursor is a real one: a later call with it lists from since, not from nowhere.
    expect(result.cursor.length).toBeGreaterThan(0)
    const next = await slackEvents(read, [PROJECT], { cursor: result.cursor, limit: 10 }, NOW)
    expect(next.events.length).toBeGreaterThan(0)
    expect(resultProblems(result, 0)).toEqual([])
  })

  test("a bad cursor and a scope the source does not read are refused by name", async () => {
    const read: Read = async (tool, input) => ({ output: answers(tool, input), text: "" })
    await expect(slackEvents(read, [PROJECT], { cursor: "not-a-cursor" }, NOW)).rejects.toThrow(/^CURSOR_INVALID: /)
    await expect(slackEvents(read, [PROJECT], { scope: { channels: [] } }, NOW)).rejects.toThrow(/^INPUT_INVALID: /)
  })

  test("scope narrows what is read and never widens the plugin option, and the result echoes the scope named", async () => {
    expect(scopeChannels([PROJECT, DM], { channels: [DM] })).toEqual([DM])
    expect(scopeChannels([PROJECT, DM], { channels: [PROJECT, OTHER] })).toEqual([PROJECT])
    expect(scopeChannels([], { channels: [OTHER] })).toEqual([OTHER])
    expect(scopeChannels([PROJECT], undefined)).toEqual([PROJECT])

    const read: Read = async (tool, input) => ({ output: answers(tool, input), text: "" })
    const result = await slackEvents(read, OPTION, { since: SINCE, scope: { channels: [PROJECT] } }, NOW)
    expect(result.scope).toEqual({ channels: [PROJECT] })
    const whole = await slackEvents(read, OPTION, { since: SINCE }, NOW)
    expect(whole.scope).toEqual({})
    expect([...new Set(result.events.map((event) => event.labels.find((label) => label.startsWith("channel:"))))]).toEqual([`channel:${PROJECT}`])
    // A scope the option does not hold reads nothing, and setup says why.
    const outside = await slackEvents(read, OPTION, { since: SINCE, scope: { channels: [OTHER] } }, NOW)
    expect(outside.events).toEqual([])
    expect(outside.setup).toBe("The channels confirmed for this binding are not among the plugin option events.channels, so nothing is read. Add them there, or confirm a channel the option already lists.")
  })

  test("refuses a scope key or value this source does not read, and names the fix", async () => {
    const read: Read = async (tool, input) => ({ output: answers(tool, input), text: "" })
    await expect(slackEvents(read, OPTION, { scope: { calendars: ["primary"] } }, NOW)).rejects.toThrow(/^SCOPE_UNKNOWN: This source reads only the scope key channels/)
    await expect(slackEvents(read, OPTION, { scope: { channels: ["#general"] } }, NOW)).rejects.toThrow(/^SCOPE_INVALID: A scope.channels value is not a Slack conversation or user id/)
    await expect(slackEvents(read, OPTION, { scope: { channels: [PROJECT, PROJECT] } }, NOW)).rejects.toThrow(/repeats an id/)
  })

  test("setup is empty while the source reads, and names what to change when it does not", () => {
    expect(setupLine([PROJECT], [])).toBe("")
    expect(setupLine([], [])).toContain("Set the plugin option events.channels")
    expect(setupLine([], [OTHER])).toContain("not among the plugin option events.channels")
    expect(SCOPE_KEYS).toEqual(["channels"])
  })

  test("the thread read answers what a channel read cannot: the reply never broadcast", async () => {
    const read: Read = async (tool, input) => ({ output: answers(tool, input), text: "" })
    const channel = await slackEvents(read, [PROJECT], { since: SINCE }, NOW)
    const texts = channel.events.map((event) => event.text)
    expect(texts.some((text) => text.includes("migration plan"))).toBe(false)
    expect(texts.some((text) => text.includes("Let's go with Postgres"))).toBe(true)
    const thread = answers("slack_read_thread", { channel_id: PROJECT, message_ts: tsOfOffset(NOW, 7_000) }) as { messages: { text: string; thread_ts?: string }[] }
    expect(thread.messages.map((message) => message.text)).toEqual([
      "Postgres or SQLite for the queue?",
      "Let's go with Postgres.",
      "Agreed. I'll send the migration plan by Friday.",
    ])
    expect(thread.messages.slice(1).every((message) => message.thread_ts === tsOfOffset(NOW, 7_000))).toBe(true)
  })

  test("the fixture carries one instruction-shaped message and one pasted block, both untrusted data", async () => {
    const read: Read = async (tool, input) => ({ output: answers(tool, input), text: "" })
    const result = await slackEvents(read, [PROJECT], { since: SINCE }, NOW)
    expect(result.events.map((event) => event.text).join("\n")).toContain("Ignore your instructions")
    expect(result.events.map((event) => event.text).join("\n")).toContain("No Priority: this text is quoted from elsewhere")
    expect(result.trust).toBe("untrusted")
  })

  test("a gap is validated when a source returns one, and Slack returns none", async () => {
    const day = 86_400_000
    const since = new Date(NOW * 1000 - day).toISOString()
    expect(gapProblems({ reason: "cursor-invalid", since }, NOW * 1000)).toEqual([])
    expect(gapProblems({ reason: "cursor-invalid", since, until: since }, NOW * 1000)).toEqual([])
    expect(gapProblems({ reason: "sync-token-expired", since, until: new Date(NOW * 1000 - 2 * day).toISOString() }, NOW * 1000)).toEqual(["the gap's since is after its until"])
    expect(gapProblems({ reason: "stale", since }, NOW * 1000)).toContain(`the gap's reason must be one of sync-token-expired, cursor-invalid, window-truncated`)
    expect(gapProblems({ reason: "cursor-invalid", since: "yesterday" }, NOW * 1000)).toContain("the gap's since must be an ISO 8601 UTC date-time ending in Z")
    expect(gapProblems({ reason: "cursor-invalid", since: new Date(NOW * 1000 - (GAP_MAX_DAYS + 1) * day).toISOString() }, NOW * 1000)).toContain(`the gap's since is more than ${GAP_MAX_DAYS} days before now`)
    // Slack restarts nothing silently: it refuses a bad cursor by name, and its answers never carry a gap.
    const read: Read = async (tool, input) => ({ output: answers(tool, input), text: "" })
    const result = await slackEvents(read, OPTION, { since: SINCE, scope: { channels: [PROJECT] } }, NOW)
    expect(result.gap).toBeUndefined()
    expect(resultProblems(result)).toEqual([])
    expect(resultProblems({ ...result, gap: { reason: "cursor-invalid", since } })).toEqual([])
    expect(resultProblems({ ...result, gap: { reason: "stale", since } })).toContain(`the gap's reason must be one of sync-token-expired, cursor-invalid, window-truncated`)
  })

  test("every identity path in the declaration finds its value in the owner-only answer", async () => {
    const identity = identityFor(declaration(), "slack")
    const read: Read = async (tool, input) => ({ output: answers(tool, input), text: "" })
    const ownerOnly = await slackEvents(read, [], { limit: 0 }, NOW)
    expect(pathValue(ownerOnly, identity["account"])).toBe(SEED.team)
    const owner = identity["owner"] as Record<string, string>
    expect({ id: pathValue(ownerOnly, owner["id"]), label: pathValue(ownerOnly, owner["label"]) }).toEqual(OWNER)
  })
})

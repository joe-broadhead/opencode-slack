// Memory's connector pattern (Memory Jobs design §9), against this plugin's own declaration and its shaped fixture:
// schema v2, every declared action read-only and actually asserted, the owner-only call, the scope echo and the read
// verbs, and the kit's recording permission context, which fails on any action the declaration does not grant.
// Nothing here contacts Slack, Memory or the network: `test/fixtures/fake-slack-shaped.ts` answers.
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { EVENTS_ACTION, scopeChannels, slackEvents, SCOPE_KEYS, setupLine, type Read } from "../../src/events.js"
import { resultProblems } from "../../src/host/events-list.js"
import { KNOWN_TOOLS, READ_TOOLS } from "../../src/tools.js"
import {
  assertMemoryConformance,
  connectorActions,
  connectorReadNames,
  memoryConformance,
  memoryDeclarationProblems,
  pathValue,
  readVerbProblem,
  recordingSession,
  scopeKeys,
  WRITE_VERBS,
  type EventsListWithRead,
  type FixtureTool,
  type MemoryConformance,
} from "../support/memory-kit.js"
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
const executorId = (tool: string) => `slack_${tool}`
const OPTION = [PROJECT, DM]

/** The fixture's executors, by the id OpenCode lists Slack's tools under. */
const fixtureTools = (): FixtureTool[] =>
  ["slack_read_user_profile", "slack_read_channel", "slack_read_thread", "slack_list_user_channels"].map((tool) => ({
    id: `slack_${tool}`,
    execute: async (input: Record<string, unknown>) => {
      const answer = answers(tool, input)
      return { output: answer, content: [{ type: "text", text: JSON.stringify(answer) }] }
    },
  }))

/** The events_list the declaration describes, over the fixture: the plugin option, then the call's scope. */
const eventsList: EventsListWithRead = (input, read) => slackEvents(read as Read, OPTION, input, NOW)

const eventsFixtures = {
  source: "slack",
  account: SEED.team,
  owner: OWNER,
  since: SINCE,
  scope: { channels: OPTION },
  expected: [
    `${DM}:${tsOfOffset(NOW, 8_000)}`,
    `${PROJECT}:${tsOfOffset(NOW, 7_200)}`,
    `${PROJECT}:${tsOfOffset(NOW, 7_000)}`,
    `${PROJECT}:${tsOfOffset(NOW, 6_900)}`,
    `${PROJECT}:${tsOfOffset(NOW, 5_400)}`,
    `${PROJECT}:${tsOfOffset(NOW, 3_600)}`,
    `${DM}:${tsOfOffset(NOW, 2_000)}`,
  ],
}

const conformance = (overrides: Partial<MemoryConformance> = {}): MemoryConformance => ({
  declaration: declaration(),
  tools: fixtureTools(),
  executorIdOf: executorId,
  samples: {
    slack_read_channel: { channel_id: PROJECT, oldest: "0.0", limit: 100 },
    slack_read_thread: { channel_id: PROJECT, message_ts: tsOfOffset(NOW, 7_000) },
  },
  eventsList,
  eventsFixtures,
  ...overrides,
})

const source = () => ((declaration()["sources"] as Record<string, unknown>[])[0]!)
const connector = () => declaration()["connector"] as Record<string, unknown>

describe("the memory declaration", () => {
  test("passes Memory's schema v2 frame", () => {
    expect(memoryDeclarationProblems(declaration())).toEqual([])
  })

  test("declares only read verbs, each in this plugin's namespace, and one resource placeholder at most", () => {
    for (const grant of connectorActions(connector())) {
      expect({ action: grant.action, problem: readVerbProblem(grant.action) }).toEqual({ action: grant.action, problem: undefined })
      expect(grant.resource).toBe("*")
      expect(grant.action.startsWith("slack_")).toBe(true)
    }
    // The frame still refuses what it must, so the clean result above means something.
    for (const verb of ["send", "create", "update", "delete", "schedule", "upload", "react"]) {
      expect(readVerbProblem(`slack_slack_${verb}_message`)).toContain("write verb")
    }
    expect(WRITE_VERBS).toContain("send")
    expect(readVerbProblem("slack_fetch_messages")).toContain("no read verb")
    const broken = structuredClone(declaration())
    ;((broken["connector"] as Record<string, unknown>)["identity"] as Record<string, unknown>)["grants"] = [{ action: "slack_slack_send_message", resource: "*" }]
    expect(memoryDeclarationProblems(broken)).toContainEqual(expect.stringContaining(`connector.identity.grants[0]: "slack_slack_send_message" contains the write verb`))
  })

  test("declares slack_read_thread for thread jobs, pinned to a confirmed channel and the one thread", () => {
    const thread = (connector()["reads"] as Record<string, unknown>[]).find((read) => read["method"] === "slack_read_thread")
    expect(thread).toBeDefined()
    expect(thread!["scopeInputs"]).toEqual({ channel_id: "channels", message_ts: "thread" })
    expect(thread!["grants"]).toEqual([{ action: "slack_slack_read_thread", resource: "*" }])
    // A thread ts is per unit, never something the confirm dialog asks for, so it is a pinned key.
    const scope = (connector()["scope"] as Record<string, unknown>[]).find((entry) => entry["key"] === "thread")
    expect([scope!["required"], scope!["suggest"], scope!["max"]]).toEqual([false, false, 1])
    // The fast path's narrowing is the channels the person confirms.
    expect((source()["scope"] as Record<string, unknown>[]).map((entry) => entry["key"])).toEqual(["channels"])
  })

  test("declares every read as a real read method of the tools RPC", () => {
    const declared = connectorReadNames(connector())
    expect(declared.length).toBeGreaterThan(0)
    for (const tool of declared) expect({ tool, read: READ_TOOLS.includes(tool) }).toEqual({ tool, read: true })
    // The identity is events_list, the plugin-owned read method, called as contract 2's owner-only call.
    expect((connector()["identity"] as Record<string, unknown>)["method"]).toBe("events_list")
    expect((connector()["identity"] as Record<string, unknown>)["input"]).toEqual({ limit: 0 })
    expect(EVENTS_ACTION).toBe("slack_events_list")
    expect(readVerbProblem(EVENTS_ACTION)).toBeUndefined()
    // The declaration never names a write: the fixture's own server lists them, and none is granted.
    for (const tool of Object.keys(KNOWN_TOOLS)) if (KNOWN_TOOLS[tool] === "write") expect(readVerbProblem(`slack_${tool}`)).toBeDefined()
    for (const action of connectorActions(connector())) expect(action.action).not.toMatch(/list_user_channels/)
  })

  test("the source declares contract 2 and exactly the actions events_list asserts", () => {
    expect(source()["contract"]).toBe(2)
    expect(source()["kinds"]).toEqual(["message"])
    expect(source()["grants"]).toEqual([
      { action: "slack_events_list", resource: "*" },
      { action: "slack_slack_read_user_profile", resource: "*" },
      { action: "slack_slack_read_channel", resource: "*" },
    ])
    expect((source()["cadence"] as Record<string, unknown>)["everyMinutes"]).toBeGreaterThanOrEqual(15)
    expect(String(source()["setup"]).length).toBeLessThanOrEqual(300)
    expect(scopeKeys(connector())).toEqual(["channels", "thread"])
  })

  test("names no action its reads do not assert, in either direction", async () => {
    // Every declared action is one the source's reads or the probe need; the recording session proves the converse.
    const problems = await memoryConformance(conformance())
    expect(problems).toEqual([])
  })

  test("the templates are declarative, read-only, and in the source's own sources and reads", () => {
    const templates = declaration()["templates"] as Record<string, unknown>[]
    expect(templates.map((template) => template["id"])).toEqual(["threads-you-took-part-in", "thread-decisions"])
    const problems = memoryDeclarationProblems(declaration())
    expect(problems).toEqual([])
    // A template that names another plugin's source, or a read this plugin does not declare, is refused.
    const broken = structuredClone(declaration())
    const stages = ((broken["templates"] as Record<string, unknown>[])[0]!["curate"] as Record<string, unknown>)["stages"] as Record<string, unknown>[]
    ;(stages[0]!["select"] as Record<string, unknown>)["sources"] = ["github"]
    expect(memoryDeclarationProblems(broken)).toContain(`templates[0].curate.stages[0].select.sources names github, which this plugin does not declare`)
    const unknown = structuredClone(declaration())
    ;(((unknown["templates"] as Record<string, unknown>[])[1]!["extract"] as Record<string, unknown>[])[1]!)["call"] = "slack_read_canvas"
    expect(memoryDeclarationProblems(unknown)).toContain(`templates[1].extract[1].call must name one of the connector's declared reads`)
  })
})

describe("the conformance kit", () => {
  test("runs every declared read with exactly its granted actions", async () => {
    await assertMemoryConformance(conformance())
  })

  test("fails when a read asserts an action the declaration does not grant", async () => {
    const broken = structuredClone(declaration())
    const connectorGrants = broken["connector"] as Record<string, unknown>
    connectorGrants["identity"] = { ...(connectorGrants["identity"] as Record<string, unknown>), grants: [{ action: "slack_events_list", resource: "*" }] }
    ;(connectorGrants["reads"] as Record<string, unknown>[])[0]!["grants"] = [{ action: "slack_slack_read_thread", resource: "*" }]
    const problems = await memoryConformance(conformance({ declaration: broken }))
    expect(problems).toContain("a read asserted slack_slack_read_channel, which the declaration does not grant")
  })

  test("fails when the fixture answers a kind the source does not declare", async () => {
    const problems = await memoryConformance(conformance({ eventsFixtures: { ...eventsFixtures, source: "other" } }))
    expect(problems.some((problem) => problem.includes("the result names the source slack, not other"))).toBe(true)
  })

  test("records what a session asserted: the grants it holds pass, any other is refused", async () => {
    const session = recordingSession([{ action: "slack_slack_read_channel", resource: "*" }], fixtureTools())
    const [readUser, readChannel] = await session.tool.list()
    await expect(readUser!.execute({}, {})).rejects.toMatchObject({ _tag: "Tool.Error" })
    await expect(readChannel!.execute({ channel_id: PROJECT, oldest: "0.0" }, {})).resolves.toBeDefined()
    expect(session.undeclared).toEqual(["slack_slack_read_user_profile"])
    expect(session.assertions.map((assertion) => assertion.action)).toEqual(["slack_slack_read_user_profile", "slack_slack_read_channel"])
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
    // With no scope named, the echo is {}: the whole source, which is the plugin's own cap.
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

  test("every identity path in the declaration finds its value in the owner-only answer", async () => {
    const identity = connector()["identity"] as Record<string, unknown>
    const read: Read = async (tool, input) => ({ output: answers(tool, input), text: "" })
    const ownerOnly = await slackEvents(read, [], { limit: 0 }, NOW)
    expect(pathValue(ownerOnly, identity["account"])).toBe(SEED.team)
    const owner = identity["owner"] as Record<string, string>
    expect({ id: pathValue(ownerOnly, owner["id"]), label: pathValue(ownerOnly, owner["label"]) }).toEqual(OWNER)
  })
})

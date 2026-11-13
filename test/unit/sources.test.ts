// Contract version 1 (app#2346): the `sources` declaration, the protocol's `probe` and `details` reads, and page
// results with `refused[]`, `failed[]` and `gap`. The kit is the package's own, vendored at `3fe6255` and checked
// against its SHA256SUMS; nothing here contacts Slack, Memory or the network.
import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { EVENTS_ACTION, scopeChannels, slackEvents, type Read, type EventsToolOptions } from "../../src/events.js"
import { DETAIL_ACTION, PROBE_ACTION, slackDetail, slackProbe } from "../../src/source.js"
import { createAnswers, SEED, tsOfOffset } from "../fixtures/fake-slack-shaped.js"
// The package's kit, vendored dev-time: `test/support/source-contract/VENDORED.md` names its commit.
import { assertConformance, declarationProblems, sourceConformance } from "../../vendor/source-contract/conformance.js"

const VENDORED = fileURLToPath(new URL("../../vendor/source-contract", import.meta.url))
const ROOT = fileURLToPath(new URL("../..", import.meta.url))
const declaration = () => (JSON.parse(readFileSync(`${ROOT}/package.json`, "utf8")) as { sources: Record<string, unknown> & { items: Record<string, unknown>[] } }).sources
const source = () => declaration().items[0]!
const PLUGIN = "@joe-broadhead/opencode-slack"

/** `slackEvents` takes the clock in epoch milliseconds; the fixture's seed counts back from seconds. */
const NOW_MS = Date.parse("2026-11-08T12:00:00Z")
const NOW = NOW_MS / 1000
const SINCE = "2026-10-01T00:00:00Z"
const PROJECT = "C0PILOT001"
const DM = "D0PILOT002"
const answers = createAnswers(NOW)
const OPTION = [PROJECT, DM]
const THREAD_TS = tsOfOffset(NOW, 7_000)

/** The fixture's executors, each asserting its own action through the session the kit hands the call. */
const tools = (permission?: { assert: (input: { action: string; resources: string[] }) => Promise<void> }) =>
  ["slack_read_user_profile", "slack_read_channel", "slack_read_thread", "slack_list_user_channels"].map((tool) => ({
    id: `slack_${tool}`,
    execute: async (input: Record<string, unknown>) => {
      // The identity read belongs to `probe` (§2.3), so a content read never asserts it here.
      if (tool !== "slack_read_user_profile") await permission?.assert({ action: `slack_${tool}`, resources: ["*"] })
      const answer = answers(tool, input)
      return { output: answer, content: [{ type: "text", text: JSON.stringify(answer) }] }
    },
  }))

const read = (permission: { assert: (input: { action: string; resources: string[] }) => Promise<void> }): Read => {
  const list = tools(permission)
  return async (tool, input) => {
    const executor = list.find((entry) => entry.id === `slack_${tool}`)
    if (executor === undefined) throw new Error(`the fixture has no ${tool}`)
    const result = (await executor.execute(input)) as { output?: unknown }
    return { output: result.output, text: "" }
  }
}

const options = (permission: { assert: (input: { action: string; resources: string[] }) => Promise<void> }, asserts: unknown[] = []): EventsToolOptions => ({
  tool: { list: async () => [] } as never,
  permission: { assert: async (input: unknown) => void (asserts.push(input), permission.assert(input as never)) } as never,
  channels: OPTION,
  owned: () => true,
  status: async () => ({ state: "connected", nextStep: "Nothing to do." }) as never,
  now: () => NOW_MS,
})

describe("the source declaration", () => {
  test("is contract version 1 and passes the package's static rules", () => {
    expect(declaration()["contractVersion"]).toBe(1)
    expect(source()["id"]).toBe("slack.messages")
    expect(declarationProblems(declaration(), { tools: ["events_list", "slack_read_detail", "slack_read_channel", "slack_read_thread", "slack_read_user_profile", "slack_list_user_channels"].map((id) => ({ id, readOnly: true })) })).toEqual([])
  })

  test("the vendored kit matches its SHA256SUMS, which check-copies pins", () => {
    const sums = readFileSync(join(VENDORED, "SHA256SUMS"), "utf8").trim().split("\n")
    expect(sums.length).toBeGreaterThan(10)
    for (const line of sums) {
      const [hash, file] = line.split(/\s+/) as [string, string]
      expect(createHash("sha256").update(readFileSync(join(VENDORED, file))).digest("hex")).toBe(hash)
    }
    expect(readdirSync(VENDORED).filter((name) => name.endsWith(".js")).length).toBeGreaterThan(5)
  })
})

describe("the protocol", () => {
  // A cursor whose bound is older than the retention window: the source answers `CURSOR_EXPIRED` with a `gap`.
  const agedCursor = async () => {
    const { encodeCursor } = await import("../../src/host/events-list.js")
    // The same owner binding the source issues: a hash of the account and the owner id, and a bound older than the window.
    const owner = createHash("sha256").update(`${SEED.team}\u0000slack:${SEED.owner.id}`).digest("hex").slice(0, 16)
    return encodeCursor("slack.messages", { o: owner, c: { [PROJECT]: "1000000000.000100" } })
  }
  const cases = [
    { name: "a page from since", input: { since: SINCE, scope: { channels: OPTION } }, expect: "page" as const },
    { name: "an empty page", input: { since: "2999-01-01T00:00:00Z", scope: { channels: OPTION } }, expect: "empty" as const },
    { name: "a foreign cursor", input: { cursor: "not-a-cursor" }, expect: { refuses: "CURSOR_INVALID" } },
  ]

  const conformance = async (overrides: Record<string, unknown> = {}) => {
    const events = {
      list: async (input: Record<string, unknown>, context: { account: string; permission: { assert: (i: { action: string; resources: string[] }) => Promise<void> } }) => {
        const asserted = { action: EVENTS_ACTION, resources: ["*"] }
        await context.permission.assert(asserted)
        return slackEvents(read(context.permission), OPTION, input, NOW_MS)
      },
    }
    return sourceConformance({
      plugin: PLUGIN,
      source: source() as never,
      tools: ["events_list", "slack_read_detail", "slack_read_channel", "slack_read_thread", "slack_read_user_profile", "slack_list_user_channels"].map((id) => ({ id, readOnly: true })),
      calls: {
        list: events.list,
        probe: async (_input, context) => {
          const identity = { action: "slack_slack_read_user_profile", resources: ["*"] }
          await context.permission.assert(identity)
          return slackProbe(read(context.permission))
        },
        details: {
          "slack.messages.thread": async (input: unknown, context: { permission: { assert: (i: { action: string; resources: string[] }) => Promise<void> } }) =>
            slackDetail(read(context.permission), input),
        },
        suggest: async (_input, context) => {
          const bind = { action: "slack_slack_list_user_channels", resources: ["*"] }
          await context.permission.assert(bind)
          return { options: (answers("slack_list_user_channels", {}) as { channels: { id: string; name: string }[] }).channels.map((channel) => ({ id: channel.id, label: channel.name })) }
        },
      },
      cases: [...cases, { name: "an expired cursor", input: { cursor: await agedCursor() }, expect: "expired" }],
      detailCases: [
        { id: "slack.messages.thread", scope: { channels: [PROJECT] }, event: { thread: `slack-thread:${PROJECT}:${THREAD_TS}` } },
        { id: "slack.messages.thread", scope: { channels: [DM] }, event: { thread: `slack-thread:${PROJECT}:${THREAD_TS}` }, expect: { refuses: "PERMISSION_DENIED" } },
      ],
      identityOperations: ["slack_read_user_profile"],
      account: SEED.team,
      ...overrides,
    })
  }

  test("passes the package's conformance kit", async () => {
    const report = await conformance()
    if (!report.ok) console.error(JSON.stringify(report, null, 1))
    assertConformance(report)
    expect(report.ok).toBe(true)
    expect(report.checks.filter((check: { ran: boolean }) => check.ran).length).toBeGreaterThan(6)
  })

  test("a page names the source id and the plugin, and carries the three drop and gap lists", async () => {
    const result = (await slackEvents(async (tool, input) => ({ output: answers(tool, input), text: "" }), OPTION, { since: SINCE, scope: { channels: OPTION } }, NOW)) as unknown as Record<string, unknown>
    expect(result["plugin"]).toBe(PLUGIN)
    expect(result["source"]).toBe("slack.messages")
    expect((result["refused"] as { external_id: string; reason: string }[]).map((entry) => [entry.external_id, entry.reason])).toEqual([
      [`${PROJECT}:${tsOfOffset(NOW, 5_400)}`, "instruction"],
      [`${PROJECT}:${tsOfOffset(NOW, 5_300)}`, "secret"],
    ])
    expect((result["failed"] as { external_id: string }[]).map((entry) => entry.external_id)).toEqual([`${PROJECT}:not-a-ts`])
    expect(result["gap"]).toBeUndefined()
  })

  test("the cursor is bound to the plugin, source, account and scope, and a contract 1 cursor is accepted once", async () => {
    const read2 = async (tool: string, input: Record<string, unknown>) => ({ output: answers(tool, input), text: "" })
    // The direct message has no unreadable message, so its page carries a cursor (a failed entry would hold it back).
    const scoped = (await slackEvents(read2, OPTION, { since: SINCE, scope: { channels: [DM] } }, NOW_MS)) as unknown as { cursor: string }
    expect(scoped.cursor.length).toBeGreaterThan(0)
    // Another scope, another account: both are refused.
    await expect(slackEvents(read2, OPTION, { cursor: scoped.cursor, scope: { channels: [PROJECT] } }, NOW_MS)).rejects.toThrow(/^CURSOR_INVALID: /)
    await expect(slackEvents(read2, OPTION, { cursor: scoped.cursor, account: "T0OTHER0001" }, NOW_MS)).rejects.toThrow(/^ACCOUNT_UNKNOWN: /)
    // A contract 1 cursor (the family's codec, bound to the source only) is accepted once for the whole source.
    const { encodeCursor } = await import("../../src/host/events-list.js")
    const legacy = encodeCursor("slack.messages", { o: "0123456789abcdef", c: { [PROJECT]: "1000000000.000100" } })
    await expect(slackEvents(read2, OPTION, { cursor: legacy, since: SINCE }, NOW_MS)).rejects.toThrow(/^CURSOR_EXPIRED: /)
    await expect(slackEvents(read2, OPTION, { cursor: legacy, scope: { channels: [PROJECT] } }, NOW_MS)).rejects.toThrow(/^CURSOR_INVALID: /)
  })

  test("probe answers the account and owner only, and the detail read refuses an unconfirmed channel", async () => {
    const probe = await slackProbe(async (tool, input) => ({ output: answers(tool, input), text: "" }))
    expect(probe).toMatchObject({ plugin: PLUGIN, source: "slack.messages", account: SEED.team, owner: { id: `slack:${SEED.owner.id}`, label: SEED.owner.name } })
    expect(Object.keys(probe).sort()).toEqual(["account", "owner", "plugin", "source", "trust"])
    const refusal = await slackDetail(async (tool, input) => ({ output: answers(tool, input), text: "" }), { account: SEED.team, scope: { channels: [DM] }, fields: { thread: `slack-thread:${PROJECT}:${THREAD_TS}` } }).catch((caught: unknown) => caught)
    expect(refusal).toMatchObject({ code: "PERMISSION_DENIED" })
    expect((refusal as Error).message).toMatch(/^PERMISSION_DENIED: .+ Next step: /)
    const inside = (await slackDetail(async (tool, input) => ({ output: answers(tool, input), text: "" }), { account: SEED.team, scope: { channels: [PROJECT] }, fields: { thread: `slack-thread:${PROJECT}:${THREAD_TS}` } })) as { events: unknown[]; plugin: string }
    expect(inside.plugin).toBe(PLUGIN)
    expect(inside.events).toHaveLength(1)
  })

  test("the actions are the operations the declaration lists", () => {
    expect(PROBE_ACTION).toBe("slack_slack_read_user_profile")
    expect(DETAIL_ACTION).toBe("slack_slack_read_thread")
    const operations = (source()["permission"] as { operations: string[] }).operations
    expect(operations).toContain("slack_read_user_profile")
    expect(operations).toContain("slack_read_thread")
    expect(EVENTS_ACTION).toBe("slack_events_list")
    // The options helper is used by the tool path's own suite; here it proves the shape the kit's calls rely on.
    expect(options({ assert: async () => {} }).channels).toEqual(OPTION)
    expect(scopeChannels(OPTION, { channels: [PROJECT] })).toEqual([PROJECT])
  })
})

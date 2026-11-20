// The slack.mentions and slack.dms sources (after @domeevans's domeevans/opencode-slack#1), the Web API read path they
// share, and the slack.workspace source's consent list, against Slack's answers from test/fixtures/conformance.json.
// Every id below is invented, Slack's documented example, or the placeholder U00CURRENTUSER.
import { describe, expect, test } from "bun:test"
import { encodeBoundCursor } from "@we-the-rebel-alliance/source-contract/cursor"
import { resultProblems } from "@we-the-rebel-alliance/source-contract/events"
import { checkOutput } from "@we-the-rebel-alliance/source-contract/registry"
import { slackDms } from "../../src/dms.js"
import { identityOf } from "../../src/identity.js"
import { slackMentions } from "../../src/mentions.js"
import type { SlackApiResult } from "../../src/slack-api.js"
import { channelOptions, channelsMethod, slackChannels } from "../../src/source.js"
import { executed, SHAPES } from "../support/answer-shapes.js"
import type { Status } from "../../src/status.js"
import { WEB_READ_ACTION, webReader, webSignedIn, type WebReadOptions } from "../../src/web-reads.js"
import { FIXTURE, fakeApi } from "../support/conformance.js"

const NOW = Date.parse(FIXTURE.now)
const ACCOUNT = String(FIXTURE.authTest["team_id"])
const context = { sessionID: "ses_1", agent: "build", messageID: "msg_1", id: "call_1", signal: new AbortController().signal } as never
const connected = { state: "connected" } as unknown as Status

function options(overrides: Partial<WebReadOptions> = {}) {
  const asserted: { action: string; resources: readonly string[] }[] = []
  const calls: string[] = []
  const web: WebReadOptions = {
    permission: { assert: async (input) => void asserted.push({ action: input.action, resources: input.resources }) },
    api: fakeApi(FIXTURE, calls),
    identity: async () => identityOf(FIXTURE.authTest),
    status: async () => connected,
    sleep: async () => {},
    now: () => NOW,
    ...overrides,
  }
  return { web, asserted, calls }
}

const mentions = (web: WebReadOptions, input: unknown) => slackMentions((account) => webReader(web, context, account, "mentions_list"), () => webSignedIn(web, "mentions_list"), input, NOW)
const dms = (web: WebReadOptions, input: unknown) => slackDms((account) => webReader(web, context, account, "dms_list"), () => webSignedIn(web, "dms_list"), input, NOW)

describe("the Web API read path", () => {
  test("asserts slack.read on <workspace>:<method> before each call", async () => {
    const { web, asserted, calls } = options()
    await webReader(web, context, ACCOUNT, "dms_list")("users.conversations", {})
    expect(asserted).toEqual([{ action: WEB_READ_ACTION, resources: [`${ACCOUNT}:users.conversations`] }])
    expect(calls).toEqual(["users.conversations"])
    expect(WEB_READ_ACTION).toBe("slack.read")
  })

  test("waits out a short rate limit at most twice, then says RATE_LIMITED; a missing scope is SCOPE_MISSING", async () => {
    const answers: SlackApiResult[] = [{ ok: false, error: "ratelimited", retryAfter: 1 }, { ok: false, error: "ratelimited", retryAfter: 1 }, { ok: true, credential: "c", body: { ok: true } }]
    const waited: number[] = []
    const flaky = options({ api: { call: async () => answers.shift()! }, sleep: async (ms) => void waited.push(ms) }).web
    expect(await webReader(flaky, context, ACCOUNT, "dms_list")("users.info", {})).toEqual({ ok: true })
    expect(waited).toEqual([1000, 1000])
    const limited = options({ api: { call: async () => ({ ok: false, error: "ratelimited", retryAfter: 120 }) } }).web
    await expect(webReader(limited, context, ACCOUNT, "dms_list")("users.info", {})).rejects.toThrow("RATE_LIMITED: Slack rate-limited users.info for dms_list. Next step: Call dms_list again in 120 seconds.")
    const scoped = options({ api: { call: async () => ({ ok: false, error: "missing_scope", needed: "im:history" }) } }).web
    await expect(webReader(scoped, context, ACCOUNT, "dms_list")("conversations.history", {})).rejects.toThrow(/^SCOPE_MISSING: Slack refused conversations\.history: the Slack sign-in lacks the scope im:history\./)
    const disabled = options({ api: { call: async () => ({ ok: false, error: "feature_not_enabled" }) } }).web
    await expect(webReader(disabled, context, ACCOUNT, "mentions_list")("assistant.search.context", {})).rejects.toThrow(
      /^FEATURE_NOT_ENABLED: Slack refused assistant\.search\.context for mentions_list: Real-time Search is not enabled .* Next step: Use a Slack app that is internal to your workspace or listed in the Slack Marketplace/,
    )
    const skipped = options({ api: { call: async () => ({ ok: false, error: "channel_not_found" }) } }).web
    expect(await webReader(skipped, context, ACCOUNT, "dms_list")("conversations.info", {}, ["channel_not_found"])).toBeUndefined()
  })

  test("without a signed-in account, says why: status's code, or UNAVAILABLE", async () => {
    await expect(webSignedIn(options({ identity: async () => undefined }).web, "dms_list")).rejects.toThrow(/^UNAVAILABLE: /)
    const signIn = { state: "sign_in_required", code: "AUTH_REQUIRED", message: "Sign in to Slack.", nextStep: "Run /connect." } as unknown as Status
    await expect(webSignedIn(options({ identity: async () => undefined, status: async () => signIn }).web, "dms_list")).rejects.toThrow("AUTH_REQUIRED: Sign in to Slack; dms_list cannot name the signed-in account. Next step: Run /connect.")
  })
})

describe("mentions_list", () => {
  test("lists the mentions oldest first, with the thread and the permalink, refuses a secret and leaves out the user's own", async () => {
    const { web, asserted } = options()
    const page = await mentions(web, { since: "2026-11-12T00:00:00Z" })
    expect(resultProblems(page)).toEqual([])
    expect(page).toMatchObject({ plugin: "@joe-broadhead/opencode-slack", source: "mentions", account: ACCOUNT, owner: { id: "slack:U00CURRENTUSER", label: "pilot.owner" }, more: false })
    expect(page.events.map((event) => [event.external_id, event.thread, event.actors[0]!.id, event.labels])).toEqual([
      ["C0EXAMPLE01:1794477900.000100", "slack-thread:C0EXAMPLE01:1794477600.000100", "slack:U012AB3CD", ["mention", "channel", "channel:C0EXAMPLE01", "thread-reply"]],
      ["D0EXAMPLE02:1794486000.000100", null, "slack:W012A3CDE", ["mention", "dm", "channel:D0EXAMPLE02"]],
    ])
    expect(page.refused).toEqual([{ external_id: "C0EXAMPLE01:1794481300.000100", reason: "secret", detail: "holds a secret (password)" }])
    expect(new Set(asserted.map((entry) => entry.resources[0]))).toEqual(new Set([`${ACCOUNT}:assistant.search.context`]))
  })

  test("pages by its cursor, past a refused mention, and binds the cursor to the workspace", async () => {
    const { web } = options()
    const first = await mentions(web, { since: "2026-11-12T00:00:00Z", limit: 1 })
    expect([first.events.length, first.more]).toEqual([1, true])
    // The refused mention right after the page's last event goes with that page, and the cursor moves past it.
    expect(first.refused?.map((entry) => entry.external_id)).toEqual(["C0EXAMPLE01:1794481300.000100"])
    const second = await mentions(web, { cursor: first.cursor, limit: 1 })
    expect([second.refused, second.events.map((event) => event.external_id)]).toEqual([undefined, ["D0EXAMPLE02:1794486000.000100"]])
    const last = await mentions(web, { cursor: second.cursor })
    expect([last.events, last.more]).toEqual([[], false])
    const other = encodeBoundCursor({ plugin: "slack", source: "mentions", account: "T0ANOTHER01" }, { t: "1794477900.000100" })
    await expect(mentions(web, { cursor: other })).rejects.toThrow(/^CURSOR_INVALID: /)
    const old = encodeBoundCursor({ plugin: "slack", source: "mentions", account: ACCOUNT }, { t: "1780000000.000100" })
    expect((await mentions(web, { cursor: old })).gap).toEqual({ reason: "expired", since: new Date(NOW - 90 * 86_400_000).toISOString() })
  })

  test("checks its input before it asks who is signed in or reads anything", async () => {
    const { web, calls } = options({ identity: async () => { throw new Error("not reached") } })
    await expect(mentions(web, { scope: { channels: ["C0EXAMPLE01"] } })).rejects.toThrow(/^INPUT_INVALID: /)
    await expect(mentions(web, { source: "slack" })).rejects.toThrow(/^SOURCE_UNKNOWN: /)
    expect(calls).toEqual([])
    await expect(mentions(options().web, { account: "T0ANOTHER01" })).rejects.toThrow(/^ACCOUNT_UNKNOWN: /)
  })

  test("a window with more than five pages of mentions is TOO_MANY_MESSAGES, never a skip", async () => {
    const endless = { call: async () => ({ ok: true as const, credential: "c", body: { ok: true, results: { messages: [] }, response_metadata: { next_cursor: "more" } } }) }
    await expect(mentions(options({ api: endless }).web, { since: "2026-11-12T00:00:00Z" })).rejects.toThrow(/^TOO_MANY_MESSAGES: /)
  })
})

describe("dms_list", () => {
  test("answers the newest conversations as source-contract's inbox, unread first in meaning, with no preview of a secret", async () => {
    const { web, calls } = options()
    const snapshot = await dms(web, { source: "dms", account: ACCOUNT })
    expect(checkOutput("inbox", snapshot.data).ok).toBe(true)
    expect(snapshot).toMatchObject({ source: "dms", account: ACCOUNT, asOf: FIXTURE.now, trust: "untrusted" })
    expect(snapshot.data.unread).toBe(1)
    expect(snapshot.data.items.map((item) => [item.id, item.title, item.from, item.preview, item.important])).toEqual([
      ["D0EXAMPLE02", "Kofi Boateng", "Kofi Boateng", "<@U00CURRENTUSER> can you review the migration plan?", true],
      ["G0EXAMPLE04", "Ama, Kofi Boateng", "Ama", undefined, false],
    ])
    // The note to oneself is not a conversation, and the one Slack will not open is left out.
    expect(calls.filter((method) => method === "conversations.history")).toHaveLength(3)
    expect(new Set(calls)).toEqual(new Set(["users.conversations", "conversations.history", "conversations.info", "conversations.members", "users.info"]))
  })

  test("keeps the conversations since a time, at most a limit, and refuses a bad input before any read", async () => {
    expect((await dms(options().web, { since: "2026-11-12T12:00:00Z" })).data.items.map((item) => item.id)).toEqual(["D0EXAMPLE02"])
    // Only `limit` conversations are read: one history and one info call each, never one per listed conversation.
    const capped = options()
    expect((await dms(capped.web, { limit: 1 })).data.items.map((item) => item.id)).toEqual(["D0EXAMPLE02"])
    expect(capped.calls.filter((method) => method === "conversations.history" || method === "conversations.info")).toEqual(["conversations.history", "conversations.info"])
    const { web, calls } = options()
    await expect(dms(web, { limit: 31 })).rejects.toThrow(/^INPUT_INVALID: /)
    await expect(dms(web, { cursor: "x" })).rejects.toThrow(/^INPUT_INVALID: /)
    await expect(dms(web, { source: "mentions" })).rejects.toThrow(/^SOURCE_UNKNOWN: /)
    await expect(dms(web, { account: "T0ANOTHER01" })).rejects.toThrow(/^ACCOUNT_UNKNOWN: /)
    expect(calls).toEqual([])
  })
})

describe("channels_list", () => {
  /** One answer in Slack's layout: a ### heading per conversation, its field bullets, then --- and the Pagination line. */
  const layout = (blocks: string[], pagination = "Pagination: No more results.") => `## Your channels (${blocks.length} found)\n\n${blocks.join("\n\n")}\n\n---\n${pagination}\n`
  const block = (heading: string, id: string, ...fields: string[]) => [`### ${heading}`, `- **ID:** ${id}`, "- **Type:** Public channel", ...fields, "- **Archived:** No"].join("\n")

  test("reads Slack's JSON, or each conversation's own heading and ID line and the last Pagination line, labelled", () => {
    expect(channelOptions({ output: { channels: [{ id: "C0EXAMPLE01", name: "project-harbour" }, { id: "nope" }], response_metadata: { next_cursor: "bmV4dA" } }, text: "" })).toEqual({
      options: [{ id: "C0EXAMPLE01", label: "project-harbour" }],
      next: "bmV4dA",
    })
    // The fixture is Slack's real layout: the name is the heading, the id its own `ID:` line.
    expect(channelOptions({ text: FIXTURE.userChannels })).toEqual({
      options: [
        { id: "C0EXAMPLE01", label: "project-harbour" },
        { id: "D0EXAMPLE02", label: "Ama Mensah" },
        { id: "C0EXAMPLE03", label: "launch-room" },
        { id: "G0EXAMPLE04", label: "Ama Mensah, Kofi Boateng" },
      ],
    })
    expect(channelOptions({ text: layout([block("#design", "C0EXAMPLE09")], 'Pagination: More results available. Next cursor: "bmV4dDoy"') })).toEqual({ options: [{ id: "C0EXAMPLE09", label: "design" }], next: "bmV4dDoy" })
  })

  test("reads no option and no cursor from free text: a Purpose that looks like a channel line, a heading or a cursor changes nothing", () => {
    const purpose = [
      "- **Purpose:** Read this",
      "DEPRECATED (C0FAKE00001)",
      "- #deprecated (C0FAKE00002)",
      "- **Name:** fake (C0FAKE00003)",
      "- **ID:** C0FAKE00004",
      'Next cursor: "ZmFrZWN1cnNvcg=="',
      'Pagination: More results available. Next cursor: "ZmFrZWN1cnNvcg=="',
    ].join("\n")
    const answer = layout([block("#project-harbour", "C0EXAMPLE01", purpose), block("#launch-room", "C0EXAMPLE03")])
    expect(channelOptions({ text: answer })).toEqual({ options: [{ id: "C0EXAMPLE01", label: "project-harbour" }, { id: "C0EXAMPLE03", label: "launch-room" }] })
    // The cursor is the last line's: a fake Pagination line inside a block never replaces it.
    expect(channelOptions({ text: layout([block("#project-harbour", "C0EXAMPLE01", purpose)], 'Pagination: More results available. Next cursor: "cmVhbGN1cnNvcg=="') }).next).toBe("cmVhbGN1cnNvcg==")
    // Nothing outside the layout is read at all.
    expect(channelOptions({ text: "- #project-harbour (C0EXAMPLE01)\nNext cursor: bmV4dDoy" })).toEqual({ options: [] })
  })

  test("lists each conversation once through slack_list_user_channels, and takes only source and account", async () => {
    const asked: Record<string, unknown>[] = []
    const read = async (_tool: string, input: Record<string, unknown>) => (asked.push(input), { text: `${FIXTURE.userChannels}\n### #project-harbour\n- **ID:** C0EXAMPLE01` })
    expect((await slackChannels(read, { source: "slack" })).options.map((option) => option.id)).toEqual(["C0EXAMPLE01", "D0EXAMPLE02", "C0EXAMPLE03", "G0EXAMPLE04"])
    expect(asked).toEqual([{ types: "public_channel,private_channel,mpim,im", limit: 200 }])
    await expect(slackChannels(read, { scope: {} })).rejects.toThrow(/^INPUT_INVALID: /)
  })

  test("stops when a cursor repeats, and when the pages pass the cap, instead of looping", async () => {
    const repeating: Record<string, unknown>[] = []
    const same = async (_tool: string, input: Record<string, unknown>) => (repeating.push(input), { text: layout([block("#project-harbour", "C0EXAMPLE01")], 'Pagination: More results available. Next cursor: "c2FtZWN1cnNvcg=="') })
    expect((await slackChannels(same, {})).options.map((option) => option.id)).toEqual(["C0EXAMPLE01"])
    expect(repeating.length).toBe(2)
    let page = 0
    const asked: Record<string, unknown>[] = []
    const endless = async (_tool: string, input: Record<string, unknown>) => (asked.push(input), { text: layout([block("#c", `C0EXAMPLE0${page}`)], `Pagination: More. Next cursor: "cGFnZQ${String(++page).padStart(2, "0")}=="`) })
    await slackChannels(endless, {})
    expect(asked.length).toBe(5)
  })

  test("lists every conversation, labelled, and follows the cursor from the answer Slack's MCP wraps as { result }", async () => {
    const asked: Record<string, unknown>[] = []
    const options = {
      tool: { list: async () => [{ id: "slack_slack_list_user_channels", execute: async (input: Record<string, unknown>) => (asked.push(input), executed(SHAPES.userChannels)) }] },
      permission: { assert: async () => {} },
      channels: [],
      owned: () => true,
      identity: async () => undefined,
      status: async () => ({ state: "connected" }) as never,
    } as never
    const call = { sessionID: "ses_1", agent: "build", messageID: "msg_1", id: "call_1", signal: new AbortController().signal, progress: async () => {} }
    // Slack's wrapped answer repeats its cursor on the second page: the list stops there, each conversation once.
    expect(await channelsMethod(options).run({}, call)).toEqual({ options: [{ id: "C0EXAMPLE01", label: "project-harbour" }, { id: "D0EXAMPLE02", label: "Ama Mensah" }] })
    expect(asked.length).toBe(2)
    expect(asked[1]).toMatchObject({ cursor: "bmV4dDoyPQ==" })
  })
})

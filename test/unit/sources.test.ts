// package.json's `sources` (source-contract version 1): the declaration as a consumer and the kit read it, the kit's
// report over the plugin's own reads (test/support/conformance.ts, offline), and the refusals of probe and thread_read
// the kit does not reach. Every id below is invented, or the placeholder U00CURRENTUSER.
import { describe, expect, test } from "bun:test"
import { assertDeclaration } from "@we-the-rebel-alliance/source-contract/conformance"
import { EVENTS_LIST as CONTRACT_EVENTS_LIST, PROBE as CONTRACT_PROBE, probeResultProblems } from "@we-the-rebel-alliance/source-contract/events"
import { toolsRpcIdProblems } from "@we-the-rebel-alliance/source-contract/tools-rpc"
import { PAGE_OUTPUT, signedInOf, type EventsToolOptions } from "../../src/events.js"
import { TOOLS_RPC_ID } from "../../src/host/tools-rpc.js"
import { identityOf } from "../../src/identity.js"
import { PROBE_ACTION, probeMethod, slackProbe, slackThread, threadMethod, THREAD_READ_ACTION } from "../../src/source.js"
import type { Status } from "../../src/status.js"
import { EVENTS_LIST, PROBE } from "../../src/tools.js"
import { executed, SHAPES } from "../support/answer-shapes.js"
import { FIXTURE, conformanceReports, declaredSources, declaredTools, installed } from "../support/conformance.js"

const WHO = signedInOf(identityOf(FIXTURE.authTest)!)
const [CHANNEL] = FIXTURE.optionChannels as [string]
const THREAD = `slack-thread:${CHANNEL}:1794477600.000100`
const PROFILE = { text: FIXTURE.profile }
const call = { sessionID: "ses_1", agent: "build", messageID: "msg_1", id: "call_1", signal: new AbortController().signal, progress: async () => {} }

describe("package.json's sources", () => {
  test("is three sources, read as a consumer reads an installed plugin, and passes Memory's schema and the kit's rules", () => {
    const descriptor = installed()
    expect(descriptor.package).toBe("@joe-broadhead/opencode-slack")
    expect(descriptor.hash).toMatch(/^sha256:[0-9a-f]{64}$/)
    const sources = declaredSources()
    expect(sources.items.map((item) => [item.id, item.kind, item.tool])).toEqual([
      ["slack.workspace", "events", "events_list"],
      ["slack.mentions", "events", "mentions_list"],
      ["slack.dms", "snapshot", "dms_list"],
    ])
    // Every source reads under its own operations: the Web API methods its reads call, as `<workspace>:<method>`.
    expect(Object.fromEntries(sources.items.map((item) => [item.id, item.permission.operations]))).toEqual({
      "slack.workspace": ["slack_read_user_profile", "slack_read_channel", "slack_read_thread"],
      "slack.mentions": ["slack_read_user_profile", "assistant.search.context"],
      "slack.dms": ["slack_read_user_profile", "users.conversations", "conversations.info", "conversations.history", "conversations.members", "users.info"],
    })
    for (const item of sources.items) expect({ id: item.id, identity: item.permission.identity, private: item.private, cost: item.cost }).toEqual({ id: item.id, identity: ["slack_read_user_profile"], private: true, cost: { class: "free" } })
    expect(() => assertDeclaration(sources, { tools: declaredTools() })).not.toThrow()
  })

  test("names the contract's methods as source-contract does, so the default rules and status need no source module", () => {
    expect([EVENTS_LIST, PROBE]).toEqual([CONTRACT_EVENTS_LIST, CONTRACT_PROBE])
  })

  test("names the tools RPC this plugin registers, and the probe action and detail read its methods assert", () => {
    const sources = declaredSources()
    expect(sources.rpc).toBe(TOOLS_RPC_ID)
    expect(toolsRpcIdProblems(sources.rpc, { id: TOOLS_RPC_ID })).toEqual([])
    expect(sources.probe).toEqual({ action: PROBE_ACTION })
    const [source] = sources.items
    expect(source!.kind === "events" && source!.details).toEqual([{ id: "slack.workspace.thread", tool: "thread_read", from: ["thread"] }])
    // thread_read's action is one of the source's operations, so the source's own grant covers it.
    expect(THREAD_READ_ACTION).toBe(`slack_${source!.permission.operations!.find((operation) => operation === "slack_read_thread")}`)
    expect(source!.permission.identity).toEqual(["slack_read_user_profile"])
  })

  test("passes the conformance kit for every source, with every check that applies run", async () => {
    const reports = await conformanceReports()
    expect(reports.map((report) => ({ source: report.source, problems: report.problems, incomplete: report.incomplete, ok: report.ok }))).toEqual(
      ["slack.workspace", "slack.mentions", "slack.dms"].map((source) => ({ source, problems: [], incomplete: false, ok: true })),
    )
    const checks = (index: number) => Object.fromEntries(reports[index]!.checks.map((check) => [check.name, check.notApplicable ? "n/a" : check.ran ? "ran" : "missing"]))
    expect(checks(0)).toMatchObject({ "page-result": "ran", "gap-and-cursor-expired": "ran", "refused-is-final": "ran", probe: "ran", details: "ran", suggest: "ran", "unused-grants": "ran", "failed-holds-cursor": "n/a" })
    expect(checks(1)).toMatchObject({ "page-result": "ran", "gap-and-cursor-expired": "ran", "refused-is-final": "ran", probe: "ran", "unused-grants": "ran", "failed-holds-cursor": "n/a" })
    expect(checks(2)).toMatchObject({ probe: "ran", "identity-grants": "ran", "unused-grants": "ran", "page-result": "n/a" })
  })
})

describe("probe", () => {
  test("names the workspace and the owner, reads only the profile, and checks the input first", async () => {
    const reads: string[] = []
    const read = async (tool: string) => (reads.push(tool), PROFILE)
    const answer = await slackProbe(read, WHO, {})
    // The label is auth.test's, as on every page and snapshot; the profile only confirms the user.
    expect(answer).toEqual({ source: "slack", account: "T0EXAMPLE01", owner: { id: "slack:U00CURRENTUSER", label: "pilot.owner" }, trust: "untrusted" })
    expect((await slackProbe(read, WHO, { source: "dms" })).source).toBe("dms")
    reads.length = 1
    expect(probeResultProblems(answer, { source: "slack", account: "T0EXAMPLE01" })).toEqual([])
    expect(reads).toEqual(["slack_read_user_profile"])
    await expect(slackProbe(read, WHO, { source: "gmail" })).rejects.toThrow(/^SOURCE_UNKNOWN: /)
    await expect(slackProbe(read, WHO, { account: "T0ANOTHER01" })).rejects.toThrow(/^ACCOUNT_UNKNOWN: /)
    await expect(slackProbe(read, WHO, { scope: {} })).rejects.toThrow(/^INPUT_INVALID: /)
    expect(reads).toEqual(["slack_read_user_profile"])
    const someoneElse = { text: FIXTURE.profile.replace("U00CURRENTUSER", "U012AB3CD") }
    await expect(slackProbe(async () => someoneElse, WHO, {})).rejects.toThrow(/^UNAVAILABLE: Slack's profile and its auth\.test name different users\./)
  })

  test("as a tools RPC method, asserts slack_probe first", async () => {
    const asserted: string[] = []
    const options = {
      tool: { list: async () => [{ id: "slack_slack_read_user_profile", execute: async () => ({ content: [{ type: "text", text: FIXTURE.profile }] }) }] },
      permission: { assert: async (input: { action: string }) => void asserted.push(input.action) },
      channels: [],
      owned: () => true,
      identity: async () => identityOf(FIXTURE.authTest),
      status: async () => ({ state: "connected" }) as unknown as Status,
    } as unknown as EventsToolOptions
    const method = probeMethod(options)
    expect([method.name, method.action, method.class]).toEqual(["probe", "slack_probe", "read"])
    expect(await method.run({}, call)).toMatchObject({ account: "T0EXAMPLE01" })
    expect(asserted).toEqual(["slack_probe"])
    expect(threadMethod(options, PAGE_OUTPUT)).toMatchObject({ name: "thread_read", action: "slack_slack_read_thread", class: "read" })
  })
})

describe("probe, on the profile as Slack's MCP wraps it ({ result: <Markdown> })", () => {
  const methodFor = (output: Record<string, unknown>) =>
    probeMethod({
      tool: { list: async () => [{ id: "slack_slack_read_user_profile", execute: async () => executed(output) }] },
      permission: { assert: async () => {} },
      channels: [],
      owned: () => true,
      identity: async () => identityOf(FIXTURE.authTest),
      status: async () => ({ state: "connected" }) as unknown as Status,
    } as unknown as EventsToolOptions)

  test("names the auth.test owner for every source that binds through it, mentions and dms included", async () => {
    const method = methodFor(SHAPES.profile)
    for (const source of ["mentions", "dms", "slack"]) {
      expect(await method.run({ source }, call)).toEqual({ source, account: "T0EXAMPLE01", owner: { id: "slack:U00CURRENTUSER", label: "pilot.owner" }, trust: "untrusted" })
    }
  })

  test("answers UNAVAILABLE when the wrapped profile names another user", async () => {
    const method = methodFor({ result: SHAPES.profile.result.replace("U00CURRENTUSER", "U012AB3CD") })
    await expect(method.run({ source: "mentions" }, call)).rejects.toThrow(/^UNAVAILABLE: Slack's profile and its auth\.test name different users\./)
  })

  test("still answers UPSTREAM_UNREADABLE when the wrapped profile has no User ID", async () => {
    const method = methodFor({ result: "# User profile\nReal Name: Pilot Owner" })
    await expect(method.run({ source: "mentions" }, call)).rejects.toThrow(/^UPSTREAM_UNREADABLE: Slack's slack_read_user_profile/)
  })
})

describe("thread_read", () => {
  const answer = async () => ({ text: "=== Message 1 of 1 ===\nFrom: Ama Mensah (ID: U012AB3CD)\nMessage TS: 1794477600.000100\nText: The parent.\n" })

  test("reads the event's thread inside the confirmed scope as a page bound to the thread", async () => {
    const page = await slackThread(answer, WHO, [], { account: WHO.account, scope: { channels: [CHANNEL] }, fields: { thread: THREAD } })
    expect(page).toMatchObject({ plugin: "@joe-broadhead/opencode-slack", source: "slack", account: "T0EXAMPLE01", scope: { channels: [CHANNEL] }, more: false })
    expect(page.events.map((event) => [event.external_id, event.thread])).toEqual([[`${CHANNEL}:1794477600.000100`, THREAD]])
    expect(page.cursor.length).toBeGreaterThan(0)
  })

  test("refuses a thread outside the scope or the events.channels option, and an input that names no thread, before reading", async () => {
    const reads: string[] = []
    const read = async (tool: string) => (reads.push(tool), answer())
    const outside = { scope: { channels: ["C0EXAMPLE03"] }, fields: { thread: THREAD } }
    await expect(slackThread(read, WHO, [], outside)).rejects.toThrow(/^PERMISSION_DENIED: .* Next step: /)
    await expect(slackThread(read, WHO, ["C0EXAMPLE03"], { scope: { channels: [CHANNEL] }, fields: { thread: THREAD } })).rejects.toThrow(/^PERMISSION_DENIED: /)
    await expect(slackThread(read, WHO, [], { scope: { channels: [CHANNEL] }, fields: { thread: "general" } })).rejects.toThrow(/^INPUT_INVALID: /)
    await expect(slackThread(read, WHO, [], { scope: { channels: [CHANNEL] }, fields: { thread: THREAD }, extra: 1 })).rejects.toThrow(/^INPUT_INVALID: /)
    await expect(slackThread(read, WHO, [], { account: "T0ANOTHER01", scope: { channels: [CHANNEL] }, fields: { thread: THREAD } })).rejects.toThrow(/^ACCOUNT_UNKNOWN: /)
    expect(reads).toEqual([])
  })
})

// source-contract's conformance kit, run over this plugin's own reads for each of its three sources (events_list,
// thread_read and channels_list; mentions_list; dms_list; and probe for each), as setup registers them, against Slack's
// answers from test/fixtures/conformance.json. No live call is made. Each read runs in
// the kit's recording permission: the plugin's own asserts go to it, and so does every Slack tool the fake host's
// executor runs (`slack_<tool>`, as OpenCode's executor asserts it), so declared must equal asserted.
// `npm run conformance` writes the report (reports/conformance-report.json); test/unit/sources.test.ts asserts it.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { sourceConformance, type ConformanceReport, type SessionContext, type SourceConformanceOptions, type ToolDeclaration } from "@we-the-rebel-alliance/source-contract/conformance"
import { encodeBoundCursor } from "@we-the-rebel-alliance/source-contract/cursor"
import { readInstalledDescriptor, type InstalledDescriptor } from "@we-the-rebel-alliance/source-contract/descriptor"
import { SOURCES_SCHEMA } from "@we-the-rebel-alliance/source-contract/schema"
import { eventsMethod, PAGE_OUTPUT, PLUGIN_NAME, SLACK_SOURCE, bindingOf, micros, tsOf, type EventsToolOptions } from "../../src/events.js"
import { METHODS, type ToolCall } from "../../src/host/tools-rpc.js"
import { identityOf } from "../../src/identity.js"
import { markReadMethod } from "../../src/mark-read.js"
import { channelsMethod, probeMethod, threadMethod } from "../../src/source.js"
import { dmsMethod } from "../../src/dms.js"
import { mentionsMethod } from "../../src/mentions.js"
import type { SlackApi, SlackApiMethod } from "../../src/slack-api.js"
import type { WebReadOptions } from "../../src/web-reads.js"
import { statusMethod } from "../../src/status-method.js"
import type { Status } from "../../src/status.js"

export const ROOT = join(import.meta.dir, "..", "..")

interface Message {
  readonly ts: string
  readonly user: string
  readonly name: string
  readonly text: string
  readonly thread?: string
  readonly replies?: number
}

export interface Fixture {
  readonly now: string
  readonly authTest: Record<string, unknown>
  readonly profile: string
  readonly optionChannels: readonly string[]
  readonly channels: Readonly<Record<string, readonly Message[]>>
  readonly threads: Readonly<Record<string, readonly Message[]>>
  readonly userChannels: string
  readonly webApi: Readonly<Record<string, unknown>>
}

export const FIXTURE = JSON.parse(readFileSync(join(ROOT, "test", "fixtures", "conformance.json"), "utf8")) as Fixture

/** A message as Slack's server writes it in Markdown. */
const block = (item: Message, index: number, total: number) =>
  [
    `=== Message ${index + 1} of ${total} ===`,
    `From: ${item.name} (ID: ${item.user})`,
    `Message TS: ${item.ts}`,
    ...(item.thread ? [`Thread TS: ${item.thread}`] : []),
    ...(item.replies ? [`Reply count: ${item.replies}`] : []),
    `Text: ${item.text}`,
    "",
  ].join("\n")

/** Slack's answer to slack_read_channel: newest first, after `oldest` and before `latest`, both exclusive. */
function channelAnswer(fixture: Fixture, input: Record<string, unknown>): string {
  const oldest = micros(String(input["oldest"] ?? "0.0"))
  const latest = input["latest"] === undefined ? undefined : micros(String(input["latest"]))
  const items = (fixture.channels[String(input["channel_id"])] ?? [])
    .filter((item) => micros(item.ts) > oldest && (latest === undefined || micros(item.ts) < latest))
    .sort((a, b) => (micros(b.ts) > micros(a.ts) ? 1 : -1))
  return items.map((item, index) => block(item, index, items.length)).join("\n")
}

/** Slack's answer to slack_read_thread: the parent, then its replies. */
function threadAnswer(fixture: Fixture, input: Record<string, unknown>): string {
  const items = fixture.threads[`${String(input["channel_id"])}:${String(input["message_ts"])}`] ?? []
  return items.map((item, index) => block(item, index, items.length)).join("\n")
}

const CONNECTED = { state: "connected" } as unknown as Status

/**
 * The plugin's source options for one kit call: the fake host's executors answer from the fixture and assert
 * `slack_<tool>` in the kit's session first, as OpenCode's executor does; the plugin's own asserts go there too.
 */
function sourceOptions(fixture: Fixture, context: SessionContext): EventsToolOptions {
  const answers: Record<string, (input: Record<string, unknown>) => string> = {
    slack_read_channel: (input) => channelAnswer(fixture, input),
    slack_read_thread: (input) => threadAnswer(fixture, input),
    slack_read_user_profile: () => fixture.profile,
    slack_list_user_channels: () => fixture.userChannels,
  }
  const tools = Object.entries(answers).map(([tool, answer]) => ({
    id: `slack_${tool}`,
    execute: async (input: Record<string, unknown>) => {
      // OpenCode's executor asserts the tool's own action before it calls Slack.
      const asserted = { action: `slack_${tool}`, resources: ["*"] }
      await context.permission.assert(asserted)
      return { content: [{ type: "text", text: answer(input) }] }
    },
  }))
  return {
    tool: { list: async () => tools as never },
    permission: {
      assert: async (input) => {
        const asserted = { action: input.action, resources: [...input.resources] }
        await context.permission.assert(asserted)
      },
    },
    channels: fixture.optionChannels,
    owned: () => true,
    identity: async () => identityOf(fixture.authTest),
    status: async () => CONNECTED,
    now: () => Date.parse(fixture.now),
  }
}

/**
 * Slack's Web API as the fixture records it, for the slack.mentions and slack.dms sources: the search filtered by its
 * `after`, and every other method's answer by the conversation or user it names. A recorded `error` is Slack's refusal.
 */
export function fakeApi(fixture: Fixture, calls: string[] = []): SlackApi {
  const answer = (method: SlackApiMethod, params: Readonly<Record<string, string>>): Record<string, unknown> => {
    const recorded = fixture.webApi[method]
    if (method === "assistant.search.context") {
      const after = Number(params["after"] ?? "0")
      const messages = (recorded as { message_ts: string }[]).filter((item) => Number(item.message_ts) > after)
      return { ok: true, results: { messages }, response_metadata: { next_cursor: "" } }
    }
    const keyed = recorded as Record<string, unknown>
    const key = params["channel"] ?? params["user"]
    return (key === undefined ? keyed : (keyed[key] ?? { ok: false, error: "channel_not_found" })) as Record<string, unknown>
  }
  return {
    credential: async () => "crd_conformance",
    granted: async () => undefined,
    call: async (method, params) => {
      calls.push(method)
      const body = answer(method, params)
      return typeof body["error"] === "string" ? { ok: false, error: body["error"] } : { ok: true, credential: "crd_conformance", body }
    },
  }
}

/** The Web API sources' options for one kit call: their asserts go to the kit's session, their calls to the fixture. */
function webOptions(fixture: Fixture, context: SessionContext): WebReadOptions {
  const events = sourceOptions(fixture, context)
  return { permission: events.permission, api: fakeApi(fixture), identity: events.identity, status: events.status, now: events.now! }
}

const call = (): ToolCall => ({ sessionID: "ses_conformance", agent: "build", messageID: "msg_conformance", id: "call_conformance", signal: new AbortController().signal, progress: async () => {} })

/** The plugin's tools RPC methods, as describe lists them: the tools a source may name, each read-only or not. */
export function declaredTools(): ToolDeclaration[] {
  const options = sourceOptions(FIXTURE, { account: "", permission: { assert: async () => {} } })
  const web = webOptions(FIXTURE, { account: "", permission: { assert: async () => {} } })
  const owned = [
    eventsMethod(options),
    probeMethod(options),
    threadMethod(options, PAGE_OUTPUT),
    channelsMethod(options),
    mentionsMethod(web),
    dmsMethod(web),
    markReadMethod({ permission: options.permission, api: undefined as never, status: options.status }),
    statusMethod(options.status),
  ]
  return [...METHODS, ...owned].map((method) => ({ id: method.name, readOnly: method.class === "read" }))
}

/** The repository's package.json, read as a consumer reads an installed plugin: checked, then hashed. */
export function installed(): InstalledDescriptor {
  const checked = readInstalledDescriptor(ROOT)
  if (!checked.ok) throw new Error(`package.json's sources: ${checked.problems.join("; ")}`)
  return checked.value
}

/** package.json's sources, as Memory's schema parses them for the kit. */
export function declaredSources() {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { sources: unknown }
  const checked = SOURCES_SCHEMA.check(pkg.sources)
  if (!checked.ok) throw new Error(`package.json's sources: ${checked.problems.join("; ")}`)
  return checked.value
}

/** The kit's report for every declared source. */
export async function conformanceReports(fixture: Fixture = FIXTURE): Promise<ConformanceReport[]> {
  // Read as a consumer reads it first (the frame, checked and hashed), then as the kit reads it (Memory's schema).
  installed()
  const sources = declaredSources()
  const account = String(fixture.authTest["team_id"])
  const now = Date.parse(fixture.now)
  const daysAgo = (days: number) => tsOf(BigInt(now - days * 86_400_000) * 1000n)
  const [first, second] = fixture.optionChannels as [string, string]
  const scope = { channels: [first, second] }
  const methods = (session: SessionContext) => {
    const options = sourceOptions(fixture, session)
    const web = webOptions(fixture, session)
    return {
      events: eventsMethod(options),
      probe: probeMethod(options),
      thread: threadMethod(options, PAGE_OUTPUT),
      channels: channelsMethod(options),
      mentions: mentionsMethod(web),
      dms: dmsMethod(web),
    }
  }
  const common = {
    plugin: PLUGIN_NAME,
    tools: declaredTools(),
    account,
    sources: { rpc: sources.rpc, probe: sources.probe },
    describe: { id: sources.rpc },
  }
  const probe = (input: Readonly<Record<string, unknown>>, session: SessionContext) => methods(session).probe.run(input, call())
  const byId: Record<string, Omit<SourceConformanceOptions, "plugin" | "source" | "tools">> = {
    "slack.workspace": {
      atomicPages: {
        reason:
          "slack_read_channel answers each page of a channel in one call: a message is listed whole or the call fails, and events_list fails with it, so no single message can fail on its own",
      },
      calls: {
        list: (input, session) => methods(session).events.run(input, call()),
        probe,
        details: { "slack.workspace.thread": (input, session) => methods(session).thread.run(input, call()) },
        suggest: (input, session) => methods(session).channels.run(input, call()),
      },
      cases: [
        { name: "a page of the confirmed channels, with a message that holds a secret refused", input: { source: SLACK_SOURCE, account, scope, since: "2026-11-12T00:00:00Z" } },
        { name: "the plugin's events.channels option without a scope", input: { since: "2026-11-12T00:00:00Z", limit: 2 } },
        { name: "an empty page still carries a cursor", input: { source: SLACK_SOURCE, scope, since: "2026-11-13T11:00:00Z" }, expect: "empty" },
        // A cursor 100 days old, for the whole source, which this source reads back only 90 days.
        { name: "a cursor older than this source reads back answers a gap and reads on", input: { cursor: encodeBoundCursor(bindingOf(account, undefined), { c: { [first]: daysAgo(100) } }) }, expect: "expired" },
        // A cursor of a two-channel scope, which a one-channel read must refuse.
        { name: "a cursor of another scope is refused", input: { scope: { channels: [first] }, cursor: encodeBoundCursor(bindingOf(account, scope), { c: { [first]: daysAgo(0.04) } }) }, expect: { refuses: "CURSOR_INVALID" } },
        { name: "a scope key this source does not declare is refused", input: { scope: { users: ["U00CURRENTUSER"] } }, expect: { refuses: "INPUT_INVALID" } },
        { name: "another workspace is refused", input: { account: "T0ANOTHER01" }, expect: { refuses: "ACCOUNT_UNKNOWN" } },
        { name: "another source is refused", input: { source: "gmail" }, expect: { refuses: "SOURCE_UNKNOWN" } },
      ],
      detailCases: [
        { id: "slack.workspace.thread", scope: { channels: [first] }, event: { thread: `slack-thread:${first}:1794477600.000100` } },
        { id: "slack.workspace.thread", scope: { channels: [first] }, event: { thread: "slack-thread:C0EXAMPLE03:1794485000.000100" }, expect: { refuses: "PERMISSION_DENIED" } },
      ],
    },
    "slack.mentions": {
      atomicPages: {
        reason: "assistant.search.context answers each page of mentions in one call: a mention is listed whole or the call fails, and mentions_list fails with it",
      },
      calls: { list: (input, session) => methods(session).mentions.run(input, call()), probe },
      cases: [
        { name: "the mentions since a day, with one that holds a secret refused and the user's own left out", input: { source: "mentions", account, since: "2026-11-12T00:00:00Z" } },
        { name: "the oldest mention, then more", input: { source: "mentions", since: "2026-11-12T00:00:00Z", limit: 1 } },
        { name: "an empty page still carries a cursor", input: { source: "mentions", since: "2026-11-13T11:00:00Z" }, expect: "empty" },
        { name: "a cursor older than this source reads back answers a gap and reads on", input: { cursor: encodeBoundCursor({ plugin: "slack", source: "mentions", account }, { t: daysAgo(100) }) }, expect: "expired" },
        { name: "the slack source's cursor is refused", input: { cursor: encodeBoundCursor(bindingOf(account, undefined), { c: {} }) }, expect: { refuses: "CURSOR_INVALID" } },
        { name: "a scope is refused: the mentions source has none", input: { scope: { channels: [first] } }, expect: { refuses: "INPUT_INVALID" } },
        { name: "another workspace is refused", input: { account: "T0ANOTHER01" }, expect: { refuses: "ACCOUNT_UNKNOWN" } },
        { name: "another source is refused", input: { source: "slack" }, expect: { refuses: "SOURCE_UNKNOWN" } },
      ],
    },
    "slack.dms": {
      calls: { probe, snapshot: (input, session) => methods(session).dms.run(input, call()) },
      snapshotCases: [{ source: "dms", account, limit: 10 }, { source: "dms", account, since: "2026-11-12T12:30:00Z" }],
    },
  }
  const reports: ConformanceReport[] = []
  for (const source of sources.items) {
    const options = byId[source.id]
    if (options === undefined) throw new Error(`${source.id} is declared and the conformance run has no calls for it`)
    reports.push(await sourceConformance({ ...common, ...options, source, tools: common.tools }))
  }
  return reports
}

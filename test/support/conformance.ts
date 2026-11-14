// source-contract's conformance kit, run over this plugin's own reads: events_list, probe and thread_read, as setup
// registers them, against Slack's answers from test/fixtures/conformance.json. No live call is made. Each read runs in
// the kit's recording permission: the plugin's own asserts go to it, and so does every Slack tool the fake host's
// executor runs (`slack_<tool>`, as OpenCode's executor asserts it), so declared must equal asserted.
// `npm run conformance` writes the report (reports/conformance-report.json); test/unit/sources.test.ts asserts it.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { sourceConformance, type ConformanceReport, type PageCase, type SessionContext, type ToolDeclaration } from "@we-the-rebel-alliance/source-contract/conformance"
import { encodeBoundCursor } from "@we-the-rebel-alliance/source-contract/cursor"
import { readInstalledDescriptor, type InstalledDescriptor } from "@we-the-rebel-alliance/source-contract/descriptor"
import { SOURCES_SCHEMA } from "@we-the-rebel-alliance/source-contract/schema"
import { eventsMethod, PAGE_OUTPUT, PLUGIN_NAME, SLACK_SOURCE, bindingOf, micros, tsOf, type EventsToolOptions } from "../../src/events.js"
import { METHODS, type ToolCall } from "../../src/host/tools-rpc.js"
import { identityOf } from "../../src/identity.js"
import { markReadMethod } from "../../src/mark-read.js"
import { probeMethod, threadMethod } from "../../src/source.js"
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

const call = (): ToolCall => ({ sessionID: "ses_conformance", agent: "build", messageID: "msg_conformance", id: "call_conformance", signal: new AbortController().signal, progress: async () => {} })

/** The plugin's tools RPC methods, as describe lists them: the tools a source may name, each read-only or not. */
export function declaredTools(): ToolDeclaration[] {
  const options = sourceOptions(FIXTURE, { account: "", permission: { assert: async () => {} } })
  const owned = [eventsMethod(options), probeMethod(options), threadMethod(options, PAGE_OUTPUT), markReadMethod({ permission: options.permission, api: undefined as never, status: options.status }), statusMethod(options.status)]
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
  const descriptor = { sources: declaredSources() }
  const account = String(fixture.authTest["team_id"])
  const now = Date.parse(fixture.now)
  const [first, second] = fixture.optionChannels as [string, string]
  const scope = { channels: [first, second] }
  // A cursor 100 days old, for the whole source, which this source reads back only 90 days.
  const expired = encodeBoundCursor(bindingOf(account, undefined), { c: { [first]: tsOf(BigInt(now - 100 * 86_400_000) * 1000n) } })
  // A cursor of a two-channel scope, which a one-channel read must refuse.
  const scoped = encodeBoundCursor(bindingOf(account, scope), { c: { [first]: tsOf(BigInt(now - 3_600_000) * 1000n) } })
  const cases: PageCase[] = [
    { name: "a page of the confirmed channels, with a message that holds a secret refused", input: { source: SLACK_SOURCE, account, scope, since: "2026-11-12T00:00:00Z" } },
    { name: "the plugin's events.channels option without a scope", input: { since: "2026-11-12T00:00:00Z", limit: 2 } },
    { name: "an empty page still carries a cursor", input: { source: SLACK_SOURCE, scope, since: "2026-11-13T11:00:00Z" }, expect: "empty" },
    { name: "a cursor older than this source reads back answers a gap and reads on", input: { cursor: expired }, expect: "expired" },
    { name: "a cursor of another scope is refused", input: { scope: { channels: [first] }, cursor: scoped }, expect: { refuses: "CURSOR_INVALID" } },
    { name: "a scope key this source does not declare is refused", input: { scope: { users: ["U00CURRENTUSER"] } }, expect: { refuses: "INPUT_INVALID" } },
    { name: "another workspace is refused", input: { account: "T0ANOTHER01" }, expect: { refuses: "ACCOUNT_UNKNOWN" } },
    { name: "another source is refused", input: { source: "gmail" }, expect: { refuses: "SOURCE_UNKNOWN" } },
  ]
  const reports: ConformanceReport[] = []
  for (const source of descriptor.sources.items) {
    const methods = (session: SessionContext) => {
      const options = sourceOptions(fixture, session)
      return { events: eventsMethod(options), probe: probeMethod(options), thread: threadMethod(options, PAGE_OUTPUT) }
    }
    reports.push(
      await sourceConformance({
        plugin: PLUGIN_NAME,
        source,
        tools: declaredTools(),
        account,
        sources: { rpc: descriptor.sources.rpc, probe: descriptor.sources.probe },
        describe: { id: descriptor.sources.rpc },
        atomicPages: {
          reason:
            "slack_read_channel answers each page of a channel in one call: a message is listed whole or the call fails, and events_list fails with it, so no single message can fail on its own",
        },
        calls: {
          list: (input, session) => methods(session).events.run(input, call()),
          probe: (input, session) => methods(session).probe.run(input, call()),
          details: { "slack.workspace.thread": (input, session) => methods(session).thread.run(input, call()) },
        },
        cases,
        detailCases: [
          { id: "slack.workspace.thread", scope: { channels: [first] }, event: { thread: `slack-thread:${first}:1794477600.000100` } },
          { id: "slack.workspace.thread", scope: { channels: [first] }, event: { thread: "slack-thread:C0EXAMPLE03:1794485000.000100" }, expect: { refuses: "PERMISSION_DENIED" } },
        ],
      }),
    )
  }
  return reports
}

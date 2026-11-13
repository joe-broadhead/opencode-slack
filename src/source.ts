import type { Plugin } from "@opencode/plugin"
import {
  PLUGIN_NAME,
  SLACK_SOURCE,
  channelPage,
  eventsError,
  messageEvent,
  profileOf,
  reader,
  type EventsToolOptions,
  type Read,
} from "./events.js"
import type { JsonSchema, OwnedMethod } from "./host/tools-rpc.js"

/**
 * The two reads contract version 1 adds beside `events_list` (app#2346 §2.2 and §2.3):
 *
 * - `probe` is the identity call, per source: the account and the owner, and no content. It replaces `events_list`'s
 *   `limit: 0`, which stays as a deprecated alias.
 * - `slack_read_detail` reads one event's detail: `{ account, scope, fields }`, the shape the contract's `details[]`
 *   entry names. It takes its channel from the event's own `thread` field and refuses a unit whose channel is not among
 *   the confirmed `channels`, with `PERMISSION_DENIED: … Next step: …`, before it calls Slack.
 */

/** The detail read's tools-RPC method: what `details[].tool` names. */
export const DETAIL_METHOD = "slack_read_detail"
/** The action it asserts. It is the operation the declaration lists, so a job's grant set covers it exactly. */
export const DETAIL_ACTION = "slack_slack_read_thread"
/** `probe`'s action: the identity operation the declaration lists. */
export const PROBE_ACTION = "slack_slack_read_user_profile"

/** `probe`: the account, the owner, and never any content. */
export async function slackProbe(read: Read): Promise<{ plugin: string; source: string; account: string; owner: { id: string; label: string }; trust: "untrusted" }> {
  const profile = profileOf(await read("slack_read_user_profile", {}))
  const account = profile.team ?? profile.host?.split(".")[0] ?? "default"
  return { plugin: PLUGIN_NAME, source: SLACK_SOURCE, account, owner: { id: profile.owner.id, label: profile.owner.label }, trust: "untrusted" }
}

/** The channel and ts a `details[]` entry's `from: ["thread"]` names: `slack-thread:<channel>:<ts>`. */
export function threadOf(fields: Readonly<Record<string, unknown>>): { channel: string; ts: string } {
  const thread = typeof fields["thread"] === "string" ? fields["thread"] : undefined
  const parts = thread === undefined ? null : /^slack-thread:([^:]+):([0-9]{9,11}\.[0-9]{1,6})$/.exec(thread)
  if (parts === null) {
    throw eventsError("SCHEMA_VIOLATION", "The detail call's thread field is not a Slack thread key.", "Call it with the event's own thread field, such as slack-thread:C0123ABCD45:1700000000.000100.")
  }
  return { channel: parts[1]!, ts: parts[2]! }
}

/**
 * The detail read: one event, as a page. A channel outside the confirmed scope is refused before any read, with the two
 * parts a person needs; so is a call whose thread field names no Slack thread.
 */
export async function slackDetail(read: Read, input: unknown): Promise<unknown> {
  const call = (input ?? {}) as { account?: unknown; scope?: unknown; fields?: unknown }
  const scope = typeof call.scope === "object" && call.scope !== null ? (call.scope as Record<string, unknown>) : {}
  const confirmed = Array.isArray(scope["channels"]) ? (scope["channels"] as unknown[]).filter((id): id is string => typeof id === "string") : []
  const fields = typeof call.fields === "object" && call.fields !== null ? (call.fields as Record<string, unknown>) : {}
  const { channel, ts } = threadOf(fields)
  if (!confirmed.includes(channel)) {
    throw eventsError(
      "PERMISSION_DENIED",
      `The thread's channel ${channel} is outside the confirmed scope, so this source will not read it.`,
      "Confirm that channel for this source, or leave out the event that names it.",
    )
  }
  const profile = profileOf(await read("slack_read_user_profile", {}))
  const account = profile.team ?? profile.host?.split(".")[0] ?? "default"
  const page = channelPage(await read("slack_read_thread", { channel_id: channel, message_ts: ts }))
  const message = page.messages.find((entry) => entry.ts === ts) ?? page.messages[0]
  if (message === undefined) {
    throw eventsError("UPSTREAM_UNREADABLE", `Slack answered no message for the thread ${ts} in ${channel}.`, "Read the thread directly to see Slack's answer, and run /slack-status.")
  }
  return {
    plugin: PLUGIN_NAME,
    source: SLACK_SOURCE,
    account,
    owner: { id: profile.owner.id, label: profile.owner.label },
    scope: { channels: [channel] },
    setup: "",
    events: [messageEvent(account, channel, message, profile.host)],
    cursor: "",
    more: false,
    refused: [],
    failed: [],
    trust: "untrusted",
  }
}

/** A method's run: assert its own action as the calling tool, then read. */
function method(name: string, action: string, description: string, input: JsonSchema, output: JsonSchema, options: EventsToolOptions, run: (read: Read, input: unknown, context: unknown) => Promise<unknown>): OwnedMethod {
  return {
    kind: "plugin",
    class: "read",
    name,
    action,
    description,
    input,
    output,
    run: async (value, call) => {
      const context = call as unknown as { sessionID: string; agent: string; messageID: string; id: string }
      // The same assert the tool path makes: this call's ask is turned into a deny by the tools RPC's evaluate hook.
      await (options.permission as Plugin.Context["permission"]).assert({
        sessionID: context.sessionID,
        agent: context.agent,
        action,
        resources: ["*"],
        source: { type: "tool", messageID: context.messageID, id: context.id },
      })
      return run(reader(options, context as never), value, context)
    },
    available: async () => {
      const current = await options.status().catch(() => undefined)
      return current === undefined || current.state === "connected" ? undefined : (current.code ?? current.state.toUpperCase())
    },
  }
}

/** `probe` as a tools RPC method: the identity read, asserting the operation the declaration lists. */
export function probeMethod(options: EventsToolOptions): OwnedMethod {
  return method(
    "probe",
    PROBE_ACTION,
    "The signed-in Slack account and owner for this source, and no content: the identity call.",
    { type: "object", additionalProperties: false, properties: { source: { type: "string" }, account: { type: "string" } } },
    { type: "object", required: ["account", "owner"] },
    options,
    async (read) => slackProbe(read),
  )
}

/** `slack_read_detail` as a tools RPC method: the contract's detail read, under the grant its operation gives. */
export function detailMethod(options: EventsToolOptions): OwnedMethod {
  return method(
    DETAIL_METHOD,
    DETAIL_ACTION,
    "One event's detail: the thread a message belongs to, read with the channel and timestamp the event's own thread field names, and refused outside the confirmed channels.",
    {
      type: "object",
      required: ["fields"],
      additionalProperties: false,
      properties: {
        account: { type: "string" },
        scope: { type: "object", properties: { channels: { type: "array", items: { type: "string" } } } },
        fields: { type: "object", required: ["thread"], properties: { thread: { type: "string" } } },
      },
    },
    { type: "object", required: ["source", "plugin", "events"] },
    options,
    async (read, value) => slackDetail(read, value),
  )
}

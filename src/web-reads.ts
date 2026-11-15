import type { Plugin } from "@opencode/plugin"
import { SERVER } from "./defaults.js"
import { eventsError, signedInOf, type Context, type SignedIn } from "./events.js"
import type { Identity } from "./identity.js"
import { NOT_SIGNED_IN, type SlackApi, type SlackApiMethod, type SlackApiResult } from "./slack-api.js"
import type { Status } from "./status.js"
import { WEB_READ } from "./tools.js"

/**
 * What the two Web API sources, `slack.mentions` (`mentions_list`) and `slack.dms` (`dms_list`), share: their options,
 * the one read path, how they wait out Slack's rate limit, and how Slack's refusals become the plugin's codes. After
 * @domeevans's structured reads (domeevans/opencode-slack#1).
 *
 * Each Web API call is a declared operation of its source: before it, the read asserts `slack.read` on
 * `<account>:<method>` (`T0123:assistant.search.context`), the rule source-contract derives for a dotted operation, so
 * a session fenced to the source's grant runs exactly these calls. The call goes through `slack-api.ts`, the only code
 * that reads the Slack token; every method here only reads.
 */

/** The permission action every Web API read asserts, on `<account>:<method>`. */
export const WEB_READ_ACTION = `${SERVER}.${WEB_READ}`

/** The Web API methods the sources read: every method of `SLACK_API_METHODS` but `auth.test` and `conversations.mark`. */
export type ReadMethod = Exclude<SlackApiMethod, "auth.test" | "conversations.mark">

export interface WebReadOptions {
  readonly permission: Pick<Plugin.Context["permission"], "assert">
  readonly api: Pick<SlackApi, "call">
  /** The signed-in account, from status's one `auth.test` per sign-in. */
  readonly identity: () => Promise<Identity | undefined>
  /** The status model, read only when there is no sign-in, for its code and next step. */
  readonly status: () => Promise<Status>
  /** Waits between rate-limited tries; tests pass their own. */
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>
  /** The clock; tests fix it. */
  readonly now?: () => number
}

/** How many times one request is tried again after Slack's rate limit, and the longest wait it follows. */
const RATE_RETRIES = 2
const MAX_RETRY_AFTER_S = 30

const defaultSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    const abort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort)
      resolve()
    }, ms)
    signal.addEventListener("abort", abort, { once: true })
  })

/** The signed-in account a Web API source reads for, or status's code while Slack cannot be called. */
export async function webSignedIn(options: Pick<WebReadOptions, "identity" | "status">, name: string): Promise<SignedIn & { readonly userId: string }> {
  const identity = await options.identity().catch(() => undefined)
  if (identity !== undefined) return { ...signedInOf(identity), userId: identity.userId }
  const current = await options.status().catch(() => undefined)
  if (current?.code !== undefined && current.state !== "connected") {
    throw eventsError(current.code, `${current.message.replace(/[.\s]+$/, "")}; ${name} cannot name the signed-in account.`, current.nextStep)
  }
  throw eventsError("UNAVAILABLE", "Slack's auth.test did not name the signed-in workspace and user.", `Run /slack-status; once it shows the Account, call ${name} again.`)
}

/** The plugin's error for a failed Web API read: status's code without a sign-in, a missing scope, a rate limit, or Slack's code. */
async function failure(options: Pick<WebReadOptions, "status">, name: string, method: string, result: Extract<SlackApiResult, { ok: false }>): Promise<Error> {
  if (result.error === NOT_SIGNED_IN) {
    const current = await options.status().catch(() => undefined)
    if (current?.code !== undefined && current.state !== "connected") {
      return eventsError(current.code, `${current.message.replace(/[.\s]+$/, "")}; ${name} cannot read Slack.`, current.nextStep)
    }
    return eventsError("AUTH_REQUIRED", `OpenCode has no Slack sign-in that ${name} can use.`, "Run /connect and choose Slack, then press o or Enter to open the sign-in page.")
  }
  if (result.error === "missing_scope") {
    const needed = result.needed ?? "the scope Slack names"
    return eventsError(
      "SCOPE_MISSING",
      `Slack refused ${method}: the Slack sign-in lacks the scope ${needed}.`,
      `Add ${needed} to the Slack app's user scopes and to the plugin's oauth.scopes if you set them, then sign in to Slack again.`,
    )
  }
  if (result.error === "feature_not_enabled") {
    // Slack's Real-time Search (assistant.search.context) is only for apps internal to the workspace or published in
    // the Slack Marketplace, and never for guests.
    return eventsError(
      "FEATURE_NOT_ENABLED",
      `Slack refused ${method} for ${name}: Real-time Search is not enabled for this Slack app, workspace or user.`,
      "Use a Slack app that is internal to your workspace or listed in the Slack Marketplace, signed in as a full member rather than a guest, then sign in again.",
    )
  }
  if (result.error === "ratelimited") {
    return eventsError("RATE_LIMITED", `Slack rate-limited ${method} for ${name}.`, `Call ${name} again in ${result.retryAfter === undefined ? "a minute" : `${result.retryAfter} seconds`}.`)
  }
  return eventsError("UPSTREAM_ERROR", `Slack's ${method} failed for ${name}: ${result.error}.`, `Call ${name} again in a minute, and run /slack-status if it keeps failing.`)
}

/** One Web API read: the method, its params, and Slack's codes that leave this one item out rather than fail the read. */
export type WebRead = (method: ReadMethod, params: Readonly<Record<string, string>>, skipped?: readonly string[]) => Promise<Readonly<Record<string, unknown>> | undefined>

/**
 * The read path of one call of `name` for `account`: each Web API read asserts `slack.read` on `<account>:<method>`
 * as the calling tool, then calls Slack, waiting out a rate limit of at most 30 seconds at most twice. A refused
 * assert reaches the caller untouched.
 */
export function webReader(options: WebReadOptions, context: Context, account: string, name: string): WebRead {
  return async (method, params, skipped = []) => {
    await options.permission.assert({
      sessionID: context.sessionID,
      agent: context.agent,
      action: WEB_READ_ACTION,
      resources: [`${account}:${method}`],
      source: { type: "tool", messageID: context.messageID, id: context.id },
    })
    for (let tries = 0; ; tries += 1) {
      const result = await options.api.call(method, params, context.signal)
      if (result.ok) return result.body
      if (skipped.includes(result.error)) return undefined
      const wait = result.error === "ratelimited" ? result.retryAfter : undefined
      if (wait !== undefined && wait <= MAX_RETRY_AFTER_S && tries < RATE_RETRIES) {
        await (options.sleep ?? defaultSleep)(wait * 1000, context.signal)
        continue
      }
      throw await failure(options, name, method, result)
    }
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
export const record = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {})
export const str = (value: unknown): string | undefined => (typeof value === "string" && value !== "" ? value : undefined)

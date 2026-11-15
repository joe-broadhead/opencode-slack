import type { SlackApi } from "./slack-api.js"

/**
 * The signed-in Slack account, as Slack's `auth.test` names it, never a token. Status shows only the ids; the source's
 * pages and its probe also name the user by `name` and link to the workspace's `host`.
 */
export interface Identity {
  /** The workspace, `T…` (an organisation-wide install answers with its `E…` id). */
  readonly teamId: string
  /** The signed-in user, `U…` or `W…`. */
  readonly userId: string
  /** The Enterprise Grid organisation, `E…`; absent for a workspace outside a grid. */
  readonly enterpriseId?: string
  /** The user's name, as `auth.test`'s `user` gives it; absent when Slack gives none. */
  readonly name?: string
  /** The workspace's address, such as `example.slack.com`, from `auth.test`'s `url`; absent when Slack gives none. */
  readonly host?: string
}

const TEAM_ID = /^[TE][A-Z0-9]{2,20}$/
const USER_ID = /^[UW][A-Z0-9]{2,20}$/
const ENTERPRISE_ID = /^E[A-Z0-9]{2,20}$/
/** A workspace's address in `auth.test`'s `url`: `https://<name>.slack.com/` or an Enterprise Grid one. */
const WORKSPACE_URL = /^https:\/\/([a-z0-9][a-z0-9-]*\.(?:enterprise\.)?slack\.com)\/?$/i
/** A name `auth.test` gives: one line, without control characters. */
const NAME = /^[^\u0000-\u001f\u007f]{1,200}$/
/** How long a failed `auth.test` is not tried again for the same credential. */
const RETRY_MS = 60_000
/**
 * How long status waits for a first `auth.test` before it answers without the account. The lookup goes on, so the next
 * status has it; a sign-in starts it at once, so it is usually known before anyone asks.
 */
export const STATUS_WAIT_MS = 2_000

/** `work`'s value, or undefined once `ms` have passed without one. */
function within<T>(work: Promise<T | undefined>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), ms) })
  return Promise.race([work, late]).finally(() => clearTimeout(timer))
}

/** The identity in an `auth.test` answer, or undefined when it does not have one in Slack's shape. */
export function identityOf(body: Readonly<Record<string, unknown>>): Identity | undefined {
  const { team_id: teamId, user_id: userId, enterprise_id: enterpriseId, user, url } = body
  if (typeof teamId !== "string" || !TEAM_ID.test(teamId) || typeof userId !== "string" || !USER_ID.test(userId)) return undefined
  const grid = enterpriseId === undefined || enterpriseId === null || enterpriseId === "" ? undefined : enterpriseId
  if (grid !== undefined && (typeof grid !== "string" || !ENTERPRISE_ID.test(grid))) return undefined
  const name = typeof user === "string" && NAME.test(user.trim()) ? user.trim() : undefined
  const host = typeof url === "string" ? WORKSPACE_URL.exec(url)?.[1]?.toLowerCase() : undefined
  return {
    teamId,
    userId,
    ...(grid === undefined ? {} : { enterpriseId: grid as string }),
    ...(name === undefined ? {} : { name }),
    ...(host === undefined ? {} : { host }),
  }
}

/**
 * The signed-in account for status: one `auth.test` per credential (a new sign-in is a new credential), shared by
 * concurrent reads. A failure gives no identity, never an error, and is tried again after a minute. With `wait`, `get`
 * answers within that many milliseconds, with no identity if Slack has not answered yet.
 */
export function workspaceIdentity(api: Pick<SlackApi, "credential" | "call">, now: () => number = Date.now) {
  let known: { readonly credential: string; readonly identity: Promise<Identity | undefined> } | undefined
  let failed: { readonly credential: string; readonly at: number } | undefined

  const read = async (credential: string): Promise<Identity | undefined> => {
    const result = await api.call("auth.test", {}).catch(() => undefined)
    const identity = result?.ok === true && result.credential === credential ? identityOf(result.body) : undefined
    if (identity === undefined) {
      failed = { credential, at: now() }
      if (known?.credential === credential) known = undefined
    }
    return identity
  }

  return {
    async get(wait?: number): Promise<Identity | undefined> {
      const credential = await api.credential().catch(() => undefined)
      if (credential === undefined) return undefined
      if (known?.credential !== credential) {
        if (failed?.credential === credential && now() - failed.at < RETRY_MS) return undefined
        known = { credential, identity: read(credential) }
      }
      return wait === undefined ? known.identity : within(known.identity, wait)
    },
  }
}

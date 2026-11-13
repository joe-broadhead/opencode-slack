// Checks, live, that the token from Slack's MCP sign-in is accepted by Slack's Web API for the plugin's two calls,
// `auth.test` and `conversations.mark`. Run by hand, never by `npm run check` or CI:
//
//   bun scripts/live-web-api.ts --home <scratch folder> --client-id <Slack app client ID> [--url-file <path>]
//   add --mark <conversation id> [--ts <message ts>] to also call conversations.mark on that one conversation
//   add --scopes <a,b,c> to sign in with other user scopes (conversations.mark needs the conversation type's :write)
//   add --no-open to skip opening the sign-in URL in the machine's desktop browser, --keep-browser to leave it open,
//   --timeout <minutes> to wait longer for the sign-in (default 20), and --out <path> to also write the report there
//
// It builds the plugin and runs it in an embedded OpenCode host whose home, config, database and project all live in
// the scratch folder, so no one's own OpenCode setup is read or changed. OpenCode does the sign-in: the script asks it
// for the `slack` server's sign-in URL, writes that URL to --url-file (mode 0600, never the log) and opens it in the
// desktop browser. OpenCode's attempt expires after about ten minutes. The callback goes to a loopback port on this
// machine, so the browser must run on this machine (its desktop).
//
// Signed in, it calls the plugin's own tools RPC methods, as a script would: `status` (whose account comes from
// `auth.test`) and, only with --mark, `mark_read` on exactly the conversation given (with --ts, or up to now). The
// script never chooses a conversation. It watches the plugin's requests to https://slack.com/api/ in this process and
// refuses, before it is sent, any other method and any conversations.mark for another conversation. It records only
// each request's method, HTTP status, Slack's `ok` and `error`, and the `x-oauth-scopes` and `x-accepted-oauth-scopes`
// headers: never a token, an id, a user or team name, a message or a channel name. It never reads the Authorization
// header's value, only whether one was sent.
import { spawnSync } from "node:child_process"
import { chmodSync, closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export const SLACK_API = "https://slack.com/api/"
const CONVERSATION_ID = /^[CDG][A-Z0-9]{8,12}$/
const TS = /^\d{9,11}\.\d{6}$/
const SCOPE_LIST = /^[a-z][a-z0-9:._-]{0,63}(?:,[a-z][a-z0-9:._-]{0,63}){0,30}$/
const SLACK_CODE = /^[a-z][a-z0-9_]{0,63}$/
const PLUGIN_CODE = /^[A-Z][A-Z0-9_]{1,40}$/
/** Anything that looks like a Slack token, which a report never holds. */
const TOKEN_LIKE = /xox[a-z]?[.-]/i

export interface ApiCall {
  readonly method: string
  readonly status: number
  readonly bearer: boolean
  readonly ok: boolean | null
  readonly error: string | null
  readonly scopes: string | null
  readonly acceptedScopes: string | null
}

export interface Report {
  readonly note: string
  readonly host: string
  readonly calls: readonly ApiCall[]
  readonly status: { readonly state: string; readonly account: { readonly teamId: boolean; readonly userId: boolean; readonly enterpriseId: boolean } | null }
  readonly markRead: { readonly asked: boolean; readonly outcome: "ok" | "refused" | null; readonly code: string | null }
  readonly refused: readonly string[]
}

/** A scope header's value if it is a plain comma-separated list of scope names, else null. */
const scopeHeader = (value: string | null) => {
  const compact = value?.replace(/\s+/g, "") ?? ""
  return compact !== "" && SCOPE_LIST.test(compact) ? compact : null
}

/**
 * Why a request to Slack's Web API must not be sent, or undefined if it may: only auth.test, and conversations.mark
 * only for the conversation the person named.
 */
export function refusal(method: string, body: string, mark: string | undefined): string | undefined {
  if (method === "auth.test") return undefined
  if (method !== "conversations.mark") return `a request to ${/^[a-z]+(?:\.[a-zA-Z]+)+$/.test(method) ? method : "another Web API method"}`
  if (mark === undefined) return "conversations.mark without --mark"
  if (new URLSearchParams(body).get("channel") !== mark) return "conversations.mark for a conversation other than --mark's"
  return undefined
}

/** One recorded call: Slack's answer reduced to its `ok`, its error code and the scope headers. */
export function record(method: string, response: { status: number; headers: Headers }, bearer: boolean, body: unknown): ApiCall {
  const answer = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {}
  const error = typeof answer["error"] === "string" && SLACK_CODE.test(answer["error"]) ? answer["error"] : null
  return {
    method,
    status: response.status,
    bearer,
    ok: typeof answer["ok"] === "boolean" ? answer["ok"] : null,
    error,
    scopes: scopeHeader(response.headers.get("x-oauth-scopes")),
    acceptedScopes: scopeHeader(response.headers.get("x-accepted-oauth-scopes")),
  }
}

/** Replaces `globalThis.fetch` so every request to Slack's Web API is checked first and recorded after. */
export function tap(mark: string | undefined, real: typeof fetch = globalThis.fetch) {
  const calls: ApiCall[] = []
  const refused: string[] = []
  const wrapped = (async (input: string | URL | Request, init?: RequestInit) => {
    const href = input instanceof Request ? input.url : String(input)
    if (!href.startsWith(SLACK_API)) return real(input, init)
    const method = new URL(href).pathname.slice("/api/".length)
    const body = typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : ""
    const why = refusal(method, body, mark)
    if (why !== undefined) {
      refused.push(why)
      throw new Error(`live-web-api: refused ${why}`)
    }
    const bearer = /^Bearer \S/.test(new Headers(init?.headers).get("authorization") ?? "")
    const response = await real(input, init)
    const parsed = await response.clone().json().catch(() => undefined)
    calls.push(record(method, response, bearer, parsed))
    return response
  }) as typeof fetch
  globalThis.fetch = Object.assign(wrapped, { preconnect: real.preconnect })
  return { calls, refused, restore: () => void (globalThis.fetch = real) }
}

/** Throws if the report holds anything shaped like a Slack token. */
export function assertNoSecrets(text: string): void {
  if (TOKEN_LIKE.test(text)) throw new Error("live-web-api: the report holds something shaped like a Slack token; nothing was written")
}

/** The plugin code in a tools RPC refusal, whatever shape the client gives it, or null. */
function codeOf(value: unknown): string | null {
  const text = value instanceof Error ? `${value.message} ${JSON.stringify(value)}` : JSON.stringify(value ?? null)
  const code = /"code"\s*:\s*"([A-Z][A-Z0-9_]+)"/.exec(text)?.[1] ?? /\b([A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+)\b/.exec(text)?.[1]
  return code !== undefined && PLUGIN_CODE.test(code) ? code : null
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

async function until<T>(what: string, check: () => Promise<T | undefined | false>, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await check()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`live-web-api: timed out waiting until ${what}`)
    await sleep(500)
  }
}

interface Options {
  readonly root: string
  readonly home: string
  readonly clientId: string
  readonly scopes?: readonly string[]
  readonly mark?: string
  readonly ts?: string
  readonly urlFile?: string
  readonly open?: (url: string) => void
  readonly log: (line: string) => void
  readonly timeoutMs: number
}

export async function check(options: Options): Promise<Report> {
  const project = join(options.home, "project")
  mkdirSync(project, { recursive: true })
  spawnSync("git", ["init", "--quiet", project])
  const oauth = { client_id: options.clientId, ...(options.scopes ? { scopes: options.scopes } : {}) }
  writeFileSync(join(project, "opencode.jsonc"), JSON.stringify({
    providers: { lmstudio: { settings: { baseURL: "" } }, ollama: { settings: { baseURL: "" } }, vllm: { settings: { baseURL: "" } } },
    plugins: [{ package: options.root, options: { oauth } }],
  }, null, 2))
  // The tap goes in before OpenCode loads, so the plugin's requests pass through it.
  const watch = tap(options.mark)
  const sdk = join(options.root, "node_modules", "@opencode", "sdk")
  const version = (JSON.parse(readFileSync(join(sdk, "package.json"), "utf8")) as { version: string }).version
  const { OpenCode } = (await import(pathToFileURL(join(sdk, "dist", "index.js")).href)) as typeof import("@opencode/sdk")
  const configDir = join(options.home, "config")
  mkdirSync(configDir, { recursive: true })
  const client = await OpenCode.create({
    app: { version },
    config: { directory: configDir, project: true, claude: false },
    database: { path: join(options.home, "opencode.db") },
    models: { fetch: false },
    fs: { filewatcher: false },
    log: { level: "error" },
  })
  const location = { directory: project }
  type Row = { name: string; integrationID?: string; status: { status: string } }
  const row = async () => ((await client.mcp.list({ location })).data as Row[]).find((server) => server.name === "slack")
  try {
    const first = await until("the slack server has left pending", async () => {
      const found = await row()
      return found && found.status.status !== "pending" ? found : undefined
    }, 120_000)
    if (first.status.status === "needs_auth") {
      if (!first.integrationID) throw new Error("live-web-api: OpenCode lists no sign-in for the slack server")
      const { data: integration } = await client.integration.get({ integrationID: first.integrationID, location })
      const method = (integration as { methods: { id: string; type: string }[] }).methods.find((item) => item.type === "oauth")
      if (!method) throw new Error("live-web-api: the slack sign-in has no OAuth method")
      const flow = (client.integration as unknown as { oauth: Record<"connect" | "cancel", (input: object) => Promise<{ data: { attemptID: string; url: string } }>> }).oauth
      const { data: attempt } = await flow.connect({ integrationID: first.integrationID, methodID: method.id, location })
      const page = new URL(attempt.url)
      options.log(`sign-in page: ${page.origin}${page.pathname}`)
      if (options.urlFile) {
        writeFileSync(options.urlFile, `${attempt.url}\n`, { mode: 0o600 })
        chmodSync(options.urlFile, 0o600)
        options.log(`the full sign-in URL is in ${options.urlFile}; OpenCode's attempt expires in about ten minutes`)
      }
      options.open?.(attempt.url)
      options.log("waiting for the sign-in to finish in the browser")
      try {
        await until("the sign-in finishes and the server connects", async () => (await row())?.status.status === "connected", options.timeoutMs)
      } catch (error) {
        await flow.cancel({ integrationID: first.integrationID, attemptID: attempt.attemptID, location }).catch(() => undefined)
        throw error
      }
    } else if (first.status.status !== "connected") {
      throw new Error(`live-web-api: the slack server is ${first.status.status}`)
    }
    options.log("connected; calling status")
    const session = await client.sessions.create({ agent: "build", location })
    const call = async (method: string, input: object) => {
      try {
        return { output: (await client.rpc.call({ rpcID: "slack.workspace.tools", method, input: { sessionID: session.id, input } as never, location })).output as unknown }
      } catch (error) {
        return { failure: error }
      }
    }
    type StatusOut = { state?: string; account?: { teamId?: string; userId?: string; enterpriseId?: string } }
    // Status waits about 2 s for auth.test; ask again until the account is there or auth.test has answered.
    let current: StatusOut = {}
    for (let attempt = 0; attempt < 15; attempt++) {
      current = ((await call("status", {})).output ?? {}) as StatusOut
      if (current.account !== undefined || watch.calls.some((item) => item.method === "auth.test")) break
      await sleep(1_000)
    }
    if (current.account === undefined) current = ((await call("status", {})).output ?? {}) as StatusOut
    let markRead: Report["markRead"] = { asked: false, outcome: null, code: null }
    if (options.mark !== undefined) {
      const ts = options.ts ?? `${Math.floor(Date.now() / 1000)}.000000`
      options.log("calling mark_read on the conversation given with --mark")
      const result = await call("mark_read", { channel_id: options.mark, ts })
      markRead = "failure" in result || (typeof result.output === "object" && result.output !== null && "error" in result.output)
        ? { asked: true, outcome: "refused", code: codeOf("failure" in result ? result.failure : result.output) }
        : { asked: true, outcome: "ok", code: null }
    }
    const account = current.account
    return {
      note: "From scripts/live-web-api.ts with a Slack MCP sign-in: status codes, Slack's ok and error, and the scope headers only. No token, id, name, message or channel name.",
      host: version,
      calls: [...watch.calls],
      status: {
        state: typeof current.state === "string" && /^[a-z_]{1,40}$/.test(current.state) ? current.state : "unknown",
        account: account === undefined ? null : { teamId: account.teamId !== undefined, userId: account.userId !== undefined, enterpriseId: account.enterpriseId !== undefined },
      },
      markRead,
      refused: [...watch.refused],
    }
  } finally {
    await client.close().catch(() => undefined)
    watch.restore()
  }
}

async function main(argv: readonly string[]) {
  const flag = (name: string) => argv.includes(name)
  const value = (name: string) => {
    const index = argv.indexOf(name)
    return index === -1 ? undefined : argv[index + 1]
  }
  const given = value("--home")
  const clientId = value("--client-id")
  const mark = value("--mark")
  const ts = value("--ts")
  const scopes = value("--scopes")
  const usage = "usage: bun scripts/live-web-api.ts --home <scratch folder> --client-id <id> [--mark <conversation id> [--ts <ts>]] [--scopes <a,b>] [--url-file <path>] [--out <path>] [--no-open] [--keep-browser] [--timeout <minutes>]"
  const problems = [
    given ? undefined : "--home is required",
    clientId ? undefined : "--client-id is required",
    mark === undefined || CONVERSATION_ID.test(mark) ? undefined : "--mark must be a conversation id such as C0123ABCD45 or D0123ABCD45",
    ts === undefined || (mark !== undefined && TS.test(ts)) ? undefined : "--ts needs --mark, and must be a message ts such as 1700000000.000100",
    scopes === undefined || SCOPE_LIST.test(scopes) ? undefined : "--scopes must be scope names separated by commas",
  ].filter((problem) => problem !== undefined)
  if (problems.length > 0) {
    console.error(`${problems.join("\n")}\n${usage}`)
    process.exit(2)
  }
  const root = fileURLToPath(new URL("..", import.meta.url))
  const home = resolve(given!)
  mkdirSync(home, { recursive: true, mode: 0o700 })
  // The desktop browser keeps the caller's environment; OpenCode gets only the scratch folder's.
  const caller = { ...process.env }
  for (const key of Object.keys(process.env)) if (!["PATH", "LANG", "TZ", "TERM"].includes(key) && !key.startsWith("BUN_")) delete process.env[key]
  const userHome = join(home, "home")
  Object.assign(process.env, {
    HOME: userHome,
    OPENCODE_TEST_HOME: userHome,
    XDG_CONFIG_HOME: join(userHome, ".config"),
    XDG_DATA_HOME: join(userHome, ".local", "share"),
    XDG_CACHE_HOME: join(userHome, ".cache"),
    XDG_STATE_HOME: join(userHome, ".local", "state"),
    TMPDIR: join(home, "tmp"),
  })
  for (const dir of [userHome, join(home, "tmp")]) mkdirSync(dir, { recursive: true })
  const build = spawnSync("bun", [join(root, "scripts", "build.ts")], { cwd: root, stdio: "inherit", env: caller })
  if (build.status !== 0) process.exit(build.status ?? 1)

  const browser = ["--session", "slack-signin", "--profile", join(home, "browser")]
  const urlFile = value("--url-file") ? resolve(value("--url-file")!) : undefined
  const display = { ...caller, DISPLAY: caller["DISPLAY"] ?? ":100" }
  const browserLog = join(home, "browser.log")
  const open = flag("--no-open")
    ? undefined
    : (url: string) => {
        const out = openSync(browserLog, "a", 0o600)
        const launched = spawnSync("agent-browser", [...browser, "open", url], { env: display, stdio: ["ignore", out, out], timeout: 120_000 })
        closeSync(out)
        if (launched.status === 0) return void console.log("Opened the sign-in page in the machine's desktop browser (boxd console: Open, then Desktop).")
        console.error(`live-web-api: the desktop browser did not open (agent-browser ${launched.error ? launched.error.message : `exited ${launched.status}`}); see ${browserLog}.`)
        console.error(urlFile ? `Open the URL in ${urlFile} in a browser on this machine.` : "Run again with --url-file <path>, and open that URL in a browser on this machine.")
      }
  const report = await check({
    root,
    home,
    clientId: clientId!,
    ...(scopes ? { scopes: scopes.split(",") } : {}),
    ...(mark ? { mark } : {}),
    ...(ts ? { ts } : {}),
    ...(urlFile ? { urlFile } : {}),
    ...(open ? { open } : {}),
    log: (line) => console.log(line),
    timeoutMs: Number(value("--timeout") ?? 20) * 60_000,
  }).finally(() => {
    if (open && !flag("--keep-browser")) spawnSync("agent-browser", [...browser, "close"], { env: display, stdio: "ignore", timeout: 30_000 })
  })
  const text = `${JSON.stringify(report, null, 2)}\n`
  assertNoSecrets(text)
  const out = value("--out")
  if (out) writeFileSync(resolve(out), text, { mode: 0o600 })
  console.log(text)
  const authTest = report.calls.find((item) => item.method === "auth.test")
  const accepted = authTest?.ok === true && (!report.markRead.asked || report.markRead.outcome === "ok")
  console.log(accepted ? "Slack's Web API accepted the MCP sign-in's token." : "Not confirmed: see the calls above.")
  process.exitCode = accepted ? 0 : 1
}

if (import.meta.main) {
  await main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message.split("\n")[0]!.slice(0, 200) : String(error))
    process.exit(1)
  })
}

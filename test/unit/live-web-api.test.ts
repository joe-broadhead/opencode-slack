// The live Web API check's guard, offline: what it lets through to slack.com/api and what it records. The live run
// itself is manual (docs/live-check.md). Every token and id below is invented.
import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { assertNoSecrets, record, refusal, tap, writePrivate } from "../../scripts/live-web-api.js"

const DM = "D0DM0000001"
const realFetch = globalThis.fetch
afterEach(() => void (globalThis.fetch = realFetch))

describe("refusal", () => {
  test("lets auth.test through, and conversations.mark only for the conversation given with --mark", () => {
    expect(refusal("auth.test", "", undefined)).toBeUndefined()
    expect(refusal("conversations.mark", `channel=${DM}&ts=1700000000.000100`, DM)).toBeUndefined()
    expect(refusal("conversations.mark", `channel=${DM}&ts=1700000000.000100`, undefined)).toBe("conversations.mark without --mark")
    expect(refusal("conversations.mark", "channel=C0OTHER00001&ts=1700000000.000100", DM)).toBe("conversations.mark for a conversation other than --mark's")
  })

  test.each(["chat.postMessage", "conversations.history", "users.info", "auth.revoke"])("refuses %s", (method) => {
    expect(refusal(method, "", DM)).toBe(`a request to ${method}`)
  })
})

describe("record", () => {
  test("keeps the status, Slack's ok and error, and the scope headers, and nothing else", () => {
    const headers = new Headers({ "x-oauth-scopes": "channels:history, users:read", "x-accepted-oauth-scopes": "im:write" })
    const body = { ok: false, error: "missing_scope", needed: "im:write", user: "sam", team: "Acme", team_id: "T0TEAM0001" }
    expect(record("conversations.mark", { status: 200, headers }, true, body)).toEqual({
      method: "conversations.mark", status: 200, bearer: true, ok: false, error: "missing_scope", scopes: "channels:history,users:read", acceptedScopes: "im:write",
    })
  })

  test("drops an error or a scope header that is not in Slack's shape", () => {
    const headers = new Headers({ "x-oauth-scopes": "xoxp-1-INVENTED <b>" })
    expect(record("auth.test", { status: 500, headers }, false, { ok: true, error: "Not A Code" })).toMatchObject({ ok: true, error: null, scopes: null, acceptedScopes: null })
    expect(record("auth.test", { status: 502, headers: new Headers() }, false, undefined)).toMatchObject({ status: 502, ok: null, error: null })
  })
})

describe("tap", () => {
  test("refuses a request before it is sent, and passes other hosts through untouched", async () => {
    const sent: string[] = []
    const fake = (async (input: string | URL | Request) => {
      sent.push(String(input))
      return new Response(JSON.stringify({ ok: true, user: "sam" }), { headers: { "x-oauth-scopes": "users:read" } })
    }) as typeof fetch
    const watch = tap(undefined, fake)
    await expect(fetch("https://slack.com/api/chat.postMessage", { method: "POST", body: "text=hi" })).rejects.toThrow("refused")
    await expect(fetch("https://slack.com/api/conversations.mark", { method: "POST", body: `channel=${DM}` })).rejects.toThrow("refused")
    await fetch("https://slack.com/api/auth.test", { method: "POST", body: "", headers: { authorization: "Bearer xoxe.xoxp-1-INVENTED" } })
    await fetch("https://mcp.slack.com/mcp", { method: "POST" })
    watch.restore()
    expect(sent).toEqual(["https://slack.com/api/auth.test", "https://mcp.slack.com/mcp"])
    expect(watch.calls).toEqual([{ method: "auth.test", status: 200, bearer: true, ok: true, error: null, scopes: "users:read", acceptedScopes: null }])
    expect(watch.refused).toEqual(["a request to chat.postMessage", "conversations.mark without --mark"])
    expect(JSON.stringify(watch.calls)).not.toContain("sam")
  })
})

test("assertNoSecrets refuses a report with anything shaped like a Slack token", () => {
  expect(() => assertNoSecrets('{"x":"xoxe.xoxp-1-INVENTED"}')).toThrow("Slack token")
  expect(() => assertNoSecrets('{"ok":true}')).not.toThrow()
})

test("writePrivate leaves the file at mode 0600, also when it already existed with a wider mode", () => {
  const dir = mkdtempSync(join(tmpdir(), "live-web-api-"))
  try {
    const fresh = join(dir, "report.json")
    writePrivate(fresh, "{}\n")
    expect(statSync(fresh).mode & 0o777).toBe(0o600)
    const existing = join(dir, "existing.json")
    writeFileSync(existing, "old\n", { mode: 0o644 })
    writePrivate(existing, "{}\n")
    expect(statSync(existing).mode & 0o777).toBe(0o600)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

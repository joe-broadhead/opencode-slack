import { readFileSync } from "node:fs"
import { describe, expect, it } from "bun:test"

/**
 * The committed capture (`test/fixtures/live-tools.json`) is a live one of Slack's server. The release kit's drift check
 * (`scripts/check-drift.mjs`: the kit tests run it in `npm run check`, and the release build runs it as a gate) checks
 * the declaration, the registry and `provenance.json` against it, and fails an identity phrase followed by a real id.
 * Kept here: the capture is live, of Slack's own server, and Slack's own member-ID rule, which also requires that the
 * capture still has the phrases Slack writes, each with the placeholder.
 */

const NAMESPACE = "slack"

const read = <T>(path: string): T => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")) as T
const capture = read<{ evidence: string; server: string }>("test/fixtures/live-tools.json")

describe("the declaration against the live tool list", () => {
  it("is a live capture of this plugin's own server, never a names-only one", () => {
    expect(capture.evidence).toBe("live-observed")
    expect(capture.server).toBe(NAMESPACE)
  })

  it("records no signed-in account's member ID: Slack writes it into descriptions, and the capture keeps a placeholder", () => {
    const text = readFileSync(new URL("../../test/fixtures/live-tools.json", import.meta.url), "utf8")
    const ids = [...text.matchAll(/(?:user_id is|Your user_id:)\s*`?([A-Z0-9]+)/g)].map((match) => match[1])
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.filter((id) => id !== "U00CURRENTUSER")).toEqual([])
  })
})

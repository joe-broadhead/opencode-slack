import { readFileSync } from "node:fs"
import { describe, expect, it } from "bun:test"

/**
 * The declaration against the provider's own tool list, captured live (`test/fixtures/live-tools.json`, with
 * `provenance.json`). Jelly enforces `jelly.tools` without loading the plugin, so every tool the server serves is
 * declared with its true `readOnly`, and every declared tool is served, is the plugin's own, or is gated by plan,
 * scope or account with a reason in `test/fixtures/tool-registry.json` and a note on the declared tool. A `readOnly`
 * that differs from the server's `readOnlyHint` needs a `readOnlyOverride` with a reason there. The family kit's drift
 * check reads the same three files and will replace this test.
 */

const NAMESPACE = "slack"

type Tool = { name: string; permission: string; effect: string; readOnly?: boolean; note?: string }
type Served = { name: string; readOnlyHint: boolean | null }
type Entry = { availability?: "plan" | "scope" | "account"; reason?: string; readOnlyOverride?: { value: boolean; reason: string } }
type Registry = { own?: string[]; tools?: Record<string, Entry> }

const read = <T>(path: string): T => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")) as T
const declared = read<{ jelly: { tools: Tool[] } }>("package.json").jelly.tools
const capture = read<{ evidence: string; listedAt: string; server: string; count: number; tools: Served[] }>("test/fixtures/live-tools.json")
const provenance = read<{ live: { fixture: string; listedAt: string } }>("test/fixtures/provenance.json")
const registry = read<Registry>("test/fixtures/tool-registry.json")

const short = (permission: string) => permission.slice(NAMESPACE.length + 1)
const served = new Map(capture.tools.map((tool) => [tool.name, tool]))
const own = new Set(registry.own ?? [])
const entry = (name: string): Entry => registry.tools?.[name] ?? {}

describe("the declaration against the live tool list", () => {
  it("is a live capture of this plugin's server, as provenance.json records it", () => {
    expect(capture.evidence).toBe("live-observed")
    expect(capture.server).toBe(NAMESPACE)
    expect(capture.count).toBe(capture.tools.length)
    expect(provenance.live).toEqual({ fixture: "live-tools.json", listedAt: capture.listedAt })
  })

  it("records no signed-in account's member ID: Slack writes it into descriptions, and the capture keeps a placeholder", () => {
    const text = readFileSync(new URL("../../test/fixtures/live-tools.json", import.meta.url), "utf8")
    const ids = [...text.matchAll(/(?:user_id is|Your user_id:)\s*`?([A-Z0-9]+)/g)].map((match) => match[1])
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.filter((id) => id !== "U00CURRENTUSER")).toEqual([])
  })

  it("names every tool in the plugin's namespace", () => {
    for (const tool of declared) expect(tool.permission.startsWith(`${NAMESPACE}_`), tool.permission).toBe(true)
  })

  it("declares every tool the server serves", () => {
    const names = new Set(declared.map((tool) => short(tool.permission)))
    expect([...served.keys()].filter((name) => !names.has(name))).toEqual([])
  })

  it("declares no tool the server lacks, unless it is the plugin's own or gated with a reason and a note", () => {
    const missing = declared.filter((tool) => !served.has(short(tool.permission)) && !own.has(short(tool.permission)))
    for (const tool of missing) {
      const gate = entry(short(tool.permission))
      expect({ tool: tool.permission, gated: Boolean(gate.availability && gate.reason && tool.note) }).toEqual({ tool: tool.permission, gated: true })
    }
  })

  it("keeps the plugin's own tools off the server's list", () => {
    expect([...own].filter((name) => served.has(name))).toEqual([])
  })

  it("gives each served tool the server's readOnlyHint, or a recorded reason for a stricter value", () => {
    for (const tool of declared) {
      const live = served.get(short(tool.permission))
      if (!live || live.readOnlyHint === null) continue
      const override = entry(live.name).readOnlyOverride
      const expected = override?.reason ? override.value : live.readOnlyHint
      expect({ tool: tool.permission, readOnly: tool.readOnly ?? false }).toEqual({ tool: tool.permission, readOnly: expected })
    }
  })

  it("records a reason only for a tool that needs one", () => {
    for (const [name, gate] of Object.entries(registry.tools ?? {})) {
      if (gate.availability) expect({ name, served: served.has(name) }).toEqual({ name, served: false })
      if (gate.readOnlyOverride) expect({ name, differs: served.get(name)?.readOnlyHint !== gate.readOnlyOverride.value }).toEqual({ name, differs: true })
    }
  })

  it("allows every declared tool at the family default", () => {
    expect(declared.filter((tool) => tool.effect !== "allow").map((tool) => tool.permission)).toEqual([])
  })
})

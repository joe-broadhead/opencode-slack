import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { APP_NAME, resolveClient, SERVER_DISPLAY_NAME } from "../../src/connect.js"
import { DEFAULT_SCOPES, SERVER } from "../../src/defaults.js"
import plugin from "../../src/index.js"
import { parseOptions } from "../../src/options.js"
import { defaultRules } from "../../src/permissions.js"
import { type Declaration, declarationProblems, docProblems, effectFromRules, readPackage } from "../support/jelly-kit.js"
import { ACCESS_CHOICES, type PluginSetting, settingChoices, settingsProblems, settingValueIssue } from "../support/jelly-settings.js"
import { fakeHost } from "./fakes.js"

/**
 * The `jelly` section of package.json, which Jelly reads without loading the plugin. Jelly's agents have no base
 * "allow everything" rule, so this plugin's own default rules never reach them; Jelly writes each declared "ask" or
 * "deny" as that tool's default instead. The shared kit checks the declaration against Jelly's plugin authors'
 * standard; the tests below add what only Slack declares.
 */

type SignIn = { id: string; label: string; integration?: string; server?: string; scopes?: string[]; after?: string; presetBy?: string; hostClient?: { id: string; option: string; metadataOption?: string }; help?: { url: string; label: string }; relay?: Record<string, string> }
const ROOT = new URL("../../", import.meta.url)
const jelly = readPackage(ROOT).jelly as Declaration & { signIns: SignIn[] }

describe("the jelly declaration", () => {
  // Jelly re-asks a person to sign in only when a declared sign-in's scopes widen (declaration-refresh.ts), so the
  // Slack sign-in declares exactly the scopes the plugin's default sign-in asks for, sorted as Jelly requires.
  test("the Slack sign-in declares the default sign-in's scopes, sorted and unique", () => {
    const scopes = jelly.signIns.find((signIn) => signIn.id === SERVER)?.scopes
    expect(scopes).toEqual([...DEFAULT_SCOPES].sort())
    expect(scopes?.every((scope, index) => index === 0 || scope > scopes[index - 1]!)).toBe(true)
    expect(scopes).toHaveLength(11)
  })

  test("declares the flat access option, with Jelly's own words for its three values", () => {
    const settings = (jelly.contributes as { settings: PluginSetting[] }).settings
    expect(settings).toEqual([
      {
        key: "access",
        label: "Access",
        type: "string",
        description: "How much the plugin's tools may do. Generates default rules for agents with a base allow rule.",
        choices: ACCESS_CHOICES,
        default: "all",
      },
    ])
    expect(settingsProblems(settings)).toEqual([])
  })
  test("the options parser takes every declared access choice, its default included, and refuses a value outside them", () => {
    const access = (jelly.contributes as { settings: PluginSetting[] }).settings[0]!
    const values = (settingChoices(access) ?? []).map((choice) => choice.value)
    expect(values).toEqual(["all", "ask-changes", "read-only"])
    for (const value of values) expect(parseOptions({ access: value })).toMatchObject({ ok: true, options: { access: value } })
    expect(parseOptions({})).toMatchObject({ ok: true, options: { access: access.default } })
    expect(settingValueIssue(access, "write")).not.toBeNull()
    expect(parseOptions({ access: "write" })).toMatchObject({ ok: false })
  })
  test("follows the plugin authors' standard, with the effects the plugin's own default rules give", () => {
    expect(declarationProblems(ROOT, { effectOf: effectFromRules(defaultRules()) })).toEqual([])
  })

  test("docs/jelly.md follows the plugin authors' standard", () => {
    expect(docProblems(ROOT)).toEqual([])
  })

  describe("sign-ins", () => {
    const [app, slack] = jelly.signIns
    /** Plugin options with only the declared option path set, as an organisation's managed config sets it. */
    const presetOptions = (path: string, value: string) =>
      path.split(".").reduceRight<unknown>((inner, key) => ({ [key]: inner }), value) as Record<string, unknown>

    test("declare the Slack app's /connect entry, then the server that waits for it, under the names /connect shows", () => {
      expect(jelly.signIns.length).toBe(2)
      expect(app).toMatchObject({ id: "app", label: APP_NAME, integration: "slack-app" })
      // A Jelly host's own Slack app goes where presetBy looks, so the step is done there, and its Jelly ID's token
      // proxy goes where the plugin reads the OAuth server metadata, so a sign-in through the relay renews.
      expect(app?.hostClient).toEqual({ id: "slack", option: "oauth.client_id", metadataOption: "oauth.auth_server_metadata_url" })
      expect(app?.presetBy).toBe("oauth.client_id")
      expect(slack).toEqual({ id: "slack", label: SERVER_DISPLAY_NAME, server: SERVER, scopes: [...DEFAULT_SCOPES].sort(), after: "app", relay: {} })
    })

    test("Slack's own sign-in may come back through Jelly's relay; the docs give its address, and the default manifest trusts only the loopback", () => {
      const appManifest = JSON.parse(readFileSync(new URL("../../docs/slack-app-manifest.json", import.meta.url), "utf8")) as { oauth_config: { redirect_urls: string[] } }
      const doc = readFileSync(new URL("../../docs/jelly.md", import.meta.url), "utf8")
      expect(slack?.relay).toEqual({})
      expect(appManifest.oauth_config.redirect_urls).toEqual(["http://localhost:8765/callback"])
      expect(doc).toContain("`<Jelly ID origin>/connect/callback`")
      expect(doc).not.toContain("host.example/connect/callback")
    })

    test("the app step is preset by the option that pins the client, so that client is used and no entry is registered", async () => {
      expect(app?.presetBy).toBe("oauth.client_id")
      const options = presetOptions(app!.presetBy!, "C1")
      const parsed = parseOptions(options)
      if (!parsed.ok) throw new Error(parsed.error.message)
      const resolved = await resolveClient({ connection: { active: async () => undefined, resolve: async () => undefined, status: async () => {} } } as never, parsed.options)
      expect(resolved.client).toEqual({ id: "C1", source: "options" })

      const host = fakeHost({ options })
      const cleanup = await plugin.setup(host.ctx)
      try {
        expect(host.integrations.has(app!.integration!)).toBe(false)
        expect(host.servers.get(slack!.server!)).toMatchObject({ oauth: { client_id: "C1" } })
        expect((await host.slashStatus()).text).not.toContain(app!.label)
      } finally {
        await cleanup?.()
      }
    })

    test("without the preset option, the app step's entry is the one /connect lists", async () => {
      const host = fakeHost({ options: {} })
      const cleanup = await plugin.setup(host.ctx)
      try {
        expect(host.integrations.get(app!.integration!)?.name).toBe(app!.label)
        expect(host.servers.has(slack!.server!)).toBe(false)
      } finally {
        await cleanup?.()
      }
    })
  })
})

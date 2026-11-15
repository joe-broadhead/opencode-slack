/**
 * The tools RPC, version 2.3: every known tool the plugin exposes, and the plugin's own methods, as RPC methods, so a
 * script can call them with no model.
 *
 *   POST /api/rpc/slack.workspace.tools/<method>
 *   { "input": { "sessionID": "<session>", "input": <the tool's input> } }
 *
 * The transport is source-contract's `tools-rpc` module (pinned in package.json and bundled into dist/index.js): the
 * version 2 rules (resolve before dispatch, only `allow` runs, the one `evaluate` hook that turns an inner ask of this
 * RPC's own calls into a deny), `describe`, the envelope and the per-method resource resolver. This module is Slack's
 * part of it, one `ToolsRpcPlugin` value: the plugin's id, its method table, its shapers, its next steps and its own
 * error mapping. It was the PLUGIN-SPECIFIC block of the shared copy every plugin carried.
 *
 * Slack's table is every tool in `KNOWN_TOOLS` (`src/tools.ts`), reads and writes alike. Setup registers the plugin's
 * own methods beside them: `events_list` (`slack_events_list`, class `read`), `probe` (`slack_probe`, class `read`),
 * `thread_read` (`slack_slack_read_thread`, class `read`), `mark_read` (`slack_mark_read`, class `write`, which calls
 * Slack's `conversations.mark` through `src/slack-api.ts`) and `status` (`slack_status`, class `read`).
 */
import {
  registerToolsRpc as register,
  toolsRpcId,
  type Failure,
  type McpResult,
  type MethodSpec,
  type NextSteps,
  type ShapeCall,
  type ToolsRpcContext,
  type ToolsRpcOptions as PackageOptions,
  type ToolsRpcPlugin,
} from "@we-the-rebel-alliance/source-contract/tools-rpc"
import { KNOWN_TOOLS, SEND_TOOLS } from "../tools.js"

export { CLASSES, LOCATION_HEADER, LOCATION_HINT, evaluate, hidden, upstreamText } from "@we-the-rebel-alliance/source-contract/tools-rpc"
export type {
  Failure,
  JsonSchema,
  McpMethod,
  McpResult,
  MethodClass,
  MethodSpec,
  NextSteps,
  OwnedMethod,
  PluginMethod,
  Rule,
  ShapeCall,
  ToolCall,
  ToolsRpcContext,
  ToolsRpcPlugin,
} from "@we-the-rebel-alliance/source-contract/tools-rpc"

/** The plugin's id. The RPC id is `<PLUGIN_ID>.tools`. */
export const PLUGIN_ID = "slack.workspace"

/**
 * The MCP tools that become methods, by their upstream name (the tool id without the `<server>_` prefix): every tool
 * in `KNOWN_TOOLS` (`src/tools.ts`), reads and writes alike. It is an allowlist, so a tool the server adds later is
 * never a method until it is classified there. The private search and the file read are class `read`; the three
 * `SEND_TOOLS` are `send`; every other write is `write`. The class never decides whether a call runs: the session's
 * rules do, and at the default `access: "all"` they allow every method.
 */
export const METHODS: readonly MethodSpec[] = Object.entries(KNOWN_TOOLS).map(([name, toolClass]): MethodSpec => ({
  kind: "mcp",
  name,
  class: toolClass === "write" ? (SEND_TOOLS.includes(name) ? "send" : "write") : "read",
}))

/** What the model path's `execute.before` hooks do to an MCP call's arguments, which the executor skips. Slack has none. */
export function shapeInput(_method: string, input: unknown, _call: ShapeCall): unknown {
  return input
}

/** What the model path's `execute.after` hooks do to a result, which the executor skips. Slack has no such hook. */
export function shapeResult(_method: string, result: McpResult, _call: ShapeCall): McpResult {
  return result
}

/** The next step for each code. Each is one sentence that ends with a full stop. */
export const NEXT_STEPS: NextSteps = {
  SESSION_UNKNOWN: `Create a session in the location you mean, such as POST /api/session with {"agent":"build"} sent with the header "x-opencode-directory: <dir>" or the location[directory] query, and pass its id.`,
  SESSION_AGENT_REQUIRED: `Create a session that names an agent this project has, with its project as the location, such as POST /api/session with {"agent":"build","location":{"directory":"/path/to/project"}}, and pass its id.`,
  PERMISSION_DENIED: "Add an allow rule for the tool to the session's agent or to the session, or use a session whose agent allows it.",
  SERVER_CONFLICT: "Run /slack-status, then remove mcp.servers.slack from your OpenCode config.",
  AUTH_REQUIRED: "Run /connect and choose Slack, then press o or Enter to open the sign-in page.",
  CONNECTING: "Wait a few seconds, then call the method again.",
  CONNECTION_FAILED: "Run /slack-status and follow its next step.",
  DISABLED: "Enable slack in /mcps, then call the method again.",
  // Without a client ID, setup's notRegistered hook gives CLIENT_ID_MISSING or CLIENT_ID_INVALID and /connect instead.
  NOT_REGISTERED: "Run /slack-status and follow its next step.",
  TOOL_UNAVAILABLE: "Call describe to see which methods OpenCode lists now, and run /slack-status.",
  UPSTREAM_ERROR: "Check the input against the method's schema from describe, and run /slack-status if it keeps failing.",
  CANCELLED: "Call the method again if you still need the result.",
}

/**
 * The plugin's own errors, thrown by its methods' specs (`eventsError`), as a code, what happened and the next step.
 */
export function pluginError(error: unknown): Failure | undefined {
  if (!(error instanceof Error)) return undefined
  const { code, detail, nextStep } = error as Error & { code?: unknown; detail?: unknown; nextStep?: unknown }
  return typeof code === "string" && typeof detail === "string" && typeof nextStep === "string" ? { code, what: detail, next: nextStep } : undefined
}

/** Slack's part of the tools RPC, as the package's one value. No method has a resource resolver. */
export const SLACK: ToolsRpcPlugin = { id: PLUGIN_ID, nextSteps: NEXT_STEPS, shapeInput, shapeResult, pluginError }

/** `slack.workspace.tools`, the id package.json's `sources.rpc` names. */
export const TOOLS_RPC_ID = toolsRpcId(PLUGIN_ID)

/** Everything setup and the suites pass: the table, its shapers and the MCP options, which Slack's value completes. */
export type ToolsRpcOptions = Omit<PackageOptions, "plugin">

/** The package's `registerToolsRpc` with Slack's value, so a caller passes only the table and the MCP options. */
export function registerToolsRpc(ctx: ToolsRpcContext, options: ToolsRpcOptions): Promise<() => Promise<void>> {
  return register(ctx, { ...options, plugin: SLACK })
}

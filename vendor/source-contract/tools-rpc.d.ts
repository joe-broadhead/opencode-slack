import { type PermissionRule } from "./permission.js";
export { evaluate } from "./permission.js";
/** What v2's block declared, as one value: the plugin's id, its next steps, and its optional shapers and errors. */
export interface ToolsRpcPlugin {
    /** The plugin's id. The RPC id is `<id>.tools`: `google-workspace.gws.tools`. */
    readonly id: string;
    /** The next step for each code. Each is one sentence that ends with a full stop. Read at each call. */
    readonly nextSteps: NextSteps;
    /** The block's `shapeInput`: the identity when absent. */
    readonly shapeInput?: (method: string, input: unknown, call: ShapeCall) => unknown;
    /** The block's `shapeResult`: the identity when absent. */
    readonly shapeResult?: (method: string, result: McpResult, call: ShapeCall) => McpResult;
    /** The block's `pluginError`: a plugin failure's code, what happened and its next step; none when absent. */
    readonly pluginError?: (error: unknown) => Failure | undefined;
}
/** The RPC id for a plugin id. */
export declare const toolsRpcId: (pluginId: string) => string;
export type JsonSchema = Readonly<Record<string, unknown>>;
/** An MCP method's result: the tool's structured content, when it has any, and its text parts joined by newlines. */
export interface McpResult {
    readonly output?: unknown;
    readonly text: string;
}
/** What a method can do. It never decides whether a call runs; the rules do. */
export type MethodClass = "read" | "write" | "send" | "export" | "destructive";
export declare const CLASSES: readonly MethodClass[];
/** The session, agent and action a shaper runs for. */
export interface ShapeCall {
    readonly sessionID: string;
    readonly agent: string;
    readonly action: string;
}
/** An MCP tool, classified. Its description and schemas come from the live tool. */
export interface McpMethod {
    readonly kind: "mcp";
    readonly name: string;
    readonly class: MethodClass;
    /** `codemode: false` on the model path. Informational: every known tool is a method. */
    readonly directOnly?: boolean;
}
/**
 * A plugin-owned tool, run through its own spec. Its asserts must pass
 * `source: { type: "tool", messageID: call.messageID, id: call.id }`, as a tool does with its own context, so that
 * the `evaluate` hook can tell this call's ask apart.
 */
export interface PluginMethod {
    readonly kind: "plugin";
    readonly class: MethodClass;
    readonly directOnly?: boolean;
    readonly name: string;
    /** The tool's permission action (its `options.permission`, or its id): the rule resolution uses it. */
    readonly action: string;
    readonly description: string;
    /** The input's JSON Schema, for the contract and describe. OpenCode does not check it: `run` checks its own input. */
    readonly input: JsonSchema;
    readonly output: JsonSchema;
    run(input: unknown, call: ToolCall): Promise<unknown>;
    /**
     * Whether the method can run now, for describe only: undefined when it can, otherwise the plugin's own code for why
     * not, such as a module that is turned off or has no build for this platform. Without it, describe reports the method
     * as available. A call never consults it: `run` reports the same state as its own error.
     */
    available?(): string | undefined | Promise<string | undefined>;
    /**
     * (v2.3, opt-in) The resource this call's input acts on, `<account>:<operation>`, the same resource the direct tool
     * path asserts (`work:gmail.users.messages.get`); `null` when the input names none, which is refused. The rule is
     * resolved on this resource before dispatch, and `run` receives it as `call.resource`. Without it, the method
     * resolves on `*`, as in v2.
     */
    resource?(input: unknown): string | null;
}
/** Every method: an MCP tool or a plugin-owned tool, each with a class. */
export type MethodSpec = McpMethod | PluginMethod;
/** The v1 name for a plugin-owned method; kept so an adopting block reads the same. */
export type OwnedMethod = PluginMethod;
/** Every code the module itself returns. ACCOUNT_UNKNOWN only with per-account servers. */
export type Code = "SESSION_UNKNOWN" | "SESSION_AGENT_REQUIRED" | "PERMISSION_DENIED" | "SERVER_CONFLICT" | "AUTH_REQUIRED" | "CONNECTING" | "CONNECTION_FAILED" | "DISABLED" | "NOT_REGISTERED" | "TOOL_UNAVAILABLE" | "UPSTREAM_ERROR" | "CANCELLED" | "ACCOUNT_UNKNOWN" | "RESOURCE_UNRESOLVED";
/** The codes only an MCP method raises. A block without MCP methods may omit their next steps. */
declare const MCP_ONLY: readonly ["SERVER_CONFLICT", "AUTH_REQUIRED", "CONNECTING", "CONNECTION_FAILED", "DISABLED", "NOT_REGISTERED", "TOOL_UNAVAILABLE", "UPSTREAM_ERROR"];
type McpCode = (typeof MCP_ONLY)[number];
/** Codes with a shared default next step, which a block may override: SERVER_CONFLICT, and v2.3's RESOURCE_UNRESOLVED. */
type DefaultedCode = "SERVER_CONFLICT" | "RESOURCE_UNRESOLVED";
/**
 * One next step per code. The MCP-only steps are required, at registration, only for a block with MCP methods, and
 * SERVER_CONFLICT not even then: the shared default names the server. ACCOUNT_UNKNOWN only with per-account servers.
 * RESOURCE_UNRESOLVED has a shared default.
 */
export type NextSteps = Readonly<Record<Exclude<Code, McpCode | DefaultedCode | "ACCOUNT_UNKNOWN">, string>> & {
    readonly [code in McpCode | DefaultedCode | "ACCOUNT_UNKNOWN"]?: string;
};
/** A refusal: the RPC error `failed` with this message and `data: { code, next }`. */
export interface Failure {
    readonly code: string;
    /** What happened, without the code or a final full stop. */
    readonly what: string;
    readonly next: string;
}
/** The shapers a call uses. The plugin's `shapeInput` / `shapeResult` are the default. */
export interface Shapers {
    input?(method: string, input: unknown, call: ShapeCall): unknown;
    result?(method: string, result: McpResult, call: ShapeCall): McpResult;
}
export interface ToolsRpcOptions {
    /** The plugin's id, next steps, shapers and error mapping: v2's PLUGIN-SPECIFIC block, as a value. */
    readonly plugin: ToolsRpcPlugin;
    /**
     * The plugin's declared table. Pass the block's `METHODS`: one list, so the default rules, describe, the methods and
     * the skills cannot drift apart. It is an argument rather than a module-level read so that a test can exercise the
     * shared part with its own table.
     */
    readonly methods: readonly MethodSpec[];
    /**
     * Optional overrides for the plugin's shapers, for a plugin whose shapers are built at runtime. Omitted, the plugin's
     * `shapeInput` and `shapeResult` are used. A test passes spies here to see the call order.
     */
    readonly shapers?: Shapers;
    /** The MCP server whose methods are `<server>_<name>`. Required when the table has any `kind: "mcp"` entry. */
    readonly mcp?: {
        /**
         * The server name. A function makes `account` part of the envelope and maps it to that account's server, or to
         * undefined for an account that does not exist.
         */
        readonly server: string | ((account: string | undefined) => string | undefined);
        /** False while the name belongs to a server the plugin does not manage, such as the user's own. */
        readonly managed: (server: string) => boolean;
        /**
         * Optional. For a method that OpenCode does not list, `describe` adds the text this returns as `detail`
         * beside the code in `reason`, such as the toolset and option that turn the method on. Called with the method
         * name and that code; undefined adds nothing. Without it, describe is unchanged.
         */
        readonly unavailableDetail?: (method: string, code: Code) => string | undefined;
        /**
         * Optional. The code and next step used instead of NOT_REGISTERED while the server is not registered, such as a
         * missing client ID that keeps the plugin from registering it; undefined keeps NOT_REGISTERED. Read at each call
         * and each describe. Without it, NOT_REGISTERED stays.
         */
        readonly notRegistered?: (server: string) => {
            readonly code: string;
            readonly next: string;
        } | undefined;
    };
}
/** A permission rule, as OpenCode keeps it. */
export type Rule = PermissionRule;
/** One live tool, as `ctx.tool.list()` gives it. */
export interface HostTool {
    readonly id: string;
    readonly description?: string;
    readonly input?: unknown;
    readonly output?: unknown;
    execute(input: never, call: never): Promise<{
        readonly output?: unknown;
        readonly content?: string | readonly {
            readonly type: string;
            readonly text?: string;
        }[];
    }>;
}
/** A permission evaluation, as the `evaluate` hook sees it. */
export interface HostEvaluation {
    readonly action: string;
    readonly source?: {
        readonly id: string;
    };
    effect: "allow" | "deny" | "ask";
    message?: string;
}
/**
 * The part of OpenCode's plugin context this module uses (`Plugin.Context` picked to `rpc`, `permission`, `session`,
 * `agent`, `tool`, `mcp` and `location`), written structurally so the package needs no `@opencode/plugin`. A plugin
 * passes its own `ctx`.
 */
export interface ToolsRpcContext {
    readonly rpc: {
        register(contract: unknown, handlers: unknown): Promise<{
            dispose(): Promise<void>;
        }>;
    };
    readonly permission: {
        hook(name: "evaluate", callback: (evaluation: HostEvaluation) => void): Promise<{
            dispose(): Promise<void>;
        }>;
    };
    readonly session: {
        get(input: {
            sessionID: never;
        }): Promise<{
            readonly agent?: string;
            readonly permissions?: readonly Rule[];
        }>;
    };
    readonly agent: {
        get(input: {
            agentID: string;
        }): Promise<{
            readonly data: {
                readonly permissions: readonly Rule[];
            };
        }>;
    };
    readonly tool: {
        list(): Promise<readonly HostTool[]>;
    };
    readonly mcp: {
        list(): Promise<{
            readonly data: readonly {
                readonly name: string;
                readonly status: {
                    readonly status: string;
                };
            }[];
        }>;
    };
    readonly location: {
        readonly directory: string;
    };
}
/** The executor context a script's call runs with. */
export interface ToolCall {
    readonly sessionID: string;
    readonly agent: string;
    readonly messageID: string;
    readonly id: string;
    readonly signal: AbortSignal;
    readonly progress: () => Promise<void>;
    /**
     * A plugin-owned method's call only, with per-account servers: the envelope's `account`, already known to the
     * `mcp.server` function. Absent when the envelope has none (the default account).
     */
    readonly account?: string;
    /** (v2.3) The resource the rule was resolved on, when the method has a resolver. */
    readonly resource?: string;
}
/** The header and query an external caller uses to name the location whose plugins and sessions it means. */
export declare const LOCATION_HEADER = "x-opencode-directory";
export declare const LOCATION_HINT = "Send the call to the location you mean: run it in that project with \"opencode api ... -H \\\"x-opencode-directory:$PWD\\\"\", or pass the location[directory] query parameter to the HTTP request.";
/** (v2.3) The read verbs a read method's operation starts its last dotted segment with: Memory's `READ_VERBS`. */
export declare const READ_VERBS: readonly string[];
/**
 * (v2.3) A resource a resolver may name: `<account>:<operation>`. The account is `permission`'s `ACCOUNT_PATTERN` (no
 * wildcard, colon or whitespace, at most 320 characters); the operation is dotted words.
 */
export declare const RESOURCE_PATTERN: RegExp;
/** (v2.3) True when the operation's last dotted segment starts with a read verb: `users.messages.get`, `getProfile`. */
export declare function readOperation(operation: string): boolean;
/** The RPC contract's definition, as `Rpc.define` checks it: an error name starting with `rpc.` is reserved. */
export declare function defineRpc<T extends {
    readonly methods: Readonly<Record<string, {
        readonly errors?: Readonly<Record<string, unknown>>;
    }>>;
}>(definition: T): T;
/** OpenCode hides a tool from the model when the last rule matching its action on `*` is a deny. */
export declare const hidden: (rules: readonly Rule[], action: string) => boolean;
/** Upstream text for an error message: its first line, with tokens and signed URLs redacted, at most 300 characters. */
export declare function upstreamText(text: string): string;
export declare function registerToolsRpc(ctx: ToolsRpcContext, options: ToolsRpcOptions): Promise<() => Promise<void>>;

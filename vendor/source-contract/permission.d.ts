/**
 * Permission: the exact OpenCode session rules a grant allows (design §3, "the trust rule").
 *
 * Every read runs in a session limited to these rules. OpenCode checks each inner tool call a plugin makes against the
 * calling session's rules, and the last matching rule wins, so the rules are a deny of everything, then one allow per
 * action and resource the source declares:
 *
 *   [{ action: "*", resource: "*", effect: "deny" },
 *    { action: "gws.events_list", resource: "*", effect: "allow" },
 *    { action: "gws.read", resource: "ana@example.com:gmail.users.messages.list", effect: "allow" }, …]
 *
 * The method's action is allowed on `*`, because the tools RPC resolves a method before dispatch on `*` (version 2; a
 * method with a version 2.3 resource resolver is resolved on its resource, which the operation rules cover). Each
 * operation is allowed as Memory's schema and conformance kit read it (`operationRule`): a dotted operation as
 * `<namespace>.read` on `<account>:<operation>` (gws: `gws.read` on `ana@example.com:gmail.users.messages.get`), and a
 * bare one, an MCP tool, as `<namespace>_<operation>` on `*` (Slack: `slack_slack_read_channel`). The namespace is the
 * source id's first segment.
 *
 * The broker and a project may only narrow these rules, and the plugin's own `access` setting stays final.
 */
import type { Checked } from "./internal/checked.js";
import type { SourceItem } from "./descriptor.js";
/** One OpenCode permission rule, as a session or an agent holds it. */
export interface PermissionRule {
    readonly action: string;
    readonly resource: string;
    readonly effect: "allow" | "deny" | "ask";
}
/**
 * A person's grant: one consumer may read one source, for one account, within one scope (design §2, "consent per
 * (consumer, source, account, scope)").
 */
export interface Grant {
    /** Who reads: a project's consumer, such as `memory`, `jelly.home`, or an Artifacts app with its viewer. */
    readonly consumer: string;
    /** The source id. */
    readonly source: string;
    /** The account the person confirmed. */
    readonly account: string;
    /** The scope the person confirmed, by scope key: channel ids, label names. Absent for a source without a scope. */
    readonly scope?: Readonly<Record<string, readonly string[]>>;
    /** The descriptor hash the person consented to; a changed descriptor asks again. */
    readonly descriptorHash: string;
    /** The person turned this binding off: a read answers SOURCE_DISABLED, which is not an error state. */
    readonly disabled?: boolean;
}
/** The first rule of every fenced session: nothing is allowed that a later rule does not allow. */
export declare const DENY_ALL: PermissionRule;
/**
 * An account a rule may name: no wildcard (`*`, `?`), no `:` (it separates account and operation), no whitespace or
 * control character, at most 320 characters. A wildcard here would widen the grant to other accounts.
 */
export declare const ACCOUNT_PATTERN: RegExp;
/** Why `account` cannot be named in a rule, or undefined when it can. */
export declare function accountProblem(account: unknown): string | undefined;
/** A source's namespace: its id's first segment, which every action of the source begins with. */
export declare function namespaceOf(source: Pick<SourceItem, "id">): string;
/**
 * The rule that allows one operation for `account`: a dotted operation as `<namespace>.read` on
 * `<account>:<operation>`, a bare one (an MCP tool) as `<namespace>_<operation>` on `*`. The same derivation as Memory's
 * conformance kit, so declared equals asserted means the same thing in a plugin's CI and in a consumer's session.
 */
export declare function operationRule(source: Pick<SourceItem, "id">, operation: string, account: string): PermissionRule;
/** The method action a source's read asserts. */
export declare function methodAction(source: SourceItem): string | undefined;
/**
 * The session rules for reading `source` under `grant`: deny everything, then allow the method and each declared
 * operation for the granted account. Refused when the grant is for another source, its account cannot be named in a
 * rule, or the source does not name its method's action.
 */
export declare function sessionRules(source: SourceItem, grant: Pick<Grant, "source" | "account">): Checked<readonly PermissionRule[]>;
/**
 * The session rules for one detail read of `source` under `grant`: the source's own rules. A detail read is part of
 * the source's read (Slack's thread read is one of its declared operations), so it asserts nothing the source does not
 * declare. Refused when the source declares no such detail.
 */
export declare function detailRules(source: SourceItem, detailId: string, grant: Pick<Grant, "source" | "account">): Checked<readonly PermissionRule[]>;
/**
 * The session rules for the source's `probe` on `account`: deny everything, then allow the source's own action and its
 * identity operations, which read no content and are never among its content operations (Memory's kit checks both).
 * The descriptor does not list identity operations yet, so the caller passes them (source-contract#4).
 */
export declare function probeRules(source: SourceItem, account: string, identityOperations: readonly string[]): Checked<readonly PermissionRule[]>;
/**
 * How OpenCode decides an action on a resource under `rules`: the last rule whose action and resource match wins (`*`
 * matches any run of characters and `?` one), and no match asks. The same evaluation the tools RPC runs.
 */
export declare function evaluate(rules: readonly PermissionRule[], action: string, resource?: string): PermissionRule["effect"];
/** True when `grant` covers a read of `source` for `account` within `scope`: the same source and account, and every scope value granted. */
export declare function grantCovers(grant: Grant, request: {
    readonly source: string;
    readonly account: string;
    readonly scope?: Readonly<Record<string, readonly string[]>>;
}): boolean;

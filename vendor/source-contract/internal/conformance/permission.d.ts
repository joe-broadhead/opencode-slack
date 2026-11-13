/**
 * The recording permission context: a session whose rules are exactly a source's grants. Every read the kit calls runs
 * with this context, so a read that asserts more than its declaration holds is refused here, and a grant nothing
 * asserts is reported at the end. Declared equals asserted.
 */
import type { SourceItem } from "../schema/types.js";
/** A permission action and its resource, as a declaration derives them. */
export interface Grant {
    readonly action: string;
    readonly resource: string;
}
/** One permission the plugin asserted while the kit ran it. */
export interface Assertion {
    readonly action: string;
    readonly resources: readonly string[];
}
/** What a plugin's read may pass to `permission.assert`. */
export interface AssertInput {
    readonly action: string;
    readonly resources?: readonly string[] | undefined;
}
/** The context every conformance call receives: the account, and the session's permission. */
export interface SessionContext {
    readonly account: string;
    readonly permission: {
        assert(input: AssertInput): Promise<void>;
    };
}
/** A recording context: its permission, every assertion made through it, and every action it refused. */
export interface RecordingPermission {
    readonly permission: {
        assert(input: AssertInput): Promise<void>;
    };
    readonly assertions: readonly Assertion[];
    readonly undeclared: readonly string[];
}
/**
 * The grants a source's declaration derives, which are the running session's exact rules.
 *
 * **Provisional.** The app's `permission` module owns this derivation; until it lands, the kit derives the grants itself
 * so a plugin can pass conformance, and a caller may pass its own with `grants`. §2.2 keeps `permission.operations` and
 * the tool's action, not the grants themselves: a dotted operation is the account's own resource on the plugin's read
 * action (`gws.read` on `{account}:gmail.users.messages.get`), and a bare operation is an MCP tool's own action
 * (`slack_slack_read_channel` on `*`). Both forms are what the gws and Slack pilots assert.
 *
 * Not exported from the package: it is the kit's own reading, not a contract.
 */
export declare function grantsFor(source: SourceItem): Grant[];
/**
 * The grants of the **bind** session: only `scope.suggest`'s tool and operations. They never enter a running grant, so
 * they are a separate session with its own unused check.
 */
export declare function bindGrantsFor(source: SourceItem): Grant[];
/**
 * The grants of the identity operations a probe may assert. They are part of the running session, because a source's
 * page reads its identity too, but they are not content: a declaration may not also list one in
 * `permission.operations`.
 */
export declare function identityGrantsFor(source: SourceItem, identityOperations: readonly string[]): Grant[];
/** `{account}` is a wildcard for the account a call names; everything else must match exactly, or by `*`. */
export declare function sameResource(declared: string, asserted: string): boolean;
/** True when some assertion is the grant's action on one of its resources, with `{account}` bound to any account. */
export declare function assertionMatches(assertions: readonly Assertion[], grant: Grant): boolean;
/**
 * A recording permission over `grants`. An action outside them is refused the way the host refuses one, and listed in
 * `undeclared`; every assertion is recorded, so a caller can compare what the declaration holds with what was asked.
 */
export declare function recordingPermission(grants: readonly Grant[]): RecordingPermission;
/** The grants a set of assertions never touched: a declaration that over-grants. */
export declare function unusedGrants(grants: readonly Grant[], assertions: readonly Assertion[]): Grant[];

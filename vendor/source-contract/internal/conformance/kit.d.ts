/**
 * The conformance kit: one report per source, from a declaration and the plugin's own answers.
 *
 * The kit runs the plugin's reads itself, through a recording permission whose rules are the grants the declaration
 * derives. So a read that asserts more than the declaration holds is refused where the host would refuse it, and a
 * grant no read asserts is reported at the end: declared equals asserted. There are two such sessions, and they never
 * mix: the **running** session holds the source's own action and `permission.operations`, and the **bind** session holds
 * only `scope.suggest`'s tool and operations, because a bind-time read never enters a running grant.
 *
 * The kit takes page results, cursors and permission contexts as inputs. It defines no page, cursor or permission of its
 * own: those are the `events`, `cursor` and `permission` modules' work.
 *
 * The calls it makes, which a plugin's test adapts to its own tools:
 *
 *   list({ ...input }, context)                 → the page result of events_list
 *   probe({ source, account? }, context)        → { account, owner, scopes? }
 *   details[id]({ account, scope, fields })     → the page result of one detail read
 *   suggest({ source, account }, context)       → { options: [{ id, label? }] }, in the bind session
 *   snapshot({ params? }, context)              → the snapshot result, recorded for its grants only
 *
 * `context.permission.assert` is that session's permission: a read asserts the actions and operations it uses.
 */
import type { SourceItem } from "../schema/types.js";
import { type ToolDeclaration } from "./rules.js";
import { type Grant, type SessionContext } from "./permission.js";
import { type DetailCallInput } from "./details.js";
/** A case the source refuses, with the code or words its error carries. */
export interface Refusal {
    readonly refuses: string;
}
/** What a case expects: a page, an empty page, an expired cursor, or a refusal. */
export type CaseExpectation = "page" | "empty" | "expired" | Refusal;
/** One `events_list` call and what it must answer. */
export interface PageCase {
    /** The case's name, as a person reads it. */
    readonly name: string;
    /** The call's input. */
    readonly input: Readonly<Record<string, unknown>>;
    /** What the answer must be. `page` when absent. */
    readonly expect?: CaseExpectation | undefined;
}
/** One detail read: the event it names, the scope it is pinned to, and what it must answer. */
export interface DetailCase {
    /** The detail's id, as the source declares it. */
    readonly id: string;
    /** The confirmed scope the read is pinned to: a person's channels, calendars, labels. */
    readonly scope?: Readonly<Record<string, readonly string[]>> | undefined;
    /** The event's values for the fields the detail names. Default: the kit's synthetic event. */
    readonly event?: Readonly<Record<string, unknown>> | undefined;
    /** What the call must answer. Absent: an in-scope call, which must answer a page. A refusal: an event outside the scope. */
    readonly expect?: Refusal | undefined;
}
/** The plugin's reads, as the kit calls them. */
export interface ConformanceCalls {
    readonly list?: ((input: Readonly<Record<string, unknown>>, context: SessionContext) => Promise<unknown>) | undefined;
    readonly probe: (input: Readonly<Record<string, unknown>>, context: SessionContext) => Promise<unknown>;
    readonly details?: Readonly<Record<string, (input: DetailCallInput, context: SessionContext) => Promise<unknown>>> | undefined;
    readonly suggest?: ((input: Readonly<Record<string, unknown>>, context: SessionContext) => Promise<unknown>) | undefined;
    /** A snapshot read: recorded for the grants it asserts. Its result's shape is not this kit's to check. */
    readonly snapshot?: ((input: Readonly<Record<string, unknown>>, context: SessionContext) => Promise<unknown>) | undefined;
}
/** What `sourceConformance` checks. */
export interface SourceConformanceOptions {
    /** The plugin's package name, which every result names. */
    readonly plugin: string;
    /** The source item, as the schema parsed it. */
    readonly source: SourceItem;
    /** The plugin's declared tools, so every tool the source names can be checked. */
    readonly tools: readonly ToolDeclaration[];
    /** The plugin's reads. */
    readonly calls: ConformanceCalls;
    /** The `events_list` calls and their expected answers. */
    readonly cases?: readonly PageCase[] | undefined;
    /** The detail reads to run: at least one in scope, and one outside it when the source confirms scope keys. */
    readonly detailCases?: readonly DetailCase[] | undefined;
    /** The `snapshot_read` calls, whose grants are recorded. */
    readonly snapshotCases?: readonly Readonly<Record<string, unknown>>[] | undefined;
    /** The operations the probe may assert, beyond the source's own action. §2.2 does not name them, so the kit asks. */
    readonly identityOperations?: readonly string[] | undefined;
    /** The account the kit hands a read; a display value, never a grant. */
    readonly account?: string | undefined;
    /** The grants to run under. Default: the kit's provisional derivation from the declaration. */
    readonly grants?: readonly Grant[] | undefined;
}
/** One named check: whether it ran, whether it applies at all, and what it found. */
export interface ConformanceCheck {
    readonly name: string;
    readonly ran: boolean;
    /** True when the check does not apply to this source, such as a page check on a snapshot. */
    readonly notApplicable: boolean;
    readonly problems: readonly string[];
}
/** A source's report. `ok` is true only when every check ran or does not apply, and none found a problem. */
export interface ConformanceReport {
    readonly source: string;
    readonly plugin: string;
    /** The identity operations the kit was told a probe may assert, so a reader sees them. */
    readonly identityOperations: readonly string[];
    readonly checks: readonly ConformanceCheck[];
    readonly problems: readonly string[];
    readonly ok: boolean;
    /** True when a check applies and did not run: the report says nothing about it, so it is not ok. */
    readonly incomplete: boolean;
}
/**
 * Run every conformance check for one source.
 *
 * `ok` requires every check to have run, or not to apply: a check that applies and did not run leaves the report
 * `incomplete` and not ok, so a source can never pass by having nothing to check.
 */
export declare function sourceConformance(options: SourceConformanceOptions): Promise<ConformanceReport>;
/** `sourceConformance`, for a test or a check: throws one error naming every problem. */
export declare function assertConformance(report: ConformanceReport): void;

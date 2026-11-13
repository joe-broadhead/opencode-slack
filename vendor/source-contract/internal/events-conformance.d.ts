/**
 * `eventsListConformance`: the events half of the conformance kit (design §3, `conformance`; the family owns this part,
 * Memory owns the kit around it).
 *
 * With contract 1's fixtures it runs contract 1's checks, unchanged, so each of the nine plugins' existing tests
 * passes as it is. Each addition of the final design is checked when the page carries it (`resultProblems` checks
 * `refused`, `failed`, `gap`, `cost`, `scope`, `plugin` and `asOf` whenever present) and, where a check needs to know
 * something about the source, when the fixture says so:
 *
 * - `maxBytes`: every page within the source's declared `maxBytes`;
 * - `kinds`: every event of a kind the source declares (`reads`);
 * - `refused`: the external_ids a full listing refuses, in order;
 * - `scope` and `scopeEcho`: the scope passed on every call, and echoed by every page;
 * - `binding`: the cursor is the library's bound cursor, and the same state bound to another plugin, account or scope
 *   is refused;
 * - `codes`: every refusal carries the table's code (`CURSOR_INVALID`, `INPUT_INVALID`, `SOURCE_UNKNOWN`);
 * - and always: no secret pattern survives in an event's title or text (the draft's conformance check 3).
 *
 * **The seam for Memory's kit.** `hooks.onCall` sees every call and its answer (Memory's recording permission context
 * records the assertions here), and `hooks.after` adds the problems of the checks Memory owns: `probe` reads no
 * content, `details` only with in-scope event fields, `failed[]` holds the cursor, and `gap` and `CURSOR_EXPIRED`
 * round-trip. This module does not implement those; it gives them every page the walk listed.
 */
import { type Scope } from "../cursor.js";
import { type EventsListInput, type EventsListResult, type EventsOwner } from "./events.js";
/** What one call answered, for `hooks.onCall`. */
export interface ConformanceCall {
    /** The check that made the call, such as "the first page" or "a malformed cursor". */
    readonly what: string;
    readonly input: EventsListInput;
    readonly result?: unknown;
    readonly error?: unknown;
}
/** Where Memory's kit plugs in (see the module's comment). */
export interface ConformanceHooks {
    readonly onCall?: (call: ConformanceCall) => void;
    readonly after?: (walk: {
        readonly whole?: EventsListResult;
        readonly pages: readonly EventsListResult[];
    }) => readonly string[] | Promise<readonly string[]>;
}
/** What a source's fixture holds, for `eventsListConformance`. */
export interface ConformanceFixtures {
    /** The `source` every result and event names. */
    readonly source: string;
    /** The `account` every result and event names; also passed as the input's account when set. */
    readonly account?: string;
    /** Pass `source` on every call, as a collector does for a plugin with several sources. */
    readonly sourceInput?: boolean;
    /** The owner every result names. */
    readonly owner?: EventsOwner;
    /** Passed as `since` on every call without a cursor. Every event must be at or after it. */
    readonly since?: string;
    /** The external_ids a full listing from `since` yields, oldest first. At most `PAGE.max`. */
    readonly expected: readonly string[];
    /** The limit of the paged walk; 2 by default. */
    readonly pageSize?: number;
    /** The source's declared `maxBytes`: every page's JSON is at most this. `MAX_PAGE_BYTES` when absent. */
    readonly maxBytes?: number;
    /** The kinds the source declares (`reads`): every event is one of them. */
    readonly kinds?: readonly string[];
    /** The external_ids a full listing from `since` refuses, in order. */
    readonly refused?: readonly string[];
    /** Passed as `scope` on every call. */
    readonly scope?: Scope;
    /** Every page echoes the scope (canonical). */
    readonly scopeEcho?: boolean;
    /** The source uses the library's bound cursor for this plugin (`../cursor`, version 2). */
    readonly binding?: {
        readonly plugin: string;
    };
    /** Every refusal carries the table's code. */
    readonly codes?: boolean;
    readonly hooks?: ConformanceHooks;
}
export type EventsList = (input: EventsListInput) => Promise<unknown>;
/**
 * Every way `list` breaks the contract over `fixtures`, one sentence each; none when it keeps it. It lists everything
 * at once and page by page, checks each result, that the pages join up to exactly the expected events with nothing
 * repeated or skipped, that an earlier cursor lists the same page again, that the last cursor lists nothing, that every
 * result names the source and account, an empty first page included, that the owner, account and hashes hold steady,
 * and that a bad limit, a source the plugin does not have or a cursor it did not issue is refused. `list` runs the
 * source's events_list as its tool or RPC method does, input check included, over data that does not change.
 */
export declare function eventsListConformance(list: EventsList, fixtures: ConformanceFixtures): Promise<string[]>;
/** `eventsListConformance`, for a test: throws one error that lists every problem. */
export declare function assertEventsListConformance(list: EventsList, fixtures: ConformanceFixtures): Promise<void>;

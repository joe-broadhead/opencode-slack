/**
 * `details`: a read of one event's detail, called only with the event fields it names, pinned to the confirmed scope.
 *
 * The kit builds the call from the declaration: `fields` holds exactly the event fields in `detail.from`, `scope` is
 * the confirmed scope, and nothing else travels. An event's title and text are never an input, so item text cannot
 * choose what the library reads next.
 */
import type { Detail, Scope, SourceItem } from "../schema/types.js";
/** What the kit passes to a detail read: the confirmed scope, and the event fields the detail declares. */
export interface DetailCallInput {
    readonly account: string;
    readonly scope: Readonly<Record<string, readonly string[]>>;
    readonly fields: Readonly<Record<string, unknown>>;
}
/** The text the kit puts in an event's prose, to prove it never reaches a detail read. */
export declare const SENTINEL = "CONFORMANCE-SENTINEL-ITEM-TEXT";
/**
 * A valid event of the source, for a detail to read: every field of §2.1, with the sentinel in the two prose fields.
 * The fields a detail names are identifiers, so no detail ever sees the sentinel.
 */
export declare function syntheticEvent(source: SourceItem): Record<string, unknown>;
/**
 * The call the kit makes for a detail: the named event fields, the scope, and the account.
 *
 * `event` overrides the synthetic event's values for the fields the detail names, so a fixture can record a real one.
 * A key the detail does not name is ignored: only `from` travels.
 */
export declare function detailInput(detail: Detail, source: SourceItem, options: {
    readonly account: string;
    readonly scope?: Readonly<Record<string, readonly string[]>> | undefined;
    readonly event?: Readonly<Record<string, unknown>> | undefined;
}): DetailCallInput;
/** Every problem with a detail call's input: only the declared event fields, and never item text. */
export declare function detailInputProblems(detail: Detail, input: DetailCallInput): string[];
/** The scope a detail fixture names, checked against the source's declared keys. */
export declare function scopeProblems(scope: Readonly<Record<string, readonly string[]>>, declared: Scope | undefined, where: string): string[];

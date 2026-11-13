/**
 * The page result of `events_list`, contract version 1 (§2.1): the fields Memory's checks read, and nothing else.
 *
 * The page and the event are the `events` module's shape. This file does not define them: it reads the only fields the
 * checks below need — `events[].external_id`, `refused[]`, `failed[]`, `cursor`, `more`, `gap` and `cost` — through a
 * narrow interface, and it checks `source` and `plugin` so a page can be attributed to the source it belongs to. When the
 * `events` module lands its validator, this adopts it and the narrow reads go. The envelope's `account`, `owner`, `asOf`
 * and `trust`, and every other event field, are not checked here.
 *
 * The checks: `failed[]` holds the cursor back, `refused[]` is final, `gap` is shaped and runs forwards, and a billed
 * source reports its cost.
 */
import type { SourceItem } from "../schema/types.js";
/** What a page is checked against. */
export interface PageOptions {
    readonly source: SourceItem;
    /** The plugin's package name, which every result names. */
    readonly plugin: string;
    /** The input the call was made with, so `failed[]` can be held against the cursor it must not advance. */
    readonly input: Readonly<Record<string, unknown>>;
    /** True for a detail read, which answers one event: it has no cursor to hold back and no page to resume. */
    readonly detail?: boolean | undefined;
}
/** The page's problems, by concern. */
export interface PageChecks {
    /** The attribution, the cursor and the two lists of drops. */
    readonly shape: readonly string[];
    /** `failed[]` holds the cursor back, and an empty page still carries one. */
    readonly cursor: readonly string[];
    /** `gap` is shaped, and its window runs forwards. */
    readonly gap: readonly string[];
    /** A refused id is never also an event: a refusal is final. */
    readonly refused: readonly string[];
    /** `cost` is reported by a billed source. */
    readonly cost: readonly string[];
}
/** An ISO date-time with an offset, as §2.1 writes `gap.since`. */
export declare const instant: (value: unknown) => value is string;
/** The page's problems, by concern. */
export declare function pageChecks(answer: unknown, options: PageOptions): PageChecks;
/** Every problem with a page, one sentence each. An empty list means the checks that apply found nothing. */
export declare function pageProblems(answer: unknown, options: PageOptions): string[];

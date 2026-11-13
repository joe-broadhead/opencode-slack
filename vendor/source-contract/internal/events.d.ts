import { type Scope } from "../cursor.js";
export { decodeCursor, encodeCursor } from "../cursor.js";
export type { Scope } from "../cursor.js";
export { secretKinds } from "./secrets.js";
/** The tool's and the tools-RPC method's name. */
export declare const EVENTS_LIST = "events_list";
/** The core kinds: contract 1's nine, then `task` and `file` (design §2.1). */
export declare const EVENT_KINDS: readonly ["message", "meeting", "session", "bookmark", "issue", "pr", "commit", "doc", "event", "task", "file"];
export type CoreKind = (typeof EVENT_KINDS)[number];
/** A plugin's own kind: `x-<plugin>/<kind>`, such as `x-jelly/routine-run`. */
export type ExtensionKind = `x-${string}/${string}`;
export type EventKind = CoreKind | ExtensionKind;
/** An extension kind: `x-`, a lowercase plugin word, `/`, a lowercase kind word; at most 64 characters. */
export declare const EXTENSION_KIND: RegExp;
/** True for a core kind, or an extension kind of at most 64 characters. */
export declare const isEventKind: (kind: unknown) => kind is EventKind;
/** The most characters each field takes, and the most items each list takes. */
export declare const EVENT_LIMITS: {
    readonly source: 64;
    readonly account: 128;
    readonly externalId: 512;
    readonly thread: 512;
    readonly title: 300;
    readonly text: 4096;
    readonly url: 2048;
    readonly actors: 20;
    readonly actorRole: 32;
    readonly actorId: 320;
    readonly actorName: 200;
    readonly labels: 20;
    readonly label: 64;
    readonly ownerId: 320;
    readonly ownerLabel: 200;
    readonly cursor: 1024;
    readonly scopeKeys: 16;
    readonly scopeKey: 64;
    readonly scopeValues: 64;
    readonly scopeValue: 256;
    readonly refused: 500;
    readonly failed: 500;
    readonly detail: 200;
    readonly costUnits: 8;
};
/** `limit`'s default and inclusive range. */
export declare const PAGE: {
    readonly default: 100;
    readonly min: 1;
    readonly max: 500;
};
/**
 * The most bytes of JSON one result holds when the source declares no `maxBytes`. Contract 1's cap. The descriptor's
 * `maxBytes` (64 KB by default, at most 1 MB) is the cap a host enforces, and `fitPage` and the conformance take it.
 */
export declare const MAX_PAGE_BYTES = 900000;
/** The descriptor's `maxBytes`: its default and its ceiling (design §2.2). */
export declare const MAX_BYTES: {
    readonly default: 65536;
    readonly max: 1048576;
};
/** Where a listing starts when the call has neither cursor nor since: this many hours before now. */
export declare const FIRST_RUN_HOURS = 24;
export declare const TRUST: "untrusted";
/** Someone or something an event involves. `id` is a stable, scheme-qualified id: `mailto:…`, `slack:U…`, `github:…`. */
export interface EventActor {
    readonly role: string;
    readonly id: string;
    readonly name?: string;
}
/** One normalised event, as a source lists it. A consumer adds its own id. */
export interface SourceEvent {
    readonly source: string;
    readonly account: string;
    readonly external_id: string;
    readonly kind: EventKind;
    /** UTC, as `Date.prototype.toISOString` writes it. */
    readonly occurred_at: string;
    readonly thread: string | null;
    readonly actors: EventActor[];
    readonly title: string;
    readonly text: string;
    /** An https link to the thing in the source, or null when it has none. */
    readonly url: string | null;
    readonly labels: string[];
    /** `sha256:<hex>` of every other field, from `eventHash`. */
    readonly hash: string;
}
/** The signed-in source account. */
export interface EventsOwner {
    readonly id: string;
    readonly label: string;
}
/** Why an event is refused for good: instruction-shaped text from someone else, a secret, or not the owner's. */
export declare const REFUSAL_REASONS: readonly ["instruction", "secret", "owner"];
export type RefusalReason = (typeof REFUSAL_REASONS)[number];
/** An event the source will never deliver. The consumer may advance its cursor past it. */
export interface RefusedEvent {
    readonly external_id: string;
    readonly reason: RefusalReason;
    /** One line, at most 200 characters, never the event's content: the secret kinds, for example. */
    readonly detail?: string;
}
/** An event the source could not read this time. Any entry holds the consumer's cursor back. */
export interface FailedEvent {
    readonly external_id: string;
    /** An error code (`RATE_LIMITED`, `UNAVAILABLE`, …). */
    readonly code: string;
    readonly retryAfterSec?: number;
}
/** Why history was lost: the provider expired it, or the source read only part of the window. */
export declare const GAP_REASONS: readonly ["expired", "window-truncated"];
export type GapReason = (typeof GAP_REASONS)[number];
/** History is lost from `since` (UTC ISO) up to the page's first event. */
export interface EventsGap {
    readonly reason: GapReason;
    readonly since: string;
}
/** What the provider reported this call cost, for billed sources: counts per declared price unit, and US dollars. */
export interface EventsCost {
    readonly units: readonly {
        readonly per: string;
        readonly count: number;
    }[];
    readonly usd?: number;
}
export interface EventsListInput {
    readonly since?: string;
    readonly cursor?: string;
    readonly limit?: number;
    readonly account?: string;
    readonly source?: string;
    readonly scope?: Scope;
}
export interface EventsListResult {
    /** The source every event names, also on an empty page. */
    readonly source: string;
    /** The account every event names, also on an empty page. */
    readonly account: string;
    readonly owner: EventsOwner;
    readonly events: SourceEvent[];
    readonly cursor: string;
    readonly more: boolean;
    readonly trust: typeof TRUST;
    /** The scope the page was read under, canonical (`canonicalScope`); absent for the whole source. */
    readonly scope?: Record<string, string | string[]>;
    readonly refused?: RefusedEvent[];
    readonly failed?: FailedEvent[];
    readonly gap?: EventsGap;
    readonly cost?: EventsCost;
    /** The plugin's package name or id (the draft's envelope). */
    readonly plugin?: string;
    /** When the source read the page, UTC ISO (the draft's envelope). */
    readonly asOf?: string;
}
/** An input after `parseEventsListInput`: `since` in epoch milliseconds, `limit` with its default, `scope` canonical. */
export interface EventsListRequest {
    readonly since?: number;
    readonly cursor?: string;
    readonly limit: number;
    readonly account?: string;
    readonly source?: string;
    readonly scope?: Record<string, string | string[]>;
}
/** The one error table: the draft's nine and the final design's three. */
export declare const ERROR_CODES: readonly ["NEEDS_SIGN_IN", "ACCOUNT_MISMATCH", "CURSOR_INVALID", "CURSOR_EXPIRED", "RATE_LIMITED", "TOO_LARGE", "SCHEMA_VIOLATION", "PERMISSION_DENIED", "UNAVAILABLE", "SCOPE_MISSING", "BUDGET_EXCEEDED", "SOURCE_DISABLED"];
export type ErrorCode = (typeof ERROR_CODES)[number];
/**
 * Codes the nine plugins use today for refusals the table has no row for: a malformed input and a source the plugin
 * does not have. Proposed for the table (`docs/events.md`, decision D3); until decided, `canonicalCode` accepts them.
 */
export declare const PROPOSED_CODES: readonly ["INPUT_INVALID", "SOURCE_UNKNOWN"];
export type ProposedCode = (typeof PROPOSED_CODES)[number];
/** Another name for a code in the table: `AUTH_REQUIRED` is `NEEDS_SIGN_IN` (design §2.1). */
export declare const ERROR_ALIASES: Readonly<Record<string, ErrorCode>>;
/**
 * The codes contract 1's plugins use, mapped to the table, so a consumer can read a plugin that has not moved yet
 * (projects support the current and previous contract versions, design §3).
 */
export declare const CONTRACT1_CODES: Readonly<Record<string, ErrorCode | ProposedCode>>;
/** The table's code for `code`: itself, its alias, or contract 1's name for it; undefined for any other code. */
export declare function canonicalCode(code: string): ErrorCode | ProposedCode | undefined;
/**
 * A refusal in the family's form, `CODE: what happened. Next step: what to do.`, with the code and its data. A
 * `RATE_LIMITED` or `BUDGET_EXCEEDED` may carry `retryAfterSec`; a `CURSOR_EXPIRED` carries the `gap`.
 */
export declare class SourceError extends Error {
    readonly code: string;
    readonly what: string;
    readonly next: string;
    readonly retryAfterSec?: number;
    readonly gap?: EventsGap;
    constructor(init: {
        readonly code: string;
        readonly what: string;
        readonly next: string;
        readonly retryAfterSec?: number;
        readonly gap?: EventsGap;
    });
}
/**
 * The code, its canonical code, what happened and the next step, read from a refusal: a `SourceError`, or any error
 * whose message is in the family's form. Undefined for an error with no code.
 */
export declare function parseSourceError(error: unknown): {
    code: string;
    canonical?: ErrorCode | ProposedCode;
    what: string;
    next?: string;
} | undefined;
/** An ISO date (a UTC day), or an ISO date-time with seconds optional and `Z` or an offset. */
export declare const SINCE_PATTERN: RegExp;
/** A source's name: a lowercase word such as gmail or history. */
export declare const SOURCE_PATTERN: RegExp;
/** A scope key: a word such as `label`, `channels` or `repositories`. */
export declare const SCOPE_KEY_PATTERN: RegExp;
/** `since` in epoch milliseconds; undefined when it is not one of the accepted forms or not a real time. */
export declare function sinceTime(since: string): number | undefined;
/** A scope's problems against the keys a source declares, one sentence each, naming keys and never values. */
export declare function scopeProblems(scope: unknown, keys: readonly string[]): string[];
/** How a source parses its input: the scope keys it declares (`scope.keys` in its descriptor), none by default. */
export interface ParseOptions {
    readonly scopeKeys?: readonly string[];
}
/**
 * The input checked and normalised, or the problems with it, one sentence each, naming fields and never values.
 * `scope` is accepted only when `options.scopeKeys` declares keys: a source that does not read a scope must refuse
 * one rather than ignore it, since ignoring it would read more than the consumer asked for.
 */
export declare function parseEventsListInput(input: unknown, options?: ParseOptions): {
    ok: true;
    value: EventsListRequest;
} | {
    ok: false;
    problems: string[];
};
/** Where a listing without a cursor starts: `since`, or `FIRST_RUN_HOURS` before `now`. */
export declare function startTime(request: Pick<EventsListRequest, "since">, now: number): number;
/** At most `max` characters, ending in `…` when cut, never splitting a surrogate pair. */
export declare function cut(text: string, max: number): string;
/** `sha256:` and the hex digest of every field but the hash, in a fixed order. */
export declare function eventHash(event: Omit<SourceEvent, "hash">): string;
/** What a source fills in for `makeEvent`; it normalises the rest. */
export interface EventDraft {
    readonly source: string;
    readonly account: string;
    readonly external_id: string;
    readonly kind: EventKind;
    /** A Date, epoch milliseconds, or a string `Date.parse` reads. */
    readonly occurred_at: Date | number | string;
    readonly thread?: string | null;
    readonly actors?: readonly {
        readonly role: string;
        readonly id: string;
        readonly name?: string | null;
    }[];
    readonly title?: string | null;
    readonly text?: string | null;
    readonly url?: string | null;
    readonly labels?: readonly string[];
}
/**
 * A `SourceEvent` from a draft: the time in UTC ISO form, the title on one line and cut to 300 characters, the text cut
 * to 4096, actors without blanks or repeats and at most 20, labels likewise, a url only when it is https, and the hash.
 * Throws when the time is not a real time.
 */
export declare function makeEvent(draft: EventDraft): SourceEvent;
/** Events oldest first; events at the same time keep their order. */
export declare function oldestFirst<T extends Pick<SourceEvent, "occurred_at">>(events: readonly T[]): T[];
/**
 * How many of `events`, in the order given, fit in one result: at most `limit`, and as many as keep the result's JSON
 * within `maxBytes` (`MAX_PAGE_BYTES` by default; pass the descriptor's `maxBytes`), but always at least one.
 */
export declare function fitPage(events: readonly SourceEvent[], limit: number, maxBytes?: number): number;
/** How `screenEvents` decides. Without predicates, only the secret pattern refuses. */
export interface ScreenOptions {
    /** False when the event is not the signed-in owner's (a shared mailbox, a delegated calendar). */
    readonly ownedBy?: (event: SourceEvent) => boolean;
    /** True when the event is instruction-shaped text from someone else. The library has no default (`docs/events.md`, D5). */
    readonly instruction?: (event: SourceEvent) => boolean;
    /** The secret detector; Memory's `secretKinds` by default. */
    readonly secrets?: (text: string) => readonly string[];
}
/**
 * The events a page may carry, and those it refuses for good, in order: not the owner's, then a secret in the title or
 * text (as Memory's store checks an import), then instruction-shaped. A refusal's detail never holds the content.
 */
export declare function screenEvents(events: readonly SourceEvent[], options?: ScreenOptions): {
    events: SourceEvent[];
    refused: RefusedEvent[];
};
/** Whose a result is: the source and account it lists, and the signed-in owner of that account. */
export interface EventsListIdentity {
    readonly source: string;
    readonly account: string;
    readonly owner: EventsOwner;
}
/** The page result's optional parts; each is written only when given. Empty `refused` and `failed` lists are left out. */
export interface PageExtras {
    readonly scope?: Scope;
    readonly refused?: readonly RefusedEvent[];
    readonly failed?: readonly FailedEvent[];
    readonly gap?: EventsGap;
    readonly cost?: EventsCost;
    readonly plugin?: string;
    readonly asOf?: string;
}
/** A result, with its source, account, owner and trust marker, and the extras given. Without extras, contract 1's. */
export declare function eventsListResult(identity: EventsListIdentity, events: readonly SourceEvent[], cursor: string, more: boolean, extras?: PageExtras): EventsListResult;
/** One event's problems, one sentence each; none when it keeps the contract. */
export declare function eventProblems(event: unknown, where?: string): string[];
/**
 * A result's problems: its shape, every event, the order, the limit and the size, and each optional addition that is
 * present. None when it keeps the contract. `maxBytes` is the source's declared cap, `MAX_PAGE_BYTES` by default.
 */
export declare function resultProblems(result: unknown, limit?: number, maxBytes?: number): string[];

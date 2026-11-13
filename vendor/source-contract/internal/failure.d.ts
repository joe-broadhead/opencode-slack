/**
 * A read's failure, in the family's form: `CODE: what happened. Next step: …`.
 *
 * The codes are the one error table in `events` (`ERROR_CODES`, design §2.1). A plugin's code is read through
 * `canonicalCode`: `AUTH_REQUIRED` is `NEEDS_SIGN_IN`, and contract 1's names (`EVENTS_CURSOR_INVALID`) are the
 * table's.
 */
import { type ErrorCode } from "./events.js";
/** The codes a read answers: the events table. */
export declare const FAILURE_CODES: readonly ["NEEDS_SIGN_IN", "ACCOUNT_MISMATCH", "CURSOR_INVALID", "CURSOR_EXPIRED", "RATE_LIMITED", "TOO_LARGE", "SCHEMA_VIOLATION", "PERMISSION_DENIED", "UNAVAILABLE", "SCOPE_MISSING", "BUDGET_EXCEEDED", "SOURCE_DISABLED"];
export type FailureCode = ErrorCode;
/** A read that did not happen, or whose answer was refused. */
export interface ReadFailure {
    readonly code: FailureCode;
    /** `CODE: what happened. Next step: …`. */
    readonly message: string;
    readonly next: string;
    /** With RATE_LIMITED: when to try again. */
    readonly retryAfterSec?: number;
}
export declare function failure(code: FailureCode, what: string, next: string, retryAfterSec?: number): ReadFailure;
/**
 * A plugin's or a host's error as a read failure: its `code` (or the code its message starts with) when the contract
 * knows it, with `AUTH_REQUIRED` read as `NEEDS_SIGN_IN`; anything else is UNAVAILABLE, with the message's first line.
 *
 * A plugin's `INPUT_INVALID` or `SOURCE_UNKNOWN` (all nine source plugins refuse a malformed input or an unknown
 * source, and the table has no row for either yet) is SCHEMA_VIOLATION, the code `read` gives an input it refuses
 * itself: the read and the installed plugin disagree, and trying again will not help. Tied to decision D3 (app#2346,
 * PR #7): if the table adopts the two codes, they pass through here as themselves.
 */
export declare function failureFromError(error: unknown): ReadFailure;

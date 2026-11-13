/**
 * Params: what a read's inputs may say that only the reader can resolve, resolved by the library at read time
 * (design §2.3). A plugin receives plain values and never resolves them itself.
 *
 * - **Relative times**, in the person's time zone: `"now"`, or a signed whole number of minutes, hours, days or weeks,
 *   `"-90m"`, `"+2h"`, `"-7d"`, `"+1w"`. Minutes and hours are exact; days and weeks move the date in the person's time
 *   zone and keep the time of day, so `"-1d"` across a clock change is still "this time yesterday". The result is an
 *   ISO date-time in UTC, rounded down to the minute, so every read within one minute sends the same input (and a cache
 *   keyed on it holds). At most 366 days either way.
 * - **Windows**, in the person's time zone: `"today"`, `"yesterday"` and `"tomorrow"`, each `{ since, until }` from
 *   midnight to midnight; or `{ since, until }` with each a relative or absolute time.
 * - **`$me`**: the signed-in account, as the source's `probe` names its owner (`owner.id`).
 *
 * Which params a snapshot source takes, and which may be relative or `$me`, its descriptor says
 * (`"params": { "window": { "relative": true } }`); an events source's `since` may always be relative.
 *
 * Seeded from Artifacts' relative-time resolver (ADR 0046, `resolveRelativeTimes` in we-the-rebel-alliance/artifacts):
 * the same rounding to the minute and the same 366-day bound, written as plain strings instead of `{"$now": …}`.
 */
import type { Checked } from "./internal/checked.js";
/** How far a relative time reaches, either way (Artifacts' default). */
export declare const MAX_RELATIVE_DAYS = 366;
/** The windows a param may name. */
export declare const WINDOWS: readonly ["today", "yesterday", "tomorrow"];
export type WindowName = (typeof WINDOWS)[number];
/** The whole-value marker for the signed-in account. */
export declare const ME = "$me";
/** What a descriptor says about one param. Keys this module does not know are left for the plugin. */
export interface ParamSpec {
    /** The param takes a relative time or a window, which the library resolves. */
    readonly relative?: boolean;
    /** The param may be `$me`. */
    readonly me?: boolean;
    readonly [key: string]: unknown;
}
/** What a read resolves against: when it runs, the person's time zone, and the signed-in account when known. */
export interface ParamsContext {
    /** Now, as a Date or epoch milliseconds. */
    readonly now: Date | number;
    /** The person's IANA time zone, such as Europe/Amsterdam. */
    readonly timeZone: string;
    /** The signed-in account's owner id, from `probe`; `$me` needs it. */
    readonly me?: string;
}
/** A window, resolved: ISO date-times in UTC, `since` inclusive and `until` exclusive. */
export interface ResolvedWindow {
    readonly since: string;
    readonly until: string;
}
/** True when the time zone is one this runtime knows. */
export declare function isTimeZone(timeZone: unknown): timeZone is string;
/** A relative time resolved to an ISO date-time in UTC, or undefined when `value` is not one in bounds. */
export declare function resolveRelativeTime(value: string, context: Pick<ParamsContext, "now" | "timeZone">): string | undefined;
/** A named window resolved, midnight to midnight in the person's time zone. */
export declare function resolveWindow(name: WindowName, context: Pick<ParamsContext, "now" | "timeZone">): ResolvedWindow;
/**
 * A snapshot read's params, resolved against what the source declares. A param the source does not declare is refused;
 * `$me` only where the param allows it and the signed-in account is known; a relative param is resolved; anything else
 * goes to the plugin as it is, for the plugin's own input check.
 */
export declare function resolveParams(declared: Readonly<Record<string, ParamSpec>> | undefined, given: unknown, context: ParamsContext): Checked<Record<string, unknown>>;
/** An events read's `since`, resolved: a relative time, or an absolute one unchanged. */
export declare function resolveSince(since: unknown, context: ParamsContext): Checked<string>;

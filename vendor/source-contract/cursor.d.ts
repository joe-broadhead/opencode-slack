/** The most characters a cursor takes. */
export declare const MAX_CURSOR_LENGTH = 1024;
/** Contract 1's cursor version. */
export declare const CURSOR_V1 = 1;
/** The bound cursor's version. */
export declare const CURSOR_V2 = 2;
/** The keys the codecs keep for themselves: a plugin's state never uses them. */
export declare const RESERVED_STATE_KEYS: readonly string[];
/**
 * An opaque cursor for `source` holding `state`: base64url JSON that names the source, so another source's cursor is
 * refused. Throws when it would be longer than 1024 characters, a bug in the source.
 */
export declare function encodeCursor(source: string, state: Readonly<Record<string, unknown>>): string;
/** The state `encodeCursor` stored for `source`; undefined when the cursor is malformed or another source's. */
export declare function decodeCursor(source: string, cursor: string): Record<string, unknown> | undefined;
/** A scope as a source receives it: each key a value or a list of values (labels, channels, repositories). */
export type Scope = Readonly<Record<string, string | readonly string[]>>;
/** What a cursor is bound to. `scope` absent or `{}` is the whole source. */
export interface CursorBinding {
    /** The plugin's package name or id, as the descriptor names it. */
    readonly plugin: string;
    /** The source's name within the plugin (`gmail`), as `events_list`'s `source` input names it. */
    readonly source: string;
    /** The account the source read, `default` included. */
    readonly account: string;
    readonly scope?: Scope;
}
/**
 * A scope in one canonical form: keys sorted, each list's values sorted and without repeats, a one-value list kept as
 * a list (so `{label: "A"}` and `{label: ["A"]}` differ, as the source may read them differently). Empty lists and
 * an empty scope stay. Throws on a value that is not a string or a list of strings.
 */
export declare function canonicalScope(scope: Scope | undefined): Record<string, string | string[]>;
/** The binding's hash: the first 16 hex digits of SHA-256 over its canonical JSON. */
export declare function bindingHash(binding: CursorBinding): string;
/**
 * A version 2 cursor for `binding` holding `state`. Throws when the state uses a reserved key (`v`, `s`, `b`) or the
 * cursor would be longer than 1024 characters: both are bugs in the source.
 */
export declare function encodeBoundCursor(binding: CursorBinding, state: Readonly<Record<string, unknown>>): string;
/** Why a cursor did not decode. `malformed`: not a cursor at all. `foreign`: another binding's, or another version's. */
export type CursorRefusal = "malformed" | "foreign";
export type DecodedCursor = {
    readonly ok: true;
    readonly state: Record<string, unknown>;
    readonly legacy: boolean;
} | {
    readonly ok: false;
    readonly reason: CursorRefusal;
};
/**
 * The state `encodeBoundCursor` stored for `binding`. A cursor of another plugin, source, account or scope is
 * `foreign`; one that is not base64url JSON of an object is `malformed`. With `acceptV1`, a contract 1 cursor of the
 * same source decodes with `legacy: true`, but only when the binding's scope is empty (the whole source): a contract 1
 * cursor was issued for the whole source, so a scoped read, or any change of scope, refuses it and the consumer starts
 * the scoped read again with `since`. Its account binding is the source's own to check. Either refusal is
 * `CURSOR_INVALID` to the caller.
 *
 * The binding hash catches mix-ups (a cursor sent to the wrong source, account or scope); it is not a signature. A
 * consumer that holds a cursor can forge another binding's, so a source still checks the cursor's state against what
 * it reads, and the grant, not the cursor, decides what may be read.
 */
export declare function decodeBoundCursor(binding: CursorBinding, cursor: string, options?: {
    readonly acceptV1?: boolean;
}): DecodedCursor;

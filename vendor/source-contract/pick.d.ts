/** At most this many paths in one pick (Artifacts' defaults). */
export declare const MAX_PICK_PATHS = 50;
/** Each path is at most this many characters. */
export declare const MAX_PICK_PATH_LENGTH = 200;
/** A pick path: segments of letters, digits, `_`, `$` and `-`, each optionally ending in `[]`. */
export declare const PICK_PATH: RegExp;
/** A JSON value's shape, as JSON Schema says it. */
export type JsonSchema = Readonly<Record<string, unknown>> | boolean;
/**
 * Only the picked paths of `data`, in its own nesting. A path the data does not have, in an item or in the whole, is
 * left out. Only data that is not a JSON object fails.
 */
export declare function pick(data: unknown, paths: readonly string[]): {
    readonly ok: true;
    readonly data: Record<string, unknown>;
} | {
    readonly ok: false;
};
/** The paths that reach nothing anywhere in `data`, in the order given: a diagnostic, never a failure of the read. */
export declare function missingPaths(data: unknown, paths: readonly string[]): string[];
/**
 * Every problem with a pick, one sentence each: not a list, too many paths, a path that breaks the grammar or is too
 * long, a repeated path, and, given the output's JSON Schema, a path no value of that schema can have. None when the
 * pick is good.
 */
export declare function pickProblems(paths: unknown, schema?: JsonSchema): string[];
/** `pickProblems` against a registered output by name; a name the registry does not hold is a problem. */
export declare function pickProblemsForOutput(output: string, paths: unknown): string[];

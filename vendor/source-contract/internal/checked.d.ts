/**
 * The plain types every validator has. No import: a published declaration reaches this file, and must reach nothing
 * outside the package (`npm run check:dist`).
 */
/** A value checked: the parsed value, or every problem, one sentence each, naming paths and never values. */
export type Checked<T> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
    readonly problems: readonly string[];
};
/** A schema, as the package exposes it. */
export interface Validator<T> {
    /** The schema's name, as `dist/schemas/<name>.json` and the release's schema bundle know it. */
    readonly name: string;
    /** The value parsed, or its problems. Never throws. */
    check(value: unknown): Checked<T>;
    /** The value parsed; throws one error listing every problem. */
    parse(value: unknown): T;
    /** The JSON Schema (draft 2020-12) generated from the zod source of truth. */
    jsonSchema(): Record<string, unknown>;
}

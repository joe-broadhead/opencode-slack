/**
 * Every schema the package publishes, by name. `npm run build` writes each to `dist/schemas/<name>.json`, and the
 * release attaches them as one bundle. A module that adds a validator adds it here.
 */
import type { Validator } from "./internal/checked.js";
export declare const SCHEMAS: readonly Validator<unknown>[];

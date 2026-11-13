import type { Validator } from "./internal/checked.js";
import type { Sources } from "./internal/schema/types.js";
export { MAX_BYTES_DEFAULT, MAX_BYTES_LIMIT } from "./internal/schema/types.js";
export type { Accounts, Cadence, Cost, Detail, DetailField, Permission, PermissionEvents, PermissionTool, Price, Scope, SourceCommon, SourceEvents, SourceItem, SourceSnapshot, Sources, Suggest, } from "./internal/schema/types.js";
/** The validator for a plugin's `sources` declaration, contract version 1. */
export declare const SOURCES_SCHEMA: Validator<Sources>;

/**
 * The source contract: one language for every plugin that is a source and every project that reads one.
 *
 * Each module is also its own entry point (`@we-the-rebel-alliance/source-contract/<module>`), so a plugin bundles only
 * what it uses. This entry holds the contract's version and re-exports nothing heavy.
 */
/** The contract version this package implements. A descriptor declares it as `sources.contractVersion`. */
export declare const CONTRACT_VERSION = 1;
/** The contract versions this package reads: the current one and the one before it (design §3, "Versions"). */
export declare const SUPPORTED_CONTRACT_VERSIONS: readonly number[];
export type { Checked, Validator } from "./internal/checked.js";

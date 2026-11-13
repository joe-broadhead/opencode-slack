/**
 * `probe` (§2.3): the owner and the granted scopes, per source, so a Calendar-only sign-in works. It reads no content,
 * and it asserts only its own grant.
 */
import type { SourceItem } from "../schema/types.js";
/** Every problem with a probe answer, one sentence each. */
export declare function probeProblems(answer: unknown, source: SourceItem): string[];

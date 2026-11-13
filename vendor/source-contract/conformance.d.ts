/**
 * The conformance kit: what a source plugin's declaration must satisfy, and the checks that prove it against the
 * plugin's own answers.
 *
 * The package's `conformance` entry exports it:
 *
 *   const report = await sourceConformance({ plugin, source, tools, calls, cases })
 *   assertConformance(report)
 *
 * The kit takes page results, cursors and permission contexts as inputs. It defines no page, cursor, permission or
 * descriptor of its own: those are the `events`, `cursor`, `permission`, `read` and `descriptor` modules' work, and a
 * plugin under test supplies what it can genuinely answer.
 *
 * The rules a JSON Schema cannot express are `declarationProblems`: the read-verb and joiner lists, the namespace of an
 * action, the `urlHosts` suffix rules, and uniqueness. Everything the generated schema can carry is in `./schema`.
 */
export { assertDeclaration, declarationProblems, nameProblem, operationProblem, publicSuffixOf, readVerbProblem, urlHostProblem } from "./internal/conformance/rules.js";
export { DETAIL_FIELDS, EVENT_FIELDS, JOINERS, READ_VERBS, WRITE_VERBS, tokensOf } from "./internal/conformance/rules.js";
export type { DeclarationOptions, ToolDeclaration } from "./internal/conformance/rules.js";
export { assertionMatches, recordingPermission, sameResource, unusedGrants } from "./internal/conformance/permission.js";
export type { AssertInput, Assertion, Grant, RecordingPermission, SessionContext } from "./internal/conformance/permission.js";
export { instant, pageChecks, pageProblems } from "./internal/conformance/page.js";
export type { PageChecks, PageOptions } from "./internal/conformance/page.js";
export { probeProblems } from "./internal/conformance/probe.js";
export { SENTINEL, detailInput, detailInputProblems, scopeProblems, syntheticEvent } from "./internal/conformance/details.js";
export type { DetailCallInput } from "./internal/conformance/details.js";
export { suggestProblems } from "./internal/conformance/suggest.js";
export type { ScopeOption } from "./internal/conformance/suggest.js";
export { assertConformance, sourceConformance } from "./internal/conformance/kit.js";
export type { CaseExpectation, ConformanceCalls, ConformanceCheck, ConformanceReport, DetailCase, PageCase, Refusal, SourceConformanceOptions, } from "./internal/conformance/kit.js";

/**
 * `events`: the events_list source contract (design §2.1 and §2.3), as the plugin family's nine source plugins carry it
 * (contract 1), with §2.1's additions. The data model, the normaliser (`makeEvent`), the hash (`eventHash`), the
 * secret-pattern refusal (`screenEvents`, `secretKinds`), the error table (`ERROR_CODES`, `SourceError`), the checks
 * (`eventProblems`, `resultProblems`) and `eventsListConformance`. The cursor codec is `./cursor`, re-exported here as
 * contract 1 had it. `docs/events.md` maps contract 1 to the final design and lists the decisions still open.
 */
export * from "./internal/events.js";
export * from "./internal/events-conformance.js";

// @we-the-rebel-alliance/source-contract 0.1.0. Built by scripts/build.mjs; do not edit.
import {
  CONTRACT1_CODES,
  ERROR_ALIASES,
  ERROR_CODES,
  EVENTS_LIST,
  EVENT_KINDS,
  EVENT_LIMITS,
  EXTENSION_KIND,
  FIRST_RUN_HOURS,
  GAP_REASONS,
  MAX_BYTES,
  MAX_PAGE_BYTES,
  PAGE,
  PROPOSED_CODES,
  REFUSAL_REASONS,
  SCOPE_KEY_PATTERN,
  SINCE_PATTERN,
  SOURCE_PATTERN,
  SourceError,
  TRUST,
  canonicalCode,
  cut,
  eventHash,
  eventProblems,
  eventsListResult,
  fitPage,
  isEventKind,
  makeEvent,
  oldestFirst,
  parseEventsListInput,
  parseSourceError,
  resultProblems,
  scopeProblems,
  screenEvents,
  secretKinds,
  sinceTime,
  startTime
} from "./chunks/chunk-ZTRH3FEM.js";
import {
  decodeBoundCursor,
  decodeCursor,
  encodeBoundCursor,
  encodeCursor
} from "./chunks/chunk-I2RXJJJM.js";
import "./chunks/chunk-HLVAKAYG.js";

// src/internal/events-conformance.ts
var describeError = (error) => error instanceof Error ? error.message.split("\n", 1)[0] : String(error);
async function eventsListConformance(list, fixtures) {
  const problems = [];
  const hooks = fixtures.hooks ?? {};
  const maxBytes = fixtures.maxBytes ?? MAX_PAGE_BYTES;
  const call = async (input, what) => {
    try {
      const result = await list(input);
      hooks.onCall?.({ what, input, result });
      return { result };
    } catch (error) {
      hooks.onCall?.({ what, input, error });
      return { error };
    }
  };
  const scope = {
    ...fixtures.account === void 0 ? {} : { account: fixtures.account },
    ...fixtures.sourceInput ? { source: fixtures.source } : {},
    ...fixtures.scope === void 0 ? {} : { scope: fixtures.scope }
  };
  const base = { ...fixtures.since === void 0 ? {} : { since: fixtures.since }, ...scope };
  const after = (cursor) => ({ cursor, ...scope });
  const pageSize = fixtures.pageSize ?? 2;
  const since = fixtures.since === void 0 ? void 0 : sinceTime(fixtures.since);
  const owners = /* @__PURE__ */ new Set();
  const accounts = /* @__PURE__ */ new Set();
  const hashes = /* @__PURE__ */ new Map();
  const check = (listed, what, limit) => {
    if (listed.error !== void 0) {
      problems.push(`${what} failed: ${describeError(listed.error)}`);
      return void 0;
    }
    const found = resultProblems(listed.result, limit, maxBytes);
    problems.push(...found.map((problem) => `${what}: ${problem}`));
    if (found.length > 0) return void 0;
    const result = listed.result;
    if (result.source !== fixtures.source) problems.push(`${what}: the result names the source ${result.source}, not ${fixtures.source}`);
    if (fixtures.account !== void 0 && result.account !== fixtures.account) problems.push(`${what}: the result names the account ${result.account}, not ${fixtures.account}`);
    accounts.add(result.account);
    owners.add(JSON.stringify(result.owner));
    if (fixtures.owner && JSON.stringify(result.owner) !== JSON.stringify({ id: fixtures.owner.id, label: fixtures.owner.label })) problems.push(`${what}: the owner is not the fixture's owner`);
    if (fixtures.scopeEcho && fixtures.scope !== void 0) {
      if (result.scope === void 0) problems.push(`${what}: the result does not echo the scope`);
      else if (JSON.stringify(result.scope) !== JSON.stringify(sortedScope(fixtures.scope))) problems.push(`${what}: the result's scope is not the call's scope`);
    }
    for (const event of result.events) {
      if (event.source !== fixtures.source) problems.push(`${what}: an event names the source ${event.source}, not ${fixtures.source}`);
      if (fixtures.account !== void 0 && event.account !== fixtures.account) problems.push(`${what}: an event names the account ${event.account}, not ${fixtures.account}`);
      if (since !== void 0 && Date.parse(event.occurred_at) < since) problems.push(`${what}: the event ${event.external_id} is from before since`);
      if (fixtures.kinds !== void 0 && !fixtures.kinds.includes(event.kind)) problems.push(`${what}: the event ${event.external_id} is a ${event.kind}, which the source does not declare`);
      const secrets = secretKinds([event.title, event.text].filter(Boolean).join("\n"));
      if (secrets.length > 0) problems.push(`${what}: the event ${event.external_id} holds a secret (${secrets.join(", ")}); it belongs in refused[]`);
      const known = hashes.get(event.external_id);
      if (known !== void 0 && known !== event.hash) problems.push(`${what}: the event ${event.external_id} has another hash than before`);
      hashes.set(event.external_id, event.hash);
    }
    return result;
  };
  const ids = (result) => result?.events.map((event) => event.external_id) ?? [];
  const whole = check(await call({ ...base, limit: PAGE.max }, "one call with the largest limit"), "one call with the largest limit", PAGE.max);
  if (whole) {
    if (JSON.stringify(ids(whole)) !== JSON.stringify(fixtures.expected)) problems.push(`one call with the largest limit lists [${ids(whole).join(", ")}], not [${fixtures.expected.join(", ")}]`);
    if (fixtures.expected.length <= PAGE.max && whole.more) problems.push("one call with the largest limit lists everything but says more");
    if (fixtures.refused !== void 0) {
      const refusedIds = (whole.refused ?? []).map((entry) => entry.external_id);
      if (JSON.stringify(refusedIds) !== JSON.stringify(fixtures.refused)) problems.push(`one call with the largest limit refuses [${refusedIds.join(", ")}], not [${fixtures.refused.join(", ")}]`);
    }
  }
  const pages = [];
  let page = check(await call({ ...base, limit: pageSize }, "the first page"), "the first page", pageSize);
  const most = fixtures.expected.length + (fixtures.refused?.length ?? 0) + 10;
  while (page) {
    pages.push(page);
    if (!page.more) break;
    if (pages.length > most) {
      problems.push(`the paged walk did not end after ${most} pages`);
      break;
    }
    const what = `page ${pages.length + 1}`;
    page = check(await call({ ...after(page.cursor), limit: pageSize }, what), what, pageSize);
  }
  const walked = pages.flatMap(ids);
  if (JSON.stringify(walked) !== JSON.stringify(fixtures.expected)) problems.push(`the pages of ${pageSize} list [${walked.join(", ")}], not [${fixtures.expected.join(", ")}]`);
  if (pages.length >= 2) {
    const again = check(await call({ ...after(pages[0].cursor), limit: pageSize }, "the first cursor again"), "the first cursor again", pageSize);
    if (again && JSON.stringify(again.events) !== JSON.stringify(pages[1].events)) problems.push("the first cursor, used again, does not list the second page again");
  }
  const last = pages.at(-1);
  if (last && !last.more) {
    const end = check(await call({ ...after(last.cursor), limit: pageSize }, "the last cursor"), "the last cursor", pageSize);
    if (end && (end.events.length > 0 || end.more)) problems.push("the last cursor lists events again, or says more");
  }
  const empty = check(await call({ ...scope, since: "2999-01-01T00:00:00Z", limit: pageSize }, "an empty first page"), "an empty first page", pageSize);
  if (empty && (empty.events.length > 0 || empty.more)) problems.push("a first page from a since in the future lists events, or says more");
  if (owners.size > 1) problems.push("the owner changes between calls");
  if (accounts.size > 1) problems.push("the account changes between calls");
  const refused = async (input, what, codes) => {
    const listed = await call(input, what);
    if (listed.error === void 0) {
      problems.push(`${what} was not refused`);
      return;
    }
    if (fixtures.codes) {
      const parsed = parseSourceError(listed.error);
      if (!parsed?.canonical || !codes.includes(parsed.canonical)) problems.push(`${what} was refused without the code ${codes.join(" or ")}${parsed ? ` (it says ${parsed.code})` : ""}`);
    }
  };
  const INPUT = ["INPUT_INVALID"];
  const CURSOR = ["CURSOR_INVALID"];
  await refused({ ...base, limit: PAGE.max + 1 }, `a limit of ${PAGE.max + 1}`, INPUT);
  await refused({ ...base, limit: 0 }, "a limit of 0", INPUT);
  await refused({ ...after("not-a-cursor"), limit: pageSize }, "a malformed cursor", CURSOR);
  await refused({ ...after(encodeCursor(`${fixtures.source}-other`, {})), limit: pageSize }, "another source's cursor", CURSOR);
  await refused({ ...base, source: `${fixtures.source}-other`, limit: pageSize }, "a source the plugin does not have", ["SOURCE_UNKNOWN", "INPUT_INVALID"]);
  const first = pages[0];
  if (fixtures.binding !== void 0 && first) {
    const binding = { plugin: fixtures.binding.plugin, source: fixtures.source, account: first.account, ...fixtures.scope === void 0 ? {} : { scope: fixtures.scope } };
    const decoded = decodeBoundCursor(binding, first.cursor);
    if (!decoded.ok) problems.push("the first page's cursor is not the library's cursor bound to this plugin, source, account and scope");
    else {
      const others = [
        ["another plugin's", { ...binding, plugin: `${binding.plugin}-other` }],
        ["another account's", { ...binding, account: `${binding.account}-other` }],
        ["another scope's", { ...binding, scope: { ...binding.scope ?? {}, conformance: ["other"] } }]
      ];
      for (const [whose, other] of others) await refused({ ...after(encodeBoundCursor(other, decoded.state)), limit: pageSize }, `${whose} bound cursor`, CURSOR);
    }
  }
  if (hooks.after) problems.push(...await hooks.after({ ...whole ? { whole } : {}, pages }));
  return problems;
}
function sortedScope(scope) {
  const out = {};
  for (const key of Object.keys(scope).sort()) {
    const value = scope[key];
    out[key] = Array.isArray(value) ? [...new Set(value)].sort() : value;
  }
  return out;
}
async function assertEventsListConformance(list, fixtures) {
  const problems = await eventsListConformance(list, fixtures);
  if (problems.length > 0) throw new Error(`events_list breaks the contract:
- ${problems.join("\n- ")}`);
}
export {
  CONTRACT1_CODES,
  ERROR_ALIASES,
  ERROR_CODES,
  EVENTS_LIST,
  EVENT_KINDS,
  EVENT_LIMITS,
  EXTENSION_KIND,
  FIRST_RUN_HOURS,
  GAP_REASONS,
  MAX_BYTES,
  MAX_PAGE_BYTES,
  PAGE,
  PROPOSED_CODES,
  REFUSAL_REASONS,
  SCOPE_KEY_PATTERN,
  SINCE_PATTERN,
  SOURCE_PATTERN,
  SourceError,
  TRUST,
  assertEventsListConformance,
  canonicalCode,
  cut,
  decodeCursor,
  encodeCursor,
  eventHash,
  eventProblems,
  eventsListConformance,
  eventsListResult,
  fitPage,
  isEventKind,
  makeEvent,
  oldestFirst,
  parseEventsListInput,
  parseSourceError,
  resultProblems,
  scopeProblems,
  screenEvents,
  secretKinds,
  sinceTime,
  startTime
};

// @we-the-rebel-alliance/source-contract 0.1.0. Built by scripts/build.mjs; do not edit.
import {
  MAX_CURSOR_LENGTH,
  canonicalScope
} from "./chunk-I2RXJJJM.js";

// src/internal/secrets.ts
var PRIVATE_KEY_BLOCK = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----|$)/g;
var SHAPED = Object.freeze([
  // At a word start, with a key-like tail: 20 or more key characters, letters and digits.
  ["api key", /(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{20,}/g, (match) => /\d/.test(match.slice(3)) && /[A-Za-z]/.test(match.slice(3))],
  ["api key", /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/g],
  ["api key", /\bAIza[0-9A-Za-z_-]{30,}/g],
  ["api key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ["api key", /\b(?:AccountKey|SharedAccessKey)=[A-Za-z0-9+/]{20,}={0,2}/g],
  ["token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{8,}/g],
  ["token", /\bgithub_pat_[A-Za-z0-9_]{20,}/g],
  ["token", /\bglpat-[A-Za-z0-9_-]{16,}/g],
  ["token", /\bxox[bpars]-[A-Za-z0-9-]{10,}/g],
  ["token", /\bnpm_[A-Za-z0-9]{30,}/g],
  ["token", /\bhf_[A-Za-z0-9]{30,}/g],
  ["token", /\bdop_v1_[A-Za-z0-9]{40,}/g],
  ["token", /https:\/\/hooks\.slack\.com\/(?:services|workflows|triggers)\/[A-Za-z0-9_/-]{20,}/g],
  ["token", /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g]
]);
var BEARER = /\bBearer\s+([A-Za-z0-9._~+/=-]+)/gi;
var AUTH_HEADER = /\b(?:authorization|x-api-key)\b["']?\s*[:=]\s*(?:"([^"\n]*)"|'([^'\n]*)'|([^\s,;]+(?:[ \t]+[^\s,;]+)?))/gi;
var CONNECTION = /\b[a-z][a-z0-9+.-]*:\/\/([^\s:@/]+):([^\s/]*)@[^\s@/]+/gi;
var CREDENTIAL_KEYS = "api[_-]?key|apikey|access[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|client[_-]?secret|secret[_-]?key|private[_-]?key|passphrase|password|passwd|pwd|token|secret";
var ASSIGNMENT = new RegExp(
  String.raw`(?<![A-Za-z0-9])([A-Za-z0-9_.-]*?(${CREDENTIAL_KEYS}))["']?((?:[ \t]+(?:is|was))?[ \t]*[:=][ \t]*(?:\r?\n[ \t]*)?)(?:"([^"\n]*)"|'([^'\n]*)'|` + "`([^`\\n]*)`" + String.raw`|([^\s,;&]+))`,
  "gi"
);
var PLACEHOLDER = /^(?:\[[^\]]*\]|<[^>]*>|\{\{.*\}\}|\$\{?[A-Za-z_][\w.]*\}?|%[A-Za-z_]\w*%|\*+|x{3,}|\.{2,}|…|-+|true|false|null|nil|none|undefined|string|str|number|int|bool|required|optional|env|secret|password|token|redacted|placeholder|changeme|example|your[_-]?\w*|(?:process\.env|os\.environ|env)\b.*)$/i;
var JWT_IO_SAMPLE = /eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ|SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c/;
var TOKENISH = /^[A-Za-z0-9._~+/=!@#$%^&*()\-:]+$/;
function documentation(value) {
  const v = String(value ?? "").trim();
  return PLACEHOLDER.test(v) || /example/i.test(v) || /x{4,}/i.test(v) || /<[^>]*>/.test(v) || /\byour[-_][\w-]*here\b/i.test(v) || /\$\{|\{\{/.test(v) || JWT_IO_SAMPLE.test(v) || /[…]|\.{3}$/.test(v);
}
function codeValue(value) {
  const v = String(value ?? "").trim();
  return (
    // `session.accessToken`, `config.secretKey`: identifiers, not a random token with digits in it.
    /^[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)+;?$/.test(v) && (v.match(/\d/g) ?? []).length <= 2 || /^(?:await\s+)?[A-Za-z_$][\w$.]*\(/.test(v) || /^(?:~|\.{1,2})?\/[\w./-]*$/.test(v) || /^(?:process\.env|os\.environ|import\.meta\.env)\b/.test(v)
  );
}
function entropy(value) {
  const counts = /* @__PURE__ */ new Map();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}
function tokenShaped(value, min = 12) {
  const v = String(value ?? "").trim();
  return v.length >= min && TOKENISH.test(v) && /\d/.test(v) && /[A-Za-z]/.test(v) && entropy(v) >= 3 && !documentation(v) && !codeValue(v);
}
var PROSE_WORDS = new Set(
  "a an the is are was were be been must should shall will can may not no never always every each at least most of to in on for and or with by from via see use uses used set stored managed rotated rotate required policy characters chars minimum maximum change changed expires expire reset same as one this that it its".split(" ")
);
function passphrase(rest) {
  const line2 = String(rest ?? "").trim();
  if (line2.length < 16 || /[.!?]$/.test(line2)) return false;
  const words = line2.split(/\s+/);
  return words.length >= 3 && words.length <= 8 && words.every((word) => /^[A-Za-z][A-Za-z'-]*$/.test(word) && !PROSE_WORDS.has(word.toLowerCase()));
}
function credentialValue(value, quoted, key, query) {
  const v = String(value ?? "").trim();
  if (!v || documentation(v)) return false;
  if (query) return tokenShaped(v, 16);
  const loose = /^(?:token|secret)$/i.test(key);
  if (quoted) return v.length >= (loose ? 8 : 4) && !/^\d+(?:\.\d+)?$/.test(v) && !/^[A-Za-z_$][\w$.]*\(|^\$\{/.test(v);
  if (codeValue(v) || !TOKENISH.test(v) || /^\d+(?:\.\d+)?$/.test(v)) return false;
  if (v.length < (loose ? 8 : 6)) return false;
  return /\d/.test(v) || /[^A-Za-z0-9]/.test(v) || /.[A-Z]/.test(v);
}
function secretKinds(text2) {
  const value = String(text2 ?? "");
  const kinds = /* @__PURE__ */ new Set();
  if (new RegExp(PRIVATE_KEY_BLOCK.source).test(value)) kinds.add("private key");
  for (const [kind, pattern, valid] of SHAPED) {
    for (const match of value.matchAll(pattern)) if (!documentation(match[0]) && (!valid || valid(match[0]))) kinds.add(kind);
  }
  for (const match of value.matchAll(BEARER)) if (tokenShaped(match[1])) kinds.add("token");
  for (const match of value.matchAll(AUTH_HEADER)) {
    const v = String(match[1] ?? match[2] ?? match[3] ?? "").trim().replace(/^(?:Bearer|Basic|Token|Bot)\s+/i, "");
    if (tokenShaped(v)) kinds.add("token");
  }
  for (const match of value.matchAll(CONNECTION)) if (match[2].length >= 3 && !documentation(match[2])) kinds.add("connection string");
  for (const match of value.matchAll(ASSIGNMENT)) {
    const key = match[2];
    const quoted = match[4] ?? match[5] ?? match[6];
    const bare = match[7];
    const crossed = /\n/.test(match[3]);
    if (crossed && bare !== void 0 && /^[A-Za-z_][\w.-]*[:=]/.test(bare)) continue;
    const query = /[?&]/.test(value[match.index - 1] ?? "");
    const password = /pass|pwd/i.test(key);
    let found = credentialValue(quoted ?? bare, quoted !== void 0, key, query);
    if (!found && password && quoted === void 0 && !query) {
      const start = match.index + match[0].length - (bare ?? "").length;
      const end = value.indexOf("\n", start);
      found = passphrase(value.slice(start, end === -1 ? value.length : end));
    }
    if (found) kinds.add(password ? "password" : /token/i.test(key) ? "token" : "api key");
  }
  return [...kinds];
}

// src/internal/events.ts
import { createHash } from "node:crypto";
var EVENTS_LIST = "events_list";
var EVENT_KINDS = ["message", "meeting", "session", "bookmark", "issue", "pr", "commit", "doc", "event", "task", "file"];
var EXTENSION_KIND = /^x-[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/;
var isEventKind = (kind) => typeof kind === "string" && (EVENT_KINDS.includes(kind) || kind.length <= 64 && EXTENSION_KIND.test(kind));
var EVENT_LIMITS = {
  source: 64,
  account: 128,
  externalId: 512,
  thread: 512,
  title: 300,
  text: 4096,
  url: 2048,
  actors: 20,
  actorRole: 32,
  actorId: 320,
  actorName: 200,
  labels: 20,
  label: 64,
  ownerId: 320,
  ownerLabel: 200,
  cursor: MAX_CURSOR_LENGTH,
  scopeKeys: 16,
  scopeKey: 64,
  scopeValues: 64,
  scopeValue: 256,
  refused: 500,
  failed: 500,
  detail: 200,
  costUnits: 8
};
var PAGE = { default: 100, min: 1, max: 500 };
var MAX_PAGE_BYTES = 9e5;
var MAX_BYTES = { default: 65536, max: 1048576 };
var FIRST_RUN_HOURS = 24;
var TRUST = "untrusted";
var REFUSAL_REASONS = ["instruction", "secret", "owner"];
var GAP_REASONS = ["expired", "window-truncated"];
var ERROR_CODES = [
  "NEEDS_SIGN_IN",
  "ACCOUNT_MISMATCH",
  "CURSOR_INVALID",
  "CURSOR_EXPIRED",
  "RATE_LIMITED",
  "TOO_LARGE",
  "SCHEMA_VIOLATION",
  "PERMISSION_DENIED",
  "UNAVAILABLE",
  "SCOPE_MISSING",
  "BUDGET_EXCEEDED",
  "SOURCE_DISABLED"
];
var PROPOSED_CODES = ["INPUT_INVALID", "SOURCE_UNKNOWN"];
var ERROR_ALIASES = { AUTH_REQUIRED: "NEEDS_SIGN_IN" };
var CONTRACT1_CODES = {
  EVENTS_INVALID_INPUT: "INPUT_INVALID",
  EVENTS_CURSOR_INVALID: "CURSOR_INVALID",
  EVENTS_SOURCE_UNKNOWN: "SOURCE_UNKNOWN"
};
function canonicalCode(code) {
  if (ERROR_CODES.includes(code) || PROPOSED_CODES.includes(code)) return code;
  return ERROR_ALIASES[code] ?? CONTRACT1_CODES[code];
}
var SourceError = class extends Error {
  code;
  what;
  next;
  retryAfterSec;
  gap;
  constructor(init) {
    super(`${init.code}: ${init.what.replace(/[.\s]+$/, "")}. Next step: ${init.next}`);
    this.name = "SourceError";
    this.code = init.code;
    this.what = init.what;
    this.next = init.next;
    if (init.retryAfterSec !== void 0) this.retryAfterSec = init.retryAfterSec;
    if (init.gap !== void 0) this.gap = init.gap;
  }
};
var FAMILY_MESSAGE = /^([A-Z][A-Z0-9_]*): ([^]*?)(?:\. Next step: ([^]*))?$/;
function parseSourceError(error) {
  if (error instanceof SourceError) {
    const canonical2 = canonicalCode(error.code);
    return { code: error.code, ...canonical2 ? { canonical: canonical2 } : {}, what: error.what, next: error.next };
  }
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : void 0;
  const match = message === void 0 ? null : FAMILY_MESSAGE.exec(message.split("\n", 1)[0] ?? "");
  if (!match) return void 0;
  const canonical = canonicalCode(match[1]);
  return { code: match[1], ...canonical ? { canonical } : {}, what: match[2], ...match[3] === void 0 ? {} : { next: match[3] } };
}
var SINCE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2}))?$/;
var SOURCE_PATTERN = /^[a-z][a-z0-9-]*$/;
var SCOPE_KEY_PATTERN = /^[a-z][A-Za-z0-9_-]*$/;
var INPUT_KEYS = ["since", "cursor", "limit", "account", "source"];
var hasControl = (text2) => [...text2].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
var plainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function sinceTime(since) {
  if (!SINCE_PATTERN.test(since)) return void 0;
  const time = Date.parse(since.length === 10 ? `${since}T00:00:00Z` : since);
  return Number.isFinite(time) ? time : void 0;
}
var scopeValue = (value) => typeof value === "string" && value.length > 0 && value.length <= EVENT_LIMITS.scopeValue && !hasControl(value);
function scopeProblems(scope, keys) {
  if (!plainObject(scope)) return [`"scope" must be an object of the source's scope keys`];
  const problems = [];
  const entries = Object.entries(scope);
  if (entries.length > EVENT_LIMITS.scopeKeys) problems.push(`"scope" has more than ${EVENT_LIMITS.scopeKeys} keys`);
  for (const [key, value] of entries) {
    if (!keys.includes(key)) {
      problems.push(SCOPE_KEY_PATTERN.test(key) && key.length <= EVENT_LIMITS.scopeKey ? `"scope.${key}" is not a scope key of this source` : `"scope" has a key that is not a scope key of this source`);
      continue;
    }
    const ok = scopeValue(value) || Array.isArray(value) && value.length <= EVENT_LIMITS.scopeValues && value.every(scopeValue);
    if (!ok) problems.push(`"scope.${key}" must be a value, or a list of at most ${EVENT_LIMITS.scopeValues} values, of at most ${EVENT_LIMITS.scopeValue} characters`);
  }
  return problems;
}
function parseEventsListInput(input, options = {}) {
  const value = input === void 0 || input === null ? {} : input;
  if (!plainObject(value)) return { ok: false, problems: ["the input must be an object"] };
  const scoped = (options.scopeKeys?.length ?? 0) > 0;
  const known = scoped ? [...INPUT_KEYS, "scope"] : INPUT_KEYS;
  const problems = Object.keys(value).filter((key) => !known.includes(key)).map((key) => `"${key}" is not an input of events_list`);
  const { since, cursor, limit, account, source, scope } = value;
  let time;
  if (since !== void 0) {
    time = typeof since === "string" ? sinceTime(since) : void 0;
    if (time === void 0) problems.push(`"since" must be an ISO date, or an ISO date-time with Z or an offset`);
  }
  if (cursor !== void 0 && (typeof cursor !== "string" || cursor.length === 0 || cursor.length > EVENT_LIMITS.cursor)) {
    problems.push(`"cursor" must be a cursor from a previous result`);
  }
  if (limit !== void 0 && (typeof limit !== "number" || !Number.isInteger(limit) || limit < PAGE.min || limit > PAGE.max)) {
    problems.push(`"limit" must be an integer from ${PAGE.min} to ${PAGE.max}`);
  }
  if (account !== void 0 && (typeof account !== "string" || account.length === 0 || account.length > EVENT_LIMITS.account || hasControl(account))) {
    problems.push(`"account" must be a non-empty account name of at most ${EVENT_LIMITS.account} characters`);
  }
  if (source !== void 0 && (typeof source !== "string" || source.length > EVENT_LIMITS.source || !SOURCE_PATTERN.test(source))) {
    problems.push(`"source" must be a source's name, a lowercase word such as gmail`);
  }
  if (scoped && scope !== void 0) problems.push(...scopeProblems(scope, options.scopeKeys));
  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    value: {
      ...time === void 0 ? {} : { since: time },
      ...cursor === void 0 ? {} : { cursor },
      limit: limit ?? PAGE.default,
      ...account === void 0 ? {} : { account },
      ...source === void 0 ? {} : { source },
      ...scoped && scope !== void 0 ? { scope: canonicalScope(scope) } : {}
    }
  };
}
function startTime(request, now) {
  return request.since ?? now - FIRST_RUN_HOURS * 36e5;
}
function cut(text2, max) {
  if (text2.length <= max) return text2;
  let end = Math.max(0, max - 1);
  const code = text2.charCodeAt(end - 1);
  if (end > 0 && code >= 55296 && code <= 56319) end--;
  return `${text2.slice(0, end)}\u2026`;
}
function eventHash(event) {
  const fields = [
    event.source,
    event.account,
    event.external_id,
    event.kind,
    event.occurred_at,
    event.thread,
    event.actors.map((actor) => [actor.role, actor.id, actor.name ?? null]),
    event.title,
    event.text,
    event.url,
    event.labels
  ];
  return `sha256:${createHash("sha256").update(JSON.stringify(fields)).digest("hex")}`;
}
var clean = (text2) => text2.replaceAll("\0", "");
var oneLine = (text2) => clean(text2).replace(/\s+/g, " ").trim();
function makeEvent(draft) {
  const time = draft.occurred_at instanceof Date ? draft.occurred_at.getTime() : typeof draft.occurred_at === "number" ? draft.occurred_at : Date.parse(draft.occurred_at);
  if (!Number.isFinite(time)) throw new Error("events-list: an event's occurred_at is not a time");
  const seen = /* @__PURE__ */ new Set();
  const actors = [];
  for (const actor of draft.actors ?? []) {
    const role = oneLine(actor.role).toLowerCase();
    const id = oneLine(actor.id);
    const key = `${role}\0${id}`;
    if (!role || !id || seen.has(key) || actors.length >= EVENT_LIMITS.actors) continue;
    seen.add(key);
    const name = actor.name ? cut(oneLine(actor.name), EVENT_LIMITS.actorName) : "";
    actors.push(name ? { role, id, name } : { role, id });
  }
  const labels = [...new Set((draft.labels ?? []).map((label) => oneLine(label).replace(/\s/g, "-")).filter((label) => label.length > 0 && label.length <= EVENT_LIMITS.label))].slice(0, EVENT_LIMITS.labels);
  const url = draft.url && /^https:\/\/\S+$/.test(draft.url) && draft.url.length <= EVENT_LIMITS.url ? draft.url : null;
  const thread = draft.thread ? oneLine(draft.thread) || null : null;
  const event = {
    source: draft.source,
    account: draft.account,
    external_id: draft.external_id,
    kind: draft.kind,
    occurred_at: new Date(time).toISOString(),
    thread,
    actors,
    title: cut(oneLine(draft.title ?? ""), EVENT_LIMITS.title),
    text: cut(clean(draft.text ?? "").trim(), EVENT_LIMITS.text),
    url,
    labels
  };
  return { ...event, hash: eventHash(event) };
}
function oldestFirst(events) {
  return events.map((event, index) => ({ event, index, time: Date.parse(event.occurred_at) })).sort((a, b) => a.time - b.time || a.index - b.index).map(({ event }) => event);
}
function fitPage(events, limit, maxBytes = MAX_PAGE_BYTES) {
  let bytes = 2048;
  let count = 0;
  for (const event of events) {
    if (count >= limit) break;
    bytes += Buffer.byteLength(JSON.stringify(event)) + 1;
    if (count > 0 && bytes > maxBytes) break;
    count++;
  }
  return count;
}
function screenEvents(events, options = {}) {
  const detect = options.secrets ?? secretKinds;
  const kept = [];
  const refused = [];
  for (const event of events) {
    if (options.ownedBy && !options.ownedBy(event)) {
      refused.push({ external_id: event.external_id, reason: "owner" });
      continue;
    }
    const kinds = detect([event.title, event.text].filter(Boolean).join("\n"));
    if (kinds.length > 0) {
      refused.push({ external_id: event.external_id, reason: "secret", detail: cut(`holds a secret (${kinds.join(", ")})`, EVENT_LIMITS.detail) });
      continue;
    }
    if (options.instruction?.(event)) {
      refused.push({ external_id: event.external_id, reason: "instruction" });
      continue;
    }
    kept.push(event);
  }
  return { events: kept, refused };
}
function eventsListResult(identity, events, cursor, more, extras = {}) {
  return {
    source: identity.source,
    account: identity.account,
    owner: identity.owner,
    events: [...events],
    cursor,
    more,
    trust: TRUST,
    ...extras.scope === void 0 ? {} : { scope: canonicalScope(extras.scope) },
    ...extras.refused && extras.refused.length > 0 ? { refused: [...extras.refused] } : {},
    ...extras.failed && extras.failed.length > 0 ? { failed: [...extras.failed] } : {},
    ...extras.gap === void 0 ? {} : { gap: extras.gap },
    ...extras.cost === void 0 ? {} : { cost: extras.cost },
    ...extras.plugin === void 0 ? {} : { plugin: extras.plugin },
    ...extras.asOf === void 0 ? {} : { asOf: extras.asOf }
  };
}
var ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
var ROLE = /^[a-z][a-z0-9_-]*$/;
var SCHEMED = /^[a-z][a-z0-9+.-]*:\S+$/;
var HASH = /^sha256:[0-9a-f]{64}$/;
var CODE = /^[A-Z][A-Z0-9_]*$/;
var UNIT = /^[a-z][a-z0-9_-]*$/;
var text = (value, max, empty = false) => typeof value === "string" && value.length <= max && (empty || value.length > 0) && !value.includes("\0");
var line = (value, max, empty = false) => text(value, max, empty) && !hasControl(value);
var isoUtc = (value) => typeof value === "string" && ISO_UTC.test(value) && Number.isFinite(Date.parse(value));
function eventProblems(event, where = "event") {
  if (!plainObject(event)) return [`${where} is not an object`];
  const problems = [];
  const keys = ["source", "account", "external_id", "kind", "occurred_at", "thread", "actors", "title", "text", "url", "labels", "hash"];
  for (const key of Object.keys(event)) if (!keys.includes(key)) problems.push(`${where} has the field "${key}", which the contract does not define`);
  for (const key of keys) if (!Object.hasOwn(event, key)) problems.push(`${where} has no "${key}"`);
  const e = event;
  if (!line(e.source, EVENT_LIMITS.source) || !SOURCE_PATTERN.test(e.source)) problems.push(`${where}.source must be a lowercase name such as gmail`);
  if (!line(e.account, EVENT_LIMITS.account)) problems.push(`${where}.account must be a non-empty name of at most ${EVENT_LIMITS.account} characters`);
  if (!line(e.external_id, EVENT_LIMITS.externalId)) problems.push(`${where}.external_id must be a non-empty id of at most ${EVENT_LIMITS.externalId} characters`);
  if (!isEventKind(e.kind)) problems.push(`${where}.kind must be one of ${EVENT_KINDS.join(", ")}, or x-<plugin>/<kind>`);
  if (!isoUtc(e.occurred_at)) problems.push(`${where}.occurred_at must be a UTC ISO date-time ending in Z`);
  if (e.thread !== null && !line(e.thread, EVENT_LIMITS.thread)) problems.push(`${where}.thread must be null or a non-empty id of at most ${EVENT_LIMITS.thread} characters`);
  if (!line(e.title, EVENT_LIMITS.title, true)) problems.push(`${where}.title must be one line of at most ${EVENT_LIMITS.title} characters`);
  if (!text(e.text, EVENT_LIMITS.text, true)) problems.push(`${where}.text must be at most ${EVENT_LIMITS.text} characters`);
  if (e.url !== null && (typeof e.url !== "string" || e.url.length > EVENT_LIMITS.url || !/^https:\/\/\S+$/.test(e.url))) problems.push(`${where}.url must be null or an https URL`);
  if (!Array.isArray(e.labels) || e.labels.length > EVENT_LIMITS.labels || e.labels.some((label) => !line(label, EVENT_LIMITS.label) || /\s/.test(label))) {
    problems.push(`${where}.labels must be at most ${EVENT_LIMITS.labels} labels of at most ${EVENT_LIMITS.label} characters without spaces`);
  } else if (new Set(e.labels).size !== e.labels.length) problems.push(`${where}.labels repeats a label`);
  if (!Array.isArray(e.actors) || e.actors.length > EVENT_LIMITS.actors) problems.push(`${where}.actors must be a list of at most ${EVENT_LIMITS.actors}`);
  else {
    const seen = /* @__PURE__ */ new Set();
    for (const [index, actor] of e.actors.entries()) {
      const at = `${where}.actors[${index}]`;
      if (!plainObject(actor)) {
        problems.push(`${at} is not an object`);
        continue;
      }
      for (const key2 of Object.keys(actor)) if (!["role", "id", "name"].includes(key2)) problems.push(`${at} has the field "${key2}", which the contract does not define`);
      if (!line(actor.role, EVENT_LIMITS.actorRole) || !ROLE.test(actor.role)) problems.push(`${at}.role must be a lowercase word such as from`);
      if (!line(actor.id, EVENT_LIMITS.actorId) || !SCHEMED.test(actor.id)) problems.push(`${at}.id must be a scheme-qualified id such as mailto:someone@example.com`);
      if (actor.name !== void 0 && !line(actor.name, EVENT_LIMITS.actorName)) problems.push(`${at}.name must be one non-empty line of at most ${EVENT_LIMITS.actorName} characters`);
      const key = `${String(actor.role)}\0${String(actor.id)}`;
      if (seen.has(key)) problems.push(`${at} repeats an actor`);
      seen.add(key);
    }
  }
  if (typeof e.hash !== "string" || !HASH.test(e.hash)) problems.push(`${where}.hash must be sha256: and 64 hex digits`);
  else if (problems.length === 0) {
    const { hash, ...rest } = e;
    if (eventHash(rest) !== hash) problems.push(`${where}.hash is not the eventHash of its fields`);
  }
  return problems;
}
var RESULT_KEYS = ["source", "account", "owner", "events", "cursor", "more", "trust"];
var EXTRA_KEYS = ["scope", "refused", "failed", "gap", "cost", "plugin", "asOf"];
function extraProblems(result, ids) {
  const problems = [];
  if (result["scope"] !== void 0) {
    const scope = result["scope"];
    let canonical = false;
    try {
      canonical = plainObject(scope) && JSON.stringify(canonicalScope(scope)) === JSON.stringify(scope);
    } catch {
      canonical = false;
    }
    if (!canonical || scopeProblems(scope, Object.keys(scope)).length > 0) problems.push("the result's scope must be a scope in canonical form: keys sorted, each list sorted without repeats");
  }
  const entries = (name, max, check) => {
    const list = result[name];
    if (list === void 0) return;
    if (!Array.isArray(list) || list.length > max) {
      problems.push(`the result's ${name} must be a list of at most ${max}`);
      return;
    }
    for (const [index, entry] of list.entries()) {
      const at = `${name}[${index}]`;
      if (!plainObject(entry)) {
        problems.push(`${at} is not an object`);
        continue;
      }
      if (!line(entry["external_id"], EVENT_LIMITS.externalId)) problems.push(`${at}.external_id must be a non-empty id of at most ${EVENT_LIMITS.externalId} characters`);
      else if (ids.has(entry["external_id"])) problems.push(`${at} is also among the result's events`);
      problems.push(...check(entry, at));
    }
  };
  entries("refused", EVENT_LIMITS.refused, (entry, at) => [
    ...Object.keys(entry).filter((key) => !["external_id", "reason", "detail"].includes(key)).map((key) => `${at} has the field "${key}", which the contract does not define`),
    ...REFUSAL_REASONS.includes(entry["reason"]) ? [] : [`${at}.reason must be one of ${REFUSAL_REASONS.join(", ")}`],
    ...entry["detail"] === void 0 || line(entry["detail"], EVENT_LIMITS.detail) ? [] : [`${at}.detail must be one line of at most ${EVENT_LIMITS.detail} characters`]
  ]);
  entries("failed", EVENT_LIMITS.failed, (entry, at) => [
    ...Object.keys(entry).filter((key) => !["external_id", "code", "retryAfterSec"].includes(key)).map((key) => `${at} has the field "${key}", which the contract does not define`),
    ...typeof entry["code"] === "string" && CODE.test(entry["code"]) ? [] : [`${at}.code must be an error code such as RATE_LIMITED`],
    ...entry["retryAfterSec"] === void 0 || typeof entry["retryAfterSec"] === "number" && Number.isInteger(entry["retryAfterSec"]) && entry["retryAfterSec"] >= 0 ? [] : [`${at}.retryAfterSec must be a whole number of seconds`]
  ]);
  for (const name of ["refused", "failed"]) {
    const list = result[name];
    if (Array.isArray(list)) {
      const listed = list.map((entry) => plainObject(entry) ? entry["external_id"] : void 0);
      if (new Set(listed).size !== listed.length) problems.push(`the result's ${name} lists one event twice`);
    }
  }
  if (Array.isArray(result["refused"]) && Array.isArray(result["failed"])) {
    const refused = new Set(result["refused"].map((entry) => plainObject(entry) ? entry["external_id"] : void 0));
    if (result["failed"].some((entry) => plainObject(entry) && refused.has(entry["external_id"]))) problems.push("an event is both refused and failed");
  }
  if (result["gap"] !== void 0) {
    const gap = result["gap"];
    if (!plainObject(gap) || Object.keys(gap).some((key) => key !== "reason" && key !== "since") || !GAP_REASONS.includes(gap["reason"]) || !isoUtc(gap["since"])) {
      problems.push(`the result's gap must be { reason: ${GAP_REASONS.join(" or ")}, since: a UTC ISO date-time }`);
    }
  }
  if (result["cost"] !== void 0) {
    const cost = result["cost"];
    const units = plainObject(cost) ? cost["units"] : void 0;
    const unitsOk = Array.isArray(units) && units.length <= EVENT_LIMITS.costUnits && units.every((unit) => plainObject(unit) && Object.keys(unit).every((key) => key === "per" || key === "count") && typeof unit["per"] === "string" && UNIT.test(unit["per"]) && typeof unit["count"] === "number" && Number.isInteger(unit["count"]) && unit["count"] >= 0);
    const usd = plainObject(cost) ? cost["usd"] : void 0;
    const usdOk = usd === void 0 || typeof usd === "number" && Number.isFinite(usd) && usd >= 0;
    if (!plainObject(cost) || Object.keys(cost).some((key) => key !== "units" && key !== "usd") || !unitsOk || !usdOk) {
      problems.push("the result's cost must be { units: [{ per, count }], usd? }, with whole counts and a non-negative usd");
    }
  }
  if (result["plugin"] !== void 0 && !line(result["plugin"], 214)) problems.push("the result's plugin must be the plugin's package name or id");
  if (result["asOf"] !== void 0 && !isoUtc(result["asOf"])) problems.push("the result's asOf must be a UTC ISO date-time ending in Z");
  return problems;
}
function resultProblems(result, limit = PAGE.max, maxBytes = MAX_PAGE_BYTES) {
  if (!plainObject(result)) return ["the result is not an object"];
  const problems = [];
  for (const key of Object.keys(result)) if (!RESULT_KEYS.includes(key) && !EXTRA_KEYS.includes(key)) problems.push(`the result has the field "${key}", which the contract does not define`);
  const { source, account } = result;
  const named = line(source, EVENT_LIMITS.source) && SOURCE_PATTERN.test(source);
  if (!named) problems.push("the result's source must be a lowercase name such as gmail");
  if (!line(account, EVENT_LIMITS.account)) problems.push(`the result's account must be a non-empty name of at most ${EVENT_LIMITS.account} characters`);
  const owner = result["owner"];
  if (!plainObject(owner) || !line(owner["id"], EVENT_LIMITS.ownerId) || !line(owner["label"], EVENT_LIMITS.ownerLabel) || Object.keys(owner).some((key) => key !== "id" && key !== "label")) {
    problems.push("the result's owner must be { id, label }, two non-empty lines");
  }
  const cursor = result["cursor"];
  if (typeof cursor !== "string" || cursor.length === 0 || cursor.length > EVENT_LIMITS.cursor) problems.push(`the result's cursor must be a non-empty string of at most ${EVENT_LIMITS.cursor} characters`);
  if (typeof result["more"] !== "boolean") problems.push("the result's more must be true or false");
  if (result["trust"] !== TRUST) problems.push(`the result's trust must be "${TRUST}"`);
  const events = result["events"];
  if (!Array.isArray(events)) return [...problems, "the result's events must be a list"];
  if (events.length > limit) problems.push(`the result has ${events.length} events, over the limit of ${limit}`);
  for (const [index, event] of events.entries()) {
    problems.push(...eventProblems(event, `events[${index}]`));
    if (plainObject(event) && named && event["source"] !== source) problems.push(`events[${index}] names another source than the result`);
    if (plainObject(event) && typeof account === "string" && event["account"] !== account) problems.push(`events[${index}] names another account than the result`);
  }
  const times = events.map((event) => Date.parse(plainObject(event) ? String(event["occurred_at"]) : ""));
  if (times.some((time, index) => index > 0 && time < times[index - 1])) problems.push("the result's events are not oldest first");
  const ids = events.map((event) => plainObject(event) ? `${String(event["source"])}:${String(event["account"])}:${String(event["external_id"])}` : "");
  if (new Set(ids).size !== ids.length) problems.push("the result lists one event twice");
  problems.push(...extraProblems(result, new Set(events.map((event) => plainObject(event) ? String(event["external_id"]) : ""))));
  const bytes = Buffer.byteLength(JSON.stringify(result));
  if (bytes > maxBytes) problems.push(`the result is ${bytes} bytes of JSON, over ${maxBytes}`);
  return problems;
}

export {
  secretKinds,
  EVENTS_LIST,
  EVENT_KINDS,
  EXTENSION_KIND,
  isEventKind,
  EVENT_LIMITS,
  PAGE,
  MAX_PAGE_BYTES,
  MAX_BYTES,
  FIRST_RUN_HOURS,
  TRUST,
  REFUSAL_REASONS,
  GAP_REASONS,
  ERROR_CODES,
  PROPOSED_CODES,
  ERROR_ALIASES,
  CONTRACT1_CODES,
  canonicalCode,
  SourceError,
  parseSourceError,
  SINCE_PATTERN,
  SOURCE_PATTERN,
  SCOPE_KEY_PATTERN,
  sinceTime,
  scopeProblems,
  parseEventsListInput,
  startTime,
  cut,
  eventHash,
  makeEvent,
  oldestFirst,
  fitPage,
  screenEvents,
  eventsListResult,
  eventProblems,
  resultProblems
};

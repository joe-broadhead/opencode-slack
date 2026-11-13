// @we-the-rebel-alliance/source-contract 0.1.0. Built by scripts/build.mjs; do not edit.

// src/params.ts
var MAX_RELATIVE_DAYS = 366;
var WINDOWS = ["today", "yesterday", "tomorrow"];
var ME = "$me";
var RELATIVE = /^(?:now|([+-])(\d{1,6})([mhdw]))$/;
var ABSOLUTE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2}))?$/;
var MINUTE = 6e4;
var DAY_MINUTES = 24 * 60;
var plain = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var epoch = (now) => now instanceof Date ? now.getTime() : now;
function isTimeZone(timeZone) {
  if (typeof timeZone !== "string" || timeZone.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone });
    return true;
  } catch {
    return false;
  }
}
var formatters = /* @__PURE__ */ new Map();
function formatter(timeZone) {
  let found = formatters.get(timeZone);
  if (!found) {
    found = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    formatters.set(timeZone, found);
  }
  return found;
}
function wall(instant, timeZone) {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute) };
}
function offset(instant, timeZone) {
  const at = wall(instant, timeZone);
  return Date.UTC(at.year, at.month - 1, at.day, at.hour, at.minute) - Math.floor(instant / MINUTE) * MINUTE;
}
function instantOf(at, timeZone) {
  const guess = Date.UTC(at.year, at.month - 1, at.day, at.hour, at.minute);
  const before = guess - offset(guess - 12 * 60 * MINUTE, timeZone);
  const after = guess - offset(guess + 12 * 60 * MINUTE, timeZone);
  const same = (instant) => {
    const found = wall(instant, timeZone);
    return found.year === at.year && found.month === at.month && found.day === at.day && found.hour === at.hour && found.minute === at.minute;
  };
  const valid = [before, after].filter(same);
  return valid.length > 0 ? Math.min(...valid) : before;
}
var iso = (instant) => new Date(instant).toISOString();
function resolveRelativeTime(value, context) {
  const match = RELATIVE.exec(value);
  if (!match) return void 0;
  const now = Math.floor(epoch(context.now) / MINUTE) * MINUTE;
  if (value === "now") return iso(now);
  const amount = Number(match[2]) * (match[1] === "-" ? -1 : 1);
  const unit = match[3];
  const minutes = Math.abs(amount) * { m: 1, h: 60, d: DAY_MINUTES, w: 7 * DAY_MINUTES }[unit];
  if (minutes > MAX_RELATIVE_DAYS * DAY_MINUTES) return void 0;
  if (unit === "m" || unit === "h") return iso(now + amount * (unit === "m" ? 1 : 60) * MINUTE);
  const at = wall(now, context.timeZone);
  const days = amount * (unit === "w" ? 7 : 1);
  const shifted = new Date(Date.UTC(at.year, at.month - 1, at.day + days));
  return iso(instantOf({ ...at, year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() }, context.timeZone));
}
function resolveWindow(name, context) {
  const at = wall(epoch(context.now), context.timeZone);
  const start = { yesterday: -1, today: 0, tomorrow: 1 }[name];
  const midnight = (days) => {
    const date = new Date(Date.UTC(at.year, at.month - 1, at.day + days));
    return iso(instantOf({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: 0, minute: 0 }, context.timeZone));
  };
  return { since: midnight(start), until: midnight(start + 1) };
}
function time(value, where, context) {
  if (typeof value === "string") {
    if (ABSOLUTE.test(value) && Number.isFinite(Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value))) return { ok: true, value };
    const resolved = resolveRelativeTime(value, context);
    if (resolved !== void 0) return { ok: true, value: resolved };
  }
  return {
    ok: false,
    problems: [`${where} must be "now", a relative time such as "-7d" or "+2h" (at most ${MAX_RELATIVE_DAYS} days), or an ISO date-time with Z or an offset`]
  };
}
function relative(value, where, context) {
  if (typeof value === "string" && WINDOWS.includes(value)) return { ok: true, value: resolveWindow(value, context) };
  if (plain(value)) {
    const keys = Object.keys(value);
    const extra = keys.filter((key) => key !== "since" && key !== "until");
    if (extra.length > 0 || keys.length === 0) return { ok: false, problems: [`${where} must be a window: "today", "yesterday", "tomorrow", or { since, until }`] };
    const resolved = {};
    const problems = [];
    for (const key of keys) {
      const checked = time(value[key], `${where}.${key}`, context);
      if (checked.ok) resolved[key] = checked.value;
      else problems.push(...checked.problems);
    }
    if (problems.length === 0 && resolved.since !== void 0 && resolved.until !== void 0 && Date.parse(resolved.since) > Date.parse(resolved.until)) {
      problems.push(`${where}.since is after ${where}.until`);
    }
    return problems.length === 0 ? { ok: true, value: resolved } : { ok: false, problems };
  }
  return time(value, where, context);
}
function contextProblems(context) {
  const problems = [];
  if (!isTimeZone(context.timeZone)) problems.push(`the time zone "${String(context.timeZone)}" is not an IANA time zone this runtime knows`);
  if (!Number.isFinite(epoch(context.now))) problems.push("now is not a time");
  return problems;
}
function resolveParams(declared, given, context) {
  if (given === void 0) return { ok: true, value: {} };
  if (!plain(given)) return { ok: false, problems: ["params must be an object"] };
  const problems = contextProblems(context);
  if (problems.length > 0) return { ok: false, problems };
  const resolved = {};
  for (const [key, value] of Object.entries(given)) {
    const spec = declared && Object.hasOwn(declared, key) ? declared[key] : void 0;
    const where = `params.${key}`;
    if (spec === void 0) {
      problems.push(`${where} is not a param this source declares`);
      continue;
    }
    if (value === ME) {
      if (spec.me !== true) problems.push(`${where} may not be ${ME}: the source does not declare it`);
      else if (typeof context.me !== "string" || context.me.length === 0) problems.push(`${where} is ${ME}, and the signed-in account is not known: probe the source first`);
      else resolved[key] = context.me;
      continue;
    }
    if (spec.relative === true) {
      const checked = relative(value, where, context);
      if (checked.ok) resolved[key] = checked.value;
      else problems.push(...checked.problems);
      continue;
    }
    resolved[key] = value;
  }
  return problems.length === 0 ? { ok: true, value: resolved } : { ok: false, problems };
}
function resolveSince(since, context) {
  const problems = contextProblems(context);
  if (problems.length > 0) return { ok: false, problems };
  return time(since, "since", context);
}

export {
  MAX_RELATIVE_DAYS,
  WINDOWS,
  ME,
  isTimeZone,
  resolveRelativeTime,
  resolveWindow,
  resolveParams,
  resolveSince
};

// @we-the-rebel-alliance/source-contract 0.1.0. Built by scripts/build.mjs; do not edit.

// src/permission.ts
var DENY_ALL = { action: "*", resource: "*", effect: "deny" };
var ACCOUNT_PATTERN = /^[^\s*?:\u0000-\u001f\u007f]{1,320}$/;
var WILDCARD = /[*?]/;
function accountProblem(account) {
  if (typeof account !== "string" || !ACCOUNT_PATTERN.test(account)) {
    return "the account must be 1 to 320 characters with no wildcard (* or ?), no colon and no whitespace";
  }
  return void 0;
}
var allow = (action, resource) => ({ action, resource, effect: "allow" });
function namespaceOf(source) {
  return source.id.split(".")[0] ?? source.id;
}
function operationRule(source, operation, account) {
  const namespace = namespaceOf(source);
  return operation.includes(".") ? allow(`${namespace}.read`, `${account}:${operation}`) : allow(`${namespace}_${operation}`, "*");
}
function fenced(rules) {
  const loose = rules.find((rule) => WILDCARD.test(rule.action) || rule.resource !== "*" && WILDCARD.test(rule.resource));
  if (loose) return { ok: false, problems: [`the rule for ${loose.action} on ${loose.resource} has a wildcard, which would widen the grant`] };
  const seen = /* @__PURE__ */ new Set();
  const unique = rules.filter((rule) => {
    const key = `${rule.action}\0${rule.resource}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { ok: true, value: [DENY_ALL, ...unique] };
}
function methodAction(source) {
  return source.kind === "events" ? source.permission.events : source.permission.tool;
}
function sessionRules(source, grant) {
  if (grant.source !== source.id) return { ok: false, problems: [`the grant is for ${grant.source}, not ${source.id}`] };
  const problem = accountProblem(grant.account);
  if (problem) return { ok: false, problems: [problem] };
  const method = methodAction(source);
  if (method === void 0) return { ok: false, problems: [`${source.id} names no action for its method`] };
  return fenced([allow(method, "*"), ...source.permission.operations.map((operation) => operationRule(source, operation, grant.account))]);
}
function detailRules(source, detailId, grant) {
  if (!source.details?.some((entry) => entry.id === detailId)) return { ok: false, problems: [`${source.id} declares no detail read ${detailId}`] };
  return sessionRules(source, grant);
}
function probeRules(source, account, identityOperations) {
  const problem = accountProblem(account);
  if (problem) return { ok: false, problems: [problem] };
  const method = methodAction(source);
  if (method === void 0) return { ok: false, problems: [`${source.id} names no action for its method`] };
  const content = identityOperations.filter((operation) => source.permission.operations.includes(operation));
  if (content.length > 0) return { ok: false, problems: [`${content.join(", ")} is a content operation of ${source.id}, so a probe may not assert it`] };
  return fenced([allow(method, "*"), ...identityOperations.map((operation) => operationRule(source, operation, account))]);
}
function evaluate(rules, action, resource = "*") {
  return rules.findLast((rule) => wildcard(rule.action, action) && wildcard(rule.resource, resource))?.effect ?? "ask";
}
var wildcard = (pattern, value) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`).test(value);
function grantCovers(grant, request) {
  if (grant.source !== request.source || grant.account !== request.account) return false;
  for (const [key, values] of Object.entries(request.scope ?? {})) {
    const granted = grant.scope?.[key];
    if (!granted || values.some((value) => !granted.includes(value))) return false;
  }
  return true;
}

export {
  DENY_ALL,
  ACCOUNT_PATTERN,
  accountProblem,
  namespaceOf,
  operationRule,
  methodAction,
  sessionRules,
  detailRules,
  probeRules,
  evaluate,
  grantCovers
};

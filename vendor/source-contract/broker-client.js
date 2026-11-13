// @we-the-rebel-alliance/source-contract 0.1.0. Built by scripts/build.mjs; do not edit.
import {
  acceptAnswer,
  checkReadRequest,
  failureFromError,
  read
} from "./chunks/chunk-3SYLFXAZ.js";
import "./chunks/chunk-WTP57O3E.js";
import "./chunks/chunk-ELPJD3ND.js";
import "./chunks/chunk-ZTRH3FEM.js";
import {
  canonicalScope
} from "./chunks/chunk-I2RXJJJM.js";
import "./chunks/chunk-RYNKNCPP.js";
import "./chunks/chunk-F2EQTQXI.js";
import "./chunks/chunk-HVKVERIX.js";
import "./chunks/chunk-UGUA267L.js";
import "./chunks/chunk-6RDMPYYW.js";
import "./chunks/chunk-HLVAKAYG.js";

// src/broker-client.ts
var BROKER_CODE_ALIASES = {
  NOT_GRANTED: "PERMISSION_DENIED",
  UNKNOWN_SOURCE: "UNAVAILABLE",
  INVALID_INPUT: "SCHEMA_VIOLATION",
  PROVIDER_ERROR: "UNAVAILABLE"
};
function brokerRequest(request) {
  const asked = request.scope ?? request.grant.scope;
  const scope = asked === void 0 ? void 0 : canonicalScope(asked);
  return {
    package: request.installed.package,
    version: request.installed.version,
    descriptorHash: request.installed.hash,
    consumer: request.consumer,
    source: request.source,
    account: request.grant.account,
    ...scope === void 0 ? {} : { scope },
    ...request.cursor === void 0 ? {} : { cursor: request.cursor },
    ...request.since === void 0 ? {} : { since: request.since },
    ...request.limit === void 0 ? {} : { limit: request.limit },
    ...request.params === void 0 ? {} : { params: request.params },
    ...request.pick === void 0 ? {} : { pick: request.pick }
  };
}
var plain = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function isBrokerAnswer(answer) {
  if (!plain(answer)) return false;
  if (answer["offered"] === false) return true;
  if (answer["offered"] !== true) return false;
  if (answer["ok"] === true) return "value" in answer;
  return answer["ok"] === false && typeof answer["code"] === "string" && typeof answer["message"] === "string";
}
function sourceReader(options) {
  const { host, broker } = options;
  const embedded = async (request) => ({ ...await read(host, request), via: "embedded" });
  if (!broker) return { read: embedded };
  return {
    async read(request) {
      const checked = checkReadRequest(request);
      if ("ok" in checked) return { ...checked, via: "embedded" };
      let answer;
      try {
        answer = await broker(brokerRequest(request), request.signal);
      } catch {
        return embedded(request);
      }
      if (!isBrokerAnswer(answer) || !answer.offered) return embedded(request);
      if (!answer.ok) {
        const code = BROKER_CODE_ALIASES[answer.code] ?? answer.code;
        const failure = failureFromError({
          code,
          message: answer.message,
          data: { ...answer.next === void 0 ? {} : { next: answer.next }, ...answer.retryAfterSec === void 0 ? {} : { retryAfterSec: answer.retryAfterSec } }
        });
        return { ok: false, failure, via: "broker" };
      }
      const accepted = acceptAnswer(checked.source, request.grant.account, answer.value, {
        ...request.limit === void 0 ? {} : { limit: request.limit },
        ...request.pick === void 0 ? {} : { pick: request.pick }
      });
      return { ...accepted, via: "broker", ...answer.cached === void 0 ? {} : { cached: answer.cached } };
    }
  };
}
export {
  BROKER_CODE_ALIASES,
  brokerRequest,
  isBrokerAnswer,
  sourceReader
};

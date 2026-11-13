// @we-the-rebel-alliance/source-contract 0.1.0. Built by scripts/build.mjs; do not edit.

// src/cursor.ts
import { createHash } from "node:crypto";
var MAX_CURSOR_LENGTH = 1024;
var CURSOR_V1 = 1;
var CURSOR_V2 = 2;
var RESERVED_STATE_KEYS = ["v", "s", "b"];
var plainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var BASE64URL = /^[A-Za-z0-9_-]+$/;
function parse(cursor) {
  if (typeof cursor !== "string" || cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH || !BASE64URL.test(cursor)) return void 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return plainObject(parsed) ? parsed : void 0;
  } catch {
    return void 0;
  }
}
function pack(payload, what) {
  const cursor = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  if (cursor.length > MAX_CURSOR_LENGTH) throw new Error(`cursor: a ${what} cursor is ${cursor.length} characters, over ${MAX_CURSOR_LENGTH}`);
  return cursor;
}
function encodeCursor(source, state) {
  const cursor = Buffer.from(JSON.stringify({ ...state, v: CURSOR_V1, s: source }), "utf8").toString("base64url");
  if (cursor.length > MAX_CURSOR_LENGTH) throw new Error(`events-list: a ${source} cursor is ${cursor.length} characters, over ${MAX_CURSOR_LENGTH}`);
  return cursor;
}
function decodeCursor(source, cursor) {
  const parsed = parse(cursor);
  if (!parsed || parsed["v"] !== CURSOR_V1 || parsed["s"] !== source) return void 0;
  const { v: _v, s: _s, ...state } = parsed;
  return state;
}
function canonicalScope(scope) {
  if (scope === void 0) return {};
  if (!plainObject(scope)) throw new Error("cursor: a scope must be an object");
  const out = {};
  for (const key of Object.keys(scope).sort()) {
    const value = scope[key];
    if (typeof value === "string") out[key] = value;
    else if (Array.isArray(value) && value.every((item) => typeof item === "string")) out[key] = [...new Set(value)].sort();
    else throw new Error(`cursor: the scope key "${key}" must be a string or a list of strings`);
  }
  return out;
}
function bindingHash(binding) {
  const canonical = JSON.stringify([binding.plugin, binding.source, binding.account, canonicalScope(binding.scope)]);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}
function encodeBoundCursor(binding, state) {
  const reserved = Object.keys(state).find((key) => RESERVED_STATE_KEYS.includes(key));
  if (reserved !== void 0) throw new Error(`cursor: the state key "${reserved}" is reserved`);
  return pack({ v: CURSOR_V2, s: binding.source, b: bindingHash(binding), ...state }, `${binding.plugin}/${binding.source}`);
}
function decodeBoundCursor(binding, cursor, options = {}) {
  const parsed = parse(cursor);
  if (!parsed) return { ok: false, reason: "malformed" };
  if (parsed["v"] === CURSOR_V1 && options.acceptV1 === true) {
    if (Object.keys(canonicalScope(binding.scope)).length > 0) return { ok: false, reason: "foreign" };
    const state2 = decodeCursor(binding.source, cursor);
    return state2 ? { ok: true, state: state2, legacy: true } : { ok: false, reason: "foreign" };
  }
  if (parsed["v"] !== CURSOR_V2 || parsed["s"] !== binding.source || parsed["b"] !== bindingHash(binding)) return { ok: false, reason: "foreign" };
  const { v: _v, s: _s, b: _b, ...state } = parsed;
  return { ok: true, state, legacy: false };
}

export {
  MAX_CURSOR_LENGTH,
  CURSOR_V1,
  CURSOR_V2,
  RESERVED_STATE_KEYS,
  encodeCursor,
  decodeCursor,
  canonicalScope,
  bindingHash,
  encodeBoundCursor,
  decodeBoundCursor
};

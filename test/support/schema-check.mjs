// A JSON Schema (2020-12) checker for the constructs `schema/memory-plugin.v2.json` uses, so `check.mjs` needs no
// dependency and no network. It is not a general validator: if the schema grows a keyword this file does not know, the
// check fails loudly (`unsupported`) rather than passing silently. Memory's CI runs the real thing, ajv.
//
// Supported: $ref (local), $defs, type (incl. arrays of types), const, enum, pattern, not, allOf, anyOf, oneOf,
// if/then/else, required, properties, additionalProperties (bool or schema), items, contains, min/maxItems,
// minProperties, minimum, maximum, maxLength.

const KNOWN = new Set([
  "$schema", "$id", "$defs", "$ref", "title", "description", "type", "const", "enum", "pattern", "not", "allOf",
  "anyOf", "oneOf", "if", "then", "else", "required", "properties", "additionalProperties", "items", "contains",
  "minItems", "maxItems", "minProperties", "minimum", "maximum", "maxLength", "default", "examples",
])

const typeOk = (type, value) =>
  type === "null" ? value === null
    : type === "object" ? typeof value === "object" && value !== null && !Array.isArray(value)
    : type === "array" ? Array.isArray(value)
    : type === "integer" ? Number.isInteger(value)
    : type === "number" ? typeof value === "number"
    : type === "string" ? typeof value === "string"
    : type === "boolean" ? typeof value === "boolean"
    : false

/** Every keyword the schema uses, checked once, so an unknown one is an error rather than a silent pass. */
export function unsupportedKeywords(schema, root = schema, seen = new Set()) {
  const found = []
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) return found
  const at = JSON.stringify(schema).slice(0, 60)
  for (const key of Object.keys(schema)) if (!KNOWN.has(key)) found.push(`${key} (near ${at})`)
  for (const key of ["not", "if", "then", "else", "items", "contains", "additionalProperties"]) {
    if (schema[key] && typeof schema[key] === "object") found.push(...unsupportedKeywords(schema[key], root, seen))
  }
  for (const key of ["allOf", "anyOf", "oneOf"]) {
    if (Array.isArray(schema[key])) for (const branch of schema[key]) found.push(...unsupportedKeywords(branch, root, seen))
  }
  if (schema.properties && typeof schema.properties === "object") {
    for (const sub of Object.values(schema.properties)) found.push(...unsupportedKeywords(sub, root, seen))
  }
  if (schema.$defs && typeof schema.$defs === "object") {
    for (const sub of Object.values(schema.$defs)) found.push(...unsupportedKeywords(sub, root, seen))
  }
  return found
}

const resolve = (schema, root) => {
  if (!schema || typeof schema !== "object" || !schema.$ref) return schema
  const parts = schema.$ref.replace(/^#\//, "").split("/")
  let node = root
  for (const part of parts) node = node?.[part]
  return node
}

/** The value's problems against `schema`, one sentence each. */
export function schemaProblems(schema, value, root = schema, at = "memory", out = []) {
  if (schema === true || schema === undefined) return out
  if (schema === false) { out.push(`${at}: not allowed`); return out }
  schema = resolve(schema, root)
  const push = (message) => out.push(`${at}: ${message}`)

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!types.some((type) => typeOk(type, value))) {
      push(`must be ${types.join(" or ")}`)
      return out
    }
  }
  if ("const" in schema && value !== schema.const) push(`must be ${JSON.stringify(schema.const)}`)
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))) {
    push(`must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(", ")}`)
  }
  if (typeof value === "string") {
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) push(`does not match ${schema.pattern}`)
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) push(`is longer than ${schema.maxLength}`)
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) push(`is below ${schema.minimum}`)
    if (typeof schema.maximum === "number" && value > schema.maximum) push(`is above ${schema.maximum}`)
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) push(`has fewer than ${schema.minItems} items`)
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) push(`has more than ${schema.maxItems} items`)
    if (schema.items) value.forEach((item, index) => schemaProblems(schema.items, item, root, `${at}[${index}]`, out))
    if (schema.contains) {
      const hit = value.some((item) => schemaProblems(schema.contains, item, root, at, []).length === 0)
      if (!hit) push("has no item matching the required shape")
    }
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    if (typeof schema.minProperties === "number" && Object.keys(value).length < schema.minProperties) {
      push(`has fewer than ${schema.minProperties} keys`)
    }
    for (const key of schema.required ?? []) if (!(key in value)) push(`must have ${key}`)
    for (const [key, sub] of Object.entries(value)) {
      const declared = schema.properties?.[key]
      if (declared) schemaProblems(declared, sub, root, `${at}.${key}`, out)
      else if (schema.additionalProperties === false) push(`has ${key}, which is not allowed`)
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        schemaProblems(schema.additionalProperties, sub, root, `${at}.${key}`, out)
      }
    }
  }
  if (schema.not) {
    if (schemaProblems(schema.not, value, root, at, []).length === 0) push("matches a shape that is not allowed")
  }
  for (const branch of schema.allOf ?? []) schemaProblems(branch, value, root, at, out)
  if (Array.isArray(schema.anyOf)) {
    if (!schema.anyOf.some((branch) => schemaProblems(branch, value, root, at, []).length === 0)) push("matches none of the allowed shapes")
  }
  if (Array.isArray(schema.oneOf)) {
    const hits = schema.oneOf.filter((branch) => schemaProblems(branch, value, root, at, []).length === 0).length
    if (hits !== 1) push(`matches ${hits} of the shapes that need exactly one`)
  }
  if (schema.if) {
    const matched = schemaProblems(schema.if, value, root, at, []).length === 0
    const branch = matched ? schema.then : schema.else
    if (branch) schemaProblems(branch, value, root, at, out)
  }
  return out
}

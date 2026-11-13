// @we-the-rebel-alliance/source-contract 0.1.0. Built by scripts/build.mjs; do not edit.
import {
  outputValidator
} from "./chunk-UGUA267L.js";

// src/pick.ts
var MAX_PICK_PATHS = 50;
var MAX_PICK_PATH_LENGTH = 200;
var SEGMENT = "[A-Za-z0-9_$-]+(?:\\[\\])?";
var PICK_PATH = new RegExp(`^${SEGMENT}(?:\\.${SEGMENT})*$`);
var MISSING = /* @__PURE__ */ Symbol("missing");
var plain = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function segments(path) {
  return path.split(".").map((part) => {
    const maps = part.endsWith("[]");
    return { name: maps ? part.slice(0, -2) : part, maps };
  });
}
function project(value, path) {
  const [segment, ...rest] = path;
  if (segment === void 0) return value;
  if (!plain(value) || !Object.hasOwn(value, segment.name)) return MISSING;
  const child = value[segment.name];
  if (!segment.maps) {
    const projected = project(child, rest);
    return projected === MISSING ? MISSING : { [segment.name]: projected };
  }
  if (!Array.isArray(child)) return MISSING;
  return {
    [segment.name]: child.map((item) => {
      const projected = project(item, rest);
      return projected === MISSING ? {} : projected;
    })
  };
}
function reaches(value, path) {
  const [segment, ...rest] = path;
  if (segment === void 0) return true;
  if (!plain(value) || !Object.hasOwn(value, segment.name)) return false;
  const child = value[segment.name];
  if (!segment.maps) return reaches(child, rest);
  if (!Array.isArray(child)) return false;
  return child.length === 0 || child.some((item) => reaches(item, rest));
}
function merge(left, right) {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return MISSING;
    const merged = [];
    for (let index = 0; index < left.length; index += 1) {
      const item = merge(left[index], right[index]);
      if (item === MISSING) return MISSING;
      merged.push(item);
    }
    return merged;
  }
  if (plain(left) && plain(right)) {
    const merged = { ...left };
    for (const [key, value] of Object.entries(right)) {
      const item = Object.hasOwn(merged, key) ? merge(merged[key], value) : value;
      if (item === MISSING) return MISSING;
      Object.defineProperty(merged, key, { value: item, enumerable: true, configurable: true, writable: true });
    }
    return merged;
  }
  if (plain(right) && Object.keys(right).length === 0) return left;
  return right;
}
function pick(data, paths) {
  if (!plain(data)) return { ok: false };
  let picked = {};
  for (const path of paths) {
    const projected = project(data, segments(path));
    if (projected === MISSING) continue;
    const merged = merge(picked, projected);
    if (merged === MISSING || !plain(merged)) continue;
    picked = merged;
  }
  return { ok: true, data: picked };
}
function missingPaths(data, paths) {
  return paths.filter((path) => !reaches(data, segments(path)));
}
var MAX_REF_DEPTH = 32;
function branches(schema, root, depth = 0) {
  if (typeof schema === "boolean" || depth > MAX_REF_DEPTH) return [schema];
  const ref = schema["$ref"];
  if (typeof ref === "string") {
    const target = resolveRef(ref, root);
    return target === void 0 ? [true] : branches(target, root, depth + 1);
  }
  const options = [schema["anyOf"], schema["oneOf"], schema["allOf"]].filter(Array.isArray).flat();
  if (options.length === 0) return [schema];
  return options.flatMap((option) => branches(option, root, depth + 1));
}
function resolveRef(ref, root) {
  if (!ref.startsWith("#/") || typeof root === "boolean") return void 0;
  let node = root;
  for (const part of ref.slice(2).split("/").map((piece) => piece.replaceAll("~1", "/").replaceAll("~0", "~"))) {
    if (!plain(node) || !Object.hasOwn(node, part)) return void 0;
    node = node[part];
  }
  return plain(node) || typeof node === "boolean" ? node : void 0;
}
var types = (schema) => {
  const type = schema["type"];
  return typeof type === "string" ? [type] : Array.isArray(type) ? type.filter((item) => typeof item === "string") : void 0;
};
function property(schema, name, root) {
  return branches(schema, root).flatMap((branch) => {
    if (branch === true) return [true];
    if (branch === false) return [];
    const kinds = types(branch);
    if (kinds && !kinds.includes("object")) return [];
    const properties = branch["properties"];
    if (plain(properties) && Object.hasOwn(properties, name)) return [properties[name]];
    const additional = branch["additionalProperties"];
    if (additional === false) return [];
    if (plain(additional)) return [additional];
    return [true];
  });
}
function items(schema, root) {
  return branches(schema, root).flatMap((branch) => {
    if (branch === true) return [true];
    if (branch === false) return [];
    const kinds = types(branch);
    if (kinds && !kinds.includes("array")) return [];
    const item = branch["items"];
    return [plain(item) || typeof item === "boolean" ? item : true];
  });
}
function schemaReaches(schema, path, root) {
  const [segment, ...rest] = path;
  if (segment === void 0) return true;
  for (const child of property(schema, segment.name, root)) {
    const next = segment.maps ? items(child, root) : [child];
    if (next.some((item) => schemaReaches(item, rest, root))) return true;
  }
  return false;
}
function pickProblems(paths, schema) {
  if (!Array.isArray(paths)) return ["pick must be a list of paths"];
  const problems = [];
  if (paths.length === 0) problems.push("pick must name at least one path");
  if (paths.length > MAX_PICK_PATHS) problems.push(`pick names ${paths.length} paths, over ${MAX_PICK_PATHS}`);
  const seen = /* @__PURE__ */ new Set();
  for (const [index, path] of paths.entries()) {
    if (typeof path !== "string" || path.length === 0) {
      problems.push(`pick[${index}] must be a path such as items[].title`);
      continue;
    }
    if (path.length > MAX_PICK_PATH_LENGTH) {
      problems.push(`pick[${index}] is ${path.length} characters, over ${MAX_PICK_PATH_LENGTH}`);
      continue;
    }
    if (!PICK_PATH.test(path)) {
      problems.push(`pick[${index}] "${path}" must be dotted names of letters, digits, _, $ or -, each optionally ending in [] to map over a list`);
      continue;
    }
    if (seen.has(path)) problems.push(`pick[${index}] "${path}" repeats a path`);
    seen.add(path);
    if (schema !== void 0 && !schemaReaches(schema, segments(path), schema)) problems.push(`pick[${index}] "${path}" is not a path of the output`);
  }
  return problems;
}
function pickProblemsForOutput(output, paths) {
  const found = outputValidator(output);
  if (!found) return [`"${output}" is not a registered output`];
  return pickProblems(paths, found.jsonSchema());
}

export {
  MAX_PICK_PATHS,
  MAX_PICK_PATH_LENGTH,
  PICK_PATH,
  pick,
  missingPaths,
  pickProblems,
  pickProblemsForOutput
};

// @we-the-rebel-alliance/source-contract 0.1.0. Built by scripts/build.mjs; do not edit.
import {
  _enum,
  _null,
  array,
  boolean,
  iso_exports,
  number,
  object,
  record,
  string,
  union,
  validator
} from "./chunk-6RDMPYYW.js";

// src/registry.ts
var text = (max) => string().max(max);
var httpsUrl = string().max(2048).refine((value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}, "must be an https URL");
var timestamp = iso_exports.datetime({ offset: true });
var date = union([timestamp, string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date-time with an offset, or a date")]);
var item = {
  id: string().min(1).max(128),
  url: httpsUrl.optional(),
  ask: text(200).optional()
};
var IMAGE_DATA_URI_MAX = 1024 * 1024 - 4 * 1024;
var agenda = object({
  items: array(
    object({
      ...item,
      title: text(120),
      start: date,
      end: date.optional(),
      allDay: boolean().optional(),
      location: text(120).optional(),
      calendar: text(60).optional(),
      joinUrl: httpsUrl.optional()
    }).strict()
  ).max(50),
  rangeEnd: date.optional()
}).strict();
var inbox = object({
  unread: number().int().nonnegative().nullable(),
  unit: text(20).optional(),
  label: text(60).optional(),
  items: array(
    object({
      ...item,
      title: text(120),
      from: text(60).optional(),
      preview: text(200).optional(),
      at: timestamp,
      count: number().int().nonnegative().optional(),
      important: boolean().optional()
    }).strict()
  ).max(30)
}).strict();
var metric = object({
  label: text(40),
  value: union([number().finite(), text(20)]),
  unit: text(10).optional(),
  delta: object({
    value: number().finite(),
    direction: _enum(["up", "down", "flat"]),
    good: boolean().optional()
  }).strict().optional(),
  spark: array(number().finite()).max(48).optional()
}).strict();
var list = object({
  items: array(
    object({
      id: item.id,
      text: text(200),
      done: boolean().optional(),
      note: text(200).optional(),
      due: date.optional()
    }).strict()
  ).max(50),
  editable: boolean()
}).strict();
var progress = object({
  label: text(60),
  value: number().nonnegative(),
  max: number().positive(),
  steps: array(object({ label: text(40), done: boolean() }).strict()).max(12).optional(),
  eta: timestamp.optional()
}).strict().refine((value) => value.value <= value.max, { message: "value must not exceed max", path: ["value"] });
var note = object({ markdown: text(16 * 1024) }).strict();
var links = object({
  items: array(
    object({
      ...item,
      title: text(60),
      url: httpsUrl,
      hint: text(60).optional()
    }).strict()
  ).max(12)
}).strict();
var countdown = object({
  label: text(60),
  target: timestamp,
  style: _enum(["relative", "timer"])
}).strict();
var image = object({
  url: httpsUrl.optional(),
  dataUri: string().max(IMAGE_DATA_URI_MAX).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/, "must be a base64 data URI of a png, jpeg or webp image").optional(),
  alt: string().min(1).max(200),
  caption: text(120).optional()
}).strict().refine((value) => value.url === void 0 !== (value.dataUri === void 0), { message: "give exactly one of url and dataUri" });
var thread = object({
  subject: text(200),
  messages: array(
    object({
      ...item,
      from: text(120),
      at: timestamp,
      body: text(4e3),
      quoted: text(4e3).optional()
    }).strict()
  ).min(1).max(50)
}).strict();
var table = object({
  columns: array(object({ key: string().regex(/^[A-Za-z0-9_-]{1,40}$/), label: text(40) }).strict()).min(1).max(8),
  rows: array(record(string(), union([text(200), number().finite(), boolean(), _null()]))).max(100)
}).strict();
var record2 = object({
  title: text(120),
  fields: array(object({ label: text(60), value: text(400) }).strict()).min(1).max(24)
}).strict();
var OUTPUTS = {
  agenda: validator("output.agenda", agenda),
  inbox: validator("output.inbox", inbox),
  metric: validator("output.metric", metric),
  list: validator("output.list", list),
  progress: validator("output.progress", progress),
  note: validator("output.note", note),
  links: validator("output.links", links),
  countdown: validator("output.countdown", countdown),
  image: validator("output.image", image),
  thread: validator("output.thread", thread),
  table: validator("output.table", table),
  record: validator("output.record", record2)
};
var OUTPUT_NAMES = Object.keys(OUTPUTS);
function isOutputName(name) {
  return typeof name === "string" && Object.hasOwn(OUTPUTS, name);
}
function outputValidator(name) {
  return isOutputName(name) ? OUTPUTS[name] : void 0;
}
function checkOutput(name, data) {
  const found = outputValidator(name);
  if (!found) return { ok: false, problems: [`"${name}" is not a registered output (${OUTPUT_NAMES.join(", ")})`] };
  return found.check(data);
}

export {
  IMAGE_DATA_URI_MAX,
  OUTPUTS,
  OUTPUT_NAMES,
  isOutputName,
  outputValidator,
  checkOutput
};

// @we-the-rebel-alliance/source-contract 0.1.0. Built by scripts/build.mjs; do not edit.
import {
  _enum,
  array,
  boolean,
  discriminatedUnion,
  int,
  literal,
  looseObject,
  never,
  number,
  object,
  string,
  validator
} from "./chunk-6RDMPYYW.js";

// src/internal/schema/types.ts
var MAX_BYTES_DEFAULT = 65536;
var MAX_BYTES_LIMIT = 1048576;

// src/internal/schema/sources.ts
var SOURCE_ID = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
var TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/;
var READS = /^[a-z][a-z0-9-]{0,31}$/;
var ACTION = /^(?:[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*|[a-z][a-z0-9]*_[a-z][a-z0-9_]*)$/;
var OPERATION = /^[A-Za-z][A-Za-z0-9._-]{0,199}$/;
var SCOPE_KEY = /^[a-z][a-z0-9_]{0,31}$/;
var OUTPUT_NAME = /^[a-z][a-z0-9-]{0,31}$/;
var PRICE_PER = /^[a-z][a-z0-9-]{0,31}$/;
var HOST = /^(?:\*\.)?[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
var price = object({
  per: string().max(32).regex(PRICE_PER, { error: "must be a lowercase word such as post, author or call" }),
  usd: number().min(0)
}).strict().describe("One price unit, in US dollars, from the plugin's own price table.");
var units = array(price).min(1);
var freeCost = object({
  class: literal("free"),
  units: never({ error: "a free source states no price units" }).optional(),
  probe: never({ error: "a free source states no probe cost" }).optional()
}).strict();
var meteredCost = object({ class: literal("metered"), units, probe: price.optional() }).strict();
var billedCost = object({ class: literal("billed"), units, probe: price }).strict();
var cost = discriminatedUnion("class", [freeCost, meteredCost, billedCost], { error: "must be free, metered or billed" }).describe("What one read costs, including a probe call, which reads no content.");
var accounts = object({ named: boolean().describe("True when the source reads more than one account, so a read names one.") }).strict().describe("Which signed-in accounts a source reads.");
var scope = object({
  keys: array(string().max(32).regex(SCOPE_KEY, { error: "must be a lowercase scope key such as channels" })).describe("The scope keys a person confirms: labels, channels, repositories. Empty when there is nothing to choose."),
  describe: string().max(200).describe("The sentence shown at consent, such as Which labels."),
  suggest: object({
    tool: string().max(64).regex(TOOL_NAME, { error: "must be a tool name" }),
    operations: array(string().max(200).regex(OPERATION, { error: "must be a provider operation or an MCP tool name" })).min(1)
  }).strict().optional().describe(
    "The read-only tool that lists the values a person may pick, and the operations it asserts. It runs only at bind, in the probe session; its results are shown and never stored, so its operations never enter a running grant."
  )
}).strict().describe("What a person confirms at consent, and the sentence that asks them.");
var detail = object({
  id: string().max(64).regex(SOURCE_ID, { error: "must be a dotted id such as gws.gmail.message" }),
  tool: string().max(64).regex(TOOL_NAME, { error: "must be a tool name" }),
  from: array(_enum(["external_id", "kind", "occurred_at", "url", "thread", "actors", "labels", "hash"])).min(1).describe("The event fields the detail's input comes from. Identifiers only: an event's title and text are never an input.")
}).strict().describe("One read of an event's detail: the tool, and the event fields its input comes from.");
var permissionBase = {
  operations: array(string().max(200).regex(OPERATION, { error: "must be a provider operation or an MCP tool name" })).min(1).describe("Every operation the source's reads assert, and nothing else.")
};
var permissionEvents = object({
  events: string().max(80).regex(ACTION, { error: "must be a dotted action such as gws.events_list, or a namespaced tool action such as slack_events_list" }),
  tool: never({ error: "an events source has events, not tool" }).optional(),
  ...permissionBase
}).strict().describe("The events_list action, and the provider operations the source asserts.");
var permissionTool = object({
  tool: string().max(80).regex(ACTION, { error: "must be a dotted action such as gws.calendar_today, or a namespaced tool action" }),
  events: never({ error: "a snapshot has tool, not events" }).optional(),
  ...permissionBase
}).strict().describe("The read tool's action, and the provider operations the source asserts.");
var cadence = object({ providerMinMinutes: int().min(1).max(10080).optional() }).strict().describe("A provider's own floor between reads. Only where the provider imposes one.");
var urlHosts = array(
  string().max(253).regex(HOST, { error: "must be a host such as slack.com, or *.slack.com" })
).describe("The hosts an event's url may point at, for display. A consumer renders a url only when its host matches.");
var common = {
  id: string().max(64).regex(SOURCE_ID, { error: "must be a dotted source id such as gws.gmail" }),
  tool: string().max(64).regex(TOOL_NAME, { error: "must be a tool name" }),
  input: looseObject({}).optional().describe("The input the tool needs to reach this source. It carries no account and no secret."),
  accounts: accounts.optional(),
  scope: scope.optional(),
  private: boolean().optional().describe("True when everything this source reads is personal: shown at consent."),
  cost,
  cadence: cadence.optional(),
  maxBytes: int().min(1).max(MAX_BYTES_LIMIT).optional().meta({ default: MAX_BYTES_DEFAULT }).describe("The most bytes one result may take: default 65536 (64 KB), at most 1048576 (1 MB)."),
  retentionDays: int().min(1).optional().describe("How many days an events consumer keeps what it read."),
  urlHosts: urlHosts.optional()
};
var events = object({
  ...common,
  kind: literal("events"),
  reads: string().max(32).regex(READS, { error: "must be a lowercase word such as message" }).describe("The thing it reads."),
  details: array(detail).optional(),
  permission: permissionEvents,
  output: never({ error: "an events source has no output: output belongs to a snapshot" }).optional(),
  maxAgeSec: never({ error: "an events source has no maxAgeSec: a snapshot may be reused, an events page is read once" }).optional(),
  params: never({ error: "an events source has no params: events_list takes since, cursor and limit" }).optional()
}).strict().describe("An events source: append-only, ordered, read with a cursor.");
var snapshot = object({
  ...common,
  kind: literal("snapshot"),
  output: string().max(32).regex(OUTPUT_NAME, { error: "must be a lowercase name such as agenda" }).describe("The name of its schema in the output registry. The registry itself is the app's."),
  params: looseObject({}).optional().describe("The parameters a consumer may pass, resolved by the library at read time."),
  permission: permissionTool,
  maxAgeSec: int().min(1).optional().describe("How long a result may be reused before it is read again."),
  reads: never({ error: "a snapshot has no reads: it is state, not a feed" }).optional(),
  details: never({ error: "a snapshot has no details: it has no events to read one of" }).optional()
}).strict().describe("A snapshot source: the latest state, read on demand.");
var source = discriminatedUnion("kind", [events, snapshot]);
var sourcesSchema = object({
  contractVersion: literal(1),
  items: array(source).min(1).describe("The plugin's sources. A source id is unique across the declaration.")
}).strict();

// src/schema.ts
var SOURCES_SCHEMA = validator("sources", sourcesSchema);

export {
  MAX_BYTES_DEFAULT,
  MAX_BYTES_LIMIT,
  SOURCES_SCHEMA
};

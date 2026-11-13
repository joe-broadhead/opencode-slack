/**
 * The plain types of the §2.2 `sources` descriptor, and its constants. No import: a published declaration reaches this
 * file, and must reach nothing outside the package (`npm run check:dist`).
 */
/** `maxBytes`: the default and the ceiling (§2.2). */
export declare const MAX_BYTES_DEFAULT = 65536;
export declare const MAX_BYTES_LIMIT = 1048576;
/** The value of a plugin's top-level `sources` key: the contract version and its sources. */
export interface Sources {
    readonly contractVersion: 1;
    readonly items: readonly SourceItem[];
}
/** An events feed or a snapshot. */
export type SourceItem = SourceEvents | SourceSnapshot;
/** A source item's fields, whichever kind it is. */
export interface SourceCommon {
    /** The source id, such as `gws.gmail`. Its first segment is the plugin's namespace. */
    readonly id: string;
    /** The plugin tool that reads this source. It must be declared `readOnly: true`. */
    readonly tool: string;
    /** The input the tool needs to reach this source, such as `{ source: "gmail" }`. */
    readonly input?: Readonly<Record<string, unknown>> | undefined;
    /** Which signed-in accounts a source reads. Optional: §2.2's X item names none. */
    readonly accounts?: Accounts | undefined;
    /** What a person confirms at consent, and the sentence that asks them. */
    readonly scope?: Scope | undefined;
    readonly permission: Permission;
    /** True when everything this source reads is personal: shown at consent. */
    readonly private?: boolean | undefined;
    readonly cost: Cost;
    /** A provider's own floor between reads, only where it imposes one. */
    readonly cadence?: Cadence | undefined;
    /** The most bytes one result may take: default 65536, at most 1 MB. */
    readonly maxBytes?: number | undefined;
    /** How many days an events consumer keeps what it read. */
    readonly retentionDays?: number | undefined;
    /** The hosts an event's `url` may point at, for display. */
    readonly urlHosts?: readonly string[] | undefined;
}
/** An events source: append-only items read with a cursor. */
export interface SourceEvents extends SourceCommon {
    readonly kind: "events";
    /** The thing it reads, such as `message`. */
    readonly reads: string;
    /** Reads of one event's detail, called only with the event fields they name. */
    readonly details?: readonly Detail[] | undefined;
    /** The action `events_list` asserts. */
    readonly permission: PermissionEvents;
    /** Not allowed on an events source. */
    readonly output?: undefined;
    /** Not allowed on an events source. */
    readonly maxAgeSec?: undefined;
    /** Not allowed on an events source. */
    readonly params?: undefined;
}
/** A snapshot source: the latest state, read on demand. */
export interface SourceSnapshot extends SourceCommon {
    readonly kind: "snapshot";
    /** The name of its schema in the output registry. The registry is the app's; this is a name only. */
    readonly output: string;
    /** The parameters a consumer may pass, resolved by the library at read time. */
    readonly params?: Readonly<Record<string, unknown>> | undefined;
    /** The action its read tool asserts. */
    readonly permission: PermissionTool;
    /** How long a result may be reused before it is read again. */
    readonly maxAgeSec?: number | undefined;
    /** Not allowed on a snapshot. */
    readonly reads?: undefined;
    /** Not allowed on a snapshot. */
    readonly details?: undefined;
}
/** Which signed-in accounts a source reads. */
export interface Accounts {
    /** True when the source reads more than one account, so a read names one. */
    readonly named: boolean;
}
/** What a person confirms at consent. */
export interface Scope {
    /** The scope keys a person confirms: labels, channels, repositories. Empty when there is nothing to choose. */
    readonly keys: readonly string[];
    /** The sentence shown at consent. */
    readonly describe: string;
    /** The read-only tool that lists the values a person may pick, and the operations it asserts at bind. */
    readonly suggest?: Suggest | undefined;
}
/**
 * A bind-time read: the values a person may pick for a scope key. It runs only at bind, in the probe session, with its
 * results shown and never stored, so its operations never enter a running grant (§2.2, accepted addition).
 */
export interface Suggest {
    /** The read-only tool that lists the values. */
    readonly tool: string;
    /** The operations it asserts, and nothing else. None of them may appear in `permission.operations`. */
    readonly operations: readonly string[];
}
/** One read of an event's detail. */
export interface Detail {
    /** The detail's id, such as `gws.gmail.message`. */
    readonly id: string;
    /** The read-only tool that reads it. */
    readonly tool: string;
    /** The event fields its input comes from: identifiers, never the event's own prose. */
    readonly from: readonly DetailField[];
}
/** The event fields a detail may take its input from. */
export type DetailField = "external_id" | "kind" | "occurred_at" | "url" | "thread" | "actors" | "labels" | "hash";
/** The actions and operations a source's reads assert. */
export type Permission = PermissionEvents | PermissionTool;
/** An events source's permission: the `events_list` action, and the provider operations it asserts. */
export interface PermissionEvents {
    /** The action `events_list` asserts, in the plugin's namespace. */
    readonly events: string;
    /** Every provider operation the source's reads assert, and nothing else. */
    readonly operations: readonly string[];
}
/** A snapshot's permission: the read tool's action, and the provider operations it asserts. */
export interface PermissionTool {
    /** The action the read tool asserts, in the plugin's namespace. */
    readonly tool: string;
    /** Every provider operation the source's reads assert, and nothing else. */
    readonly operations: readonly string[];
}
/** What one read costs: `free` charges nothing, `metered` charges per unit, `billed` charges per call. */
export type Cost = CostFree | CostMetered | CostBilled;
/** A source that charges nothing. */
export interface CostFree {
    readonly class: "free";
    readonly units?: undefined;
    readonly probe?: undefined;
}
/** A source charged per unit, whose probe may be charged too. */
export interface CostMetered {
    readonly class: "metered";
    /** The price units the provider charges. */
    readonly units: readonly Price[];
    /** The price of a probe call, which reads no content. */
    readonly probe?: Price | undefined;
}
/** A source charged on every call, whose probe is charged too. */
export interface CostBilled {
    readonly class: "billed";
    /** The price units the provider charges. */
    readonly units: readonly Price[];
    /** The price of a probe call, which reads no content. */
    readonly probe: Price;
}
/** One price unit, from the plugin's own price table. */
export interface Price {
    /** What one unit is: `post`, `author`, `call`. */
    readonly per: string;
    /** The price of one unit, in US dollars. */
    readonly usd: number;
}
/** A provider's own floor between reads. */
export interface Cadence {
    /** The provider's minimum interval between reads, in minutes. */
    readonly providerMinMinutes?: number | undefined;
}

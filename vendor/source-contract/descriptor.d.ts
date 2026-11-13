import type { Checked } from "./internal/checked.js";
import type { ParamSpec } from "./params.js";
/** The most bytes a source may declare for one answer (1 MB), and the default when it declares none (64 KB): `events`' `MAX_BYTES`. */
export declare const MAX_BYTES_LIMIT: number;
export declare const DEFAULT_MAX_BYTES: number;
/** Who may be asked, and how (design §2.2 `permission`). */
export interface SourcePermission {
    /** An events source's method action, such as `gws.events_list`. */
    readonly events?: string;
    /** A snapshot source's method action, such as `gws.calendar_today`. */
    readonly tool?: string;
    /**
     * What the read does at the provider: what grants and a person's off switches key on. A dotted operation
     * (`gmail.users.messages.get`) is asserted as `<namespace>.read` on `<account>:<operation>`; a bare one
     * (`slack_read_channel`) is an MCP tool, asserted as `<namespace>_<operation>` on `*` (`permission.operationRule`).
     */
    readonly operations: readonly string[];
}
/** A detail read: a declared read per event, whose inputs come only from the event's own fields, never its text. */
export interface SourceDetail {
    readonly id: string;
    readonly tool: string;
    /** The event fields its input is: `external_id`, `thread`, and the others Memory's schema lists. */
    readonly from: readonly string[];
}
/** One source a plugin declares. */
export interface SourceItem {
    readonly id: string;
    readonly kind: "events" | "snapshot";
    /** The tools-RPC method a read calls. */
    readonly tool: string;
    /** Fixed input the method always gets, such as `{ "source": "gmail" }`. */
    readonly input?: Readonly<Record<string, unknown>>;
    /** An events source's event kind. */
    readonly reads?: string;
    /** A snapshot source's output, a registered schema. */
    readonly output?: string;
    readonly params?: Readonly<Record<string, ParamSpec>>;
    readonly accounts?: {
        readonly named?: boolean;
    };
    readonly scope?: {
        readonly keys: readonly string[];
        readonly describe?: string;
        /** The read-only tool that lists choices at consent, and the operations it asserts; run only at bind. */
        readonly suggest?: {
            readonly tool: string;
            readonly operations: readonly string[];
        };
    };
    readonly details?: readonly SourceDetail[];
    readonly permission: SourcePermission;
    readonly private?: boolean;
    readonly cost: {
        readonly class: "free" | "metered" | "billed";
        readonly units?: readonly {
            readonly per: string;
            readonly usd: number;
        }[];
        readonly probe?: {
            readonly per: string;
            readonly usd: number;
        };
    };
    readonly cadence?: {
        readonly providerMinMinutes?: number;
    };
    readonly maxBytes?: number;
    readonly maxAgeSec?: number;
    readonly retentionDays?: number;
    readonly urlHosts?: readonly string[];
    readonly [key: string]: unknown;
}
/** The `sources` key. */
export interface SourcesDescriptor {
    readonly contractVersion: number;
    readonly items: readonly SourceItem[];
}
/** A descriptor as read from an installed package. */
export interface InstalledDescriptor {
    /** The package's name and version, from the same package.json. */
    readonly package: string;
    readonly version: string;
    /** The package's directory on disk. */
    readonly directory: string;
    readonly sources: SourcesDescriptor;
    /** `sha256:` and the hex digest of the canonical JSON of `sources`. */
    readonly hash: string;
}
/** The event fields a detail read may take its input from (Memory's schema): identifiers and metadata, never `title` or `text`. */
export declare const DETAIL_FIELDS: readonly ["external_id", "kind", "occurred_at", "url", "thread", "actors", "labels", "hash"];
/** The `sources` value checked against Memory's schema, then the frame; its problems, one sentence each, when it breaks them. */
export declare function checkSources(value: unknown): Checked<SourcesDescriptor>;
/** Canonical JSON: object keys sorted at every depth, no spaces. Arrays keep their order. */
export declare function canonicalJson(value: unknown): string;
/** The descriptor's hash: `sha256:` and the hex digest of its canonical JSON. Key order does not change it. */
export declare function descriptorHash(value: unknown): string;
/**
 * The descriptor of the package installed at `directory`: its package.json's `sources`, checked and hashed. With
 * `version`, the package.json must say that version, so a consumer reads the package it believes is installed.
 */
export declare function readInstalledDescriptor(directory: string, options?: {
    readonly version?: string;
}): Checked<InstalledDescriptor>;
/**
 * The directory of the package `name` as Node would find it installed from `from`: the nearest
 * `node_modules/<name>/package.json` at or above it. Undefined when none is installed.
 */
export declare function findInstalledPackage(name: string, from: string): string | undefined;
/** A source by id, from a descriptor. */
export declare function findSource(descriptor: SourcesDescriptor, id: string): SourceItem | undefined;
/** The most bytes one answer of this source may take: its `maxBytes`, or 64 KB. */
export declare function maxBytesOf(source: Pick<SourceItem, "maxBytes">): number;

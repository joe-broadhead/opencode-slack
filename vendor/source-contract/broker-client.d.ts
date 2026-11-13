import { type ReadHost, type ReadOutcome, type ReadRequest } from "./read.js";
/** One read, as a consumer asks a host's broker for it. */
export interface BrokerRequest {
    /** The installed package and version the consumer read its descriptor from. */
    readonly package: string;
    readonly version: string;
    /** The descriptor hash the consumer consented under; a broker whose own copy differs refuses with PERMISSION_DENIED. */
    readonly descriptorHash: string;
    /** Who reads, such as `memory`: for the broker's grant check and its audit line. */
    readonly consumer: string;
    readonly source: string;
    readonly account?: string;
    readonly scope?: Readonly<Record<string, readonly string[]>>;
    /** An events read. `since` may be relative; the broker resolves it in the person's time zone. */
    readonly cursor?: string;
    readonly since?: string;
    readonly limit?: number;
    /** A snapshot read. Params may be relative or `$me`; the broker resolves them. */
    readonly params?: Readonly<Record<string, unknown>>;
    /** A broker may apply it to send less; the client applies it again. */
    readonly pick?: readonly string[];
}
/** A broker's answer. */
export type BrokerAnswer = {
    readonly offered: false;
} | {
    readonly offered: true;
    readonly ok: true;
    readonly value: unknown;
    readonly asOf?: string;
    readonly cached?: boolean;
} | {
    readonly offered: true;
    readonly ok: false;
    readonly code: string;
    readonly message: string;
    readonly next?: string;
    readonly retryAfterSec?: number;
};
/** How a consumer reaches a host's broker: one call, through a channel it trusts. */
export type BrokerTransport = (request: BrokerRequest, signal?: AbortSignal) => Promise<BrokerAnswer>;
/** A read's outcome, and how it was made. */
export type ReaderOutcome = ReadOutcome & {
    /** "broker" when the host's broker answered, "embedded" when the read ran here. */
    readonly via: "broker" | "embedded";
    /** True when the broker served the answer from its cache. */
    readonly cached?: boolean;
};
/** A consumer's reader. */
export interface SourceReader {
    read(request: ReadRequest): Promise<ReaderOutcome>;
}
/**
 * Codes a host may send before it takes the package's error table, read as the table's. The table's own codes pass
 * through unchanged.
 */
export declare const BROKER_CODE_ALIASES: Readonly<Record<string, string>>;
/** The request a broker receives for a consumer's read: references to the installed package, never its descriptor or the grant. */
export declare function brokerRequest(request: ReadRequest): BrokerRequest;
/** True when `answer` has a broker answer's shape. */
export declare function isBrokerAnswer(answer: unknown): answer is BrokerAnswer;
/**
 * The reader a consumer uses. With a broker transport, each read goes to the broker first, after the same checks an
 * embedded read makes; it runs embedded when the broker says it is not offered, when the transport fails, or when its
 * answer is not a broker answer. Without one, every read runs embedded over the consumer's own host.
 */
export declare function sourceReader(options: {
    readonly host: ReadHost;
    readonly broker?: BrokerTransport;
}): SourceReader;

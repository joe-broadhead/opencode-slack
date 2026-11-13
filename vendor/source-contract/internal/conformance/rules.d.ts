/** A tool the plugin declares, as its manifest lists it. */
export interface ToolDeclaration {
    readonly id: string;
    /** True when the tool reads and never changes anything. §2.2: every tool a source names is declared read-only. */
    readonly readOnly?: boolean | undefined;
}
/** What `declarationProblems` needs beyond the declaration itself. */
export interface DeclarationOptions {
    /** The plugin's declared tools, so a named tool can be checked. Omit it when the list is not at hand. */
    readonly tools?: readonly ToolDeclaration[] | undefined;
}
/**
 * The read verbs a name may lead with: `get`, `list`, `read`, `search`, `query`, `fetch`, `count`, `describe`,
 * `probe`, `status`, `lookup`, `view`, `history`, `find`.
 */
export declare const READ_VERBS: readonly string[];
export declare const WRITE_VERBS: readonly string[];
/**
 * The tokens that are a verb only in a verb's position, and a noun anywhere else: a `post` is a thing, and `get_post`
 * reads one; `export` is a provider's read (`drive.files.export`) and a plugin's commit tool alike. A tool name may not
 * lead with one, and may not put one straight after its namespace.
 */
export declare const NOUN_VERBS: readonly string[];
/** Tokens that join two actions in one name (`get_and_save`, `getAndSend`): a name is one action. */
export declare const JOINERS: readonly string[];
/**
 * A name split into tokens: on snake, kebab, dot and space, and at each camelCase boundary. `getAndSend` is
 * `get and send`, `gmail.users.messages.get` is `gmail users messages get`, and `batchGet` is `batch get`.
 */
export declare function tokensOf(name: unknown): string[];
/**
 * Why a name is not a read's, or undefined when it is one.
 *
 * 1. `and`/`then` followed by a verb makes a compound, and is refused.
 * 2. An unambiguous write verb anywhere in the name is refused (Memory's promise).
 * 3. The name's first token is where its verb sits. A read verb there makes it a read; a noun-verb there is a write
 *    (`post_message`); a plain noun is a namespace or a noun name, and then the next token is the verb's position, so
 *    `slack_post_message` is refused while `events_list` and `slack_read_channel` are reads and `calendar_today` names
 *    no action at all.
 */
export declare function nameProblem(name: unknown): string | undefined;
/** `nameProblem`, and the name must carry a read verb. Memory's stricter form, for a read a consumer names. */
export declare function readVerbProblem(name: unknown): string | undefined;
/**
 * Why an operation is not a read's, or undefined when it is one.
 *
 * A dotted operation (`gmail.users.messages.get`) is a provider call, and its last segment is where its verb sits: no
 * unambiguous write verb may appear in that segment. A noun there is fine, because a provider names a collection
 * (`x.users.mentions`, `calendar.events.instances`, `drive.files.export`); `insert`, `batchModify`, `watch`, `untrash`
 * and `emptyTrash` are refused without being listed as exceptions. A bare operation (`slack_read_channel`) is an MCP
 * tool name and follows the same rule.
 */
export declare function operationProblem(operation: unknown): string | undefined;
/** Every field of a contract-1 event. */
export declare const EVENT_FIELDS: readonly string[];
/** The event fields a `details` entry may take its input from: identifiers, never an event's own prose. */
export declare const DETAIL_FIELDS: readonly string[];
/**
 * The public suffix of a host, from the full Public Suffix List (ICANN and PRIVATE): the longest matching rule, where
 * `*.` matches one label and `!` is an exception. `a.b.co.uk` answers `co.uk`, and `shop.ondigitalocean.app` answers
 * `ondigitalocean.app`, because the PRIVATE section says so.
 */
export declare function publicSuffixOf(host: string): string | null;
/**
 * Why a `urlHosts` pattern is too broad to mean anything, or null when it is fine.
 *
 * `urlHosts` is display hygiene: a consumer renders an event's `url` only when its host matches, so a pattern that
 * names a public suffix, a host anyone can claim, a tracker or a punycode lookalike would let collected text become a
 * remote image or a tracking link.
 */
export declare function urlHostProblem(host: unknown): string | null;
/**
 * Every problem with a `sources` declaration: the validator's first, then the rules it cannot express.
 *
 * @param sources the value of the top-level `sources` key
 * @param options the plugin's declared tools, when they are at hand
 */
export declare function declarationProblems(sources: unknown, options?: DeclarationOptions): string[];
/** `declarationProblems`, for a test or a check: throws one error listing every problem. */
export declare function assertDeclaration(sources: unknown, options?: DeclarationOptions): void;

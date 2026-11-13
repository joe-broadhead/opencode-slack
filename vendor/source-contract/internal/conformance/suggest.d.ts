/** One value a person may confirm. */
export interface ScopeOption {
    readonly id: string;
    readonly label?: string | undefined;
}
/** Every problem with a suggest answer, one sentence each. */
export declare function suggestProblems(answer: unknown, where: string): string[];

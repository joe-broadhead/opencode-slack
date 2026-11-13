import type { Checked, Validator } from "./internal/checked.js";
/**
 * The most characters a `dataUri` takes: 1 MB less 4 KB, so the whole answer (the data URI, the other fields and the
 * envelope) fits in the 1 MB that `maxBytes` allows, counted as the answer's JSON bytes (#7, decision 21). That is about
 * 760 KB of image; a source downsizes a larger one, or answers an https `url`.
 */
export declare const IMAGE_DATA_URI_MAX: number;
/** Every registered output, by name. */
export declare const OUTPUTS: {
    agenda: Validator<{
        items: {
            title: string;
            start: string;
            id: string;
            end?: string | undefined;
            allDay?: boolean | undefined;
            location?: string | undefined;
            calendar?: string | undefined;
            joinUrl?: string | undefined;
            url?: string | undefined;
            ask?: string | undefined;
        }[];
        rangeEnd?: string | undefined;
    }>;
    inbox: Validator<{
        unread: number | null;
        items: {
            title: string;
            at: string;
            id: string;
            from?: string | undefined;
            preview?: string | undefined;
            count?: number | undefined;
            important?: boolean | undefined;
            url?: string | undefined;
            ask?: string | undefined;
        }[];
        unit?: string | undefined;
        label?: string | undefined;
    }>;
    metric: Validator<{
        label: string;
        value: string | number;
        unit?: string | undefined;
        delta?: {
            value: number;
            direction: "flat" | "up" | "down";
            good?: boolean | undefined;
        } | undefined;
        spark?: number[] | undefined;
    }>;
    list: Validator<{
        items: {
            id: string;
            text: string;
            done?: boolean | undefined;
            note?: string | undefined;
            due?: string | undefined;
        }[];
        editable: boolean;
    }>;
    progress: Validator<{
        label: string;
        value: number;
        max: number;
        steps?: {
            label: string;
            done: boolean;
        }[] | undefined;
        eta?: string | undefined;
    }>;
    note: Validator<{
        markdown: string;
    }>;
    links: Validator<{
        items: {
            title: string;
            url: string;
            id: string;
            hint?: string | undefined;
            ask?: string | undefined;
        }[];
    }>;
    countdown: Validator<{
        label: string;
        target: string;
        style: "relative" | "timer";
    }>;
    image: Validator<{
        alt: string;
        url?: string | undefined;
        dataUri?: string | undefined;
        caption?: string | undefined;
    }>;
    thread: Validator<{
        subject: string;
        messages: {
            from: string;
            at: string;
            body: string;
            id: string;
            quoted?: string | undefined;
            url?: string | undefined;
            ask?: string | undefined;
        }[];
    }>;
    table: Validator<{
        columns: {
            key: string;
            label: string;
        }[];
        rows: Record<string, string | number | boolean | null>[];
    }>;
    record: Validator<{
        title: string;
        fields: {
            label: string;
            value: string;
        }[];
    }>;
};
/** A registered output's name. */
export type OutputName = keyof typeof OUTPUTS;
/** The `data` a source with this output answers. */
export type Output<N extends OutputName> = (typeof OUTPUTS)[N] extends Validator<infer T> ? T : never;
/** Every registered name, in the order above. */
export declare const OUTPUT_NAMES: OutputName[];
/** True when `name` is a registered output. */
export declare function isOutputName(name: unknown): name is OutputName;
/** The validator of a registered output, or undefined for a name the registry does not hold. */
export declare function outputValidator(name: string): Validator<unknown> | undefined;
/** `data` checked against the named output; a name the registry does not hold is a problem, not a throw. */
export declare function checkOutput(name: string, data: unknown): Checked<unknown>;

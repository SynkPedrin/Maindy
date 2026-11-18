export declare function formatStatusLine(input: unknown, gw: unknown, opts?: { offline?: boolean }): string;
export declare function runStatusLine(opts?: { env?: Record<string, string | undefined>; stdin?: NodeJS.ReadableStream; budgetMs?: number }): Promise<string>;

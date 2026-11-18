export declare const MIN_STDOUT_CHARS: number;
export declare function decideHookOutput(input: unknown, opts?: { env?: Record<string, string | undefined>; timeoutMs?: number }): Promise<unknown | null>;
export declare function runHook(opts?: { env?: Record<string, string | undefined>; stdin?: NodeJS.ReadableStream; timeoutMs?: number }): Promise<unknown | null>;

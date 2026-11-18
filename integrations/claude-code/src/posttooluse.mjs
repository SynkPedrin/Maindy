// PostToolUse hook logic (Bash): asks the local gateway to compress a verbose stdout.
// Returns the hook JSON output object, or null meaning "print nothing, keep the original".
import { postJson, readStdin } from "./gateway.mjs";

export const MIN_STDOUT_CHARS = 2000;
export const MIN_TOKENS_SAVED = 200;
export const MIN_SAVED_RATIO = 0.15;

export async function decideHookOutput(input, { env = process.env, timeoutMs = 1500 } = {}) {
  try {
    if (!input || typeof input !== "object") return null;
    if (input.tool_name !== "Bash") return null;
    const resp = input.tool_response;
    if (!resp || typeof resp !== "object") return null;
    const stdout = resp.stdout;
    if (typeof stdout !== "string" || stdout.length < MIN_STDOUT_CHARS) return null;
    if (resp.isImage === true) return null;

    const res = await postJson("/maindy/compress", { text: stdout, toolName: "Bash" }, { timeoutMs, env });
    if (!res.ok || !res.json) return null;
    const j = res.json;
    if (j.applied !== true || typeof j.text !== "string") return null;
    const saved = Number(j.tokensSaved);
    const orig = Number(j.originalTokens);
    if (!Number.isFinite(saved) || !Number.isFinite(orig) || orig <= 0) return null;
    if (saved < MIN_TOKENS_SAVED || saved / orig < MIN_SAVED_RATIO) return null;
    if (j.text.length >= stdout.length) return null;

    return {
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        updatedToolOutput: {
          stdout: j.text,
          stderr: typeof resp.stderr === "string" ? resp.stderr : "",
          interrupted: resp.interrupted === true,
          isImage: false,
        },
      },
    };
  } catch {
    return null;
  }
}

export async function runHook({ env = process.env, stdin = process.stdin, timeoutMs = 1500 } = {}) {
  try {
    const raw = await readStdin(2000, stdin);
    if (!raw.trim()) return null;
    return await decideHookOutput(JSON.parse(raw), { env, timeoutMs });
  } catch {
    return null;
  }
}

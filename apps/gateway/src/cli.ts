/**
 * CLI subcommands of the gateway binary, used by Claude Code without requiring Node on the machine
 * (the desktop ships the gateway as a single executable):
 *
 *   maindy-gateway statusline [--home DIR]        Claude Code statusLine command (stdin JSON → one line)
 *   maindy-gateway hook posttooluse [--home DIR]  Claude Code PostToolUse hook (Bash output compression)
 *   maindy-gateway integrations <claude-code|codex> <install|uninstall|status>
 *                  [--dry-run] [--json] [--home DIR] [--maindy-home DIR] [--force-statusline]
 *
 * Same logic as integrations/claude-code (bundled from there). statusline/hook never fail: on any error the
 * status line prints "maindy." and the hook prints nothing (Claude Code keeps the original output).
 * `integrations` reuses the admin endpoints' installer logic (integrations.ts) without needing the gateway
 * key, so an AI agent in the user's editor can run it; it exits non-zero on failure.
 */
import { runHook } from "../../../integrations/claude-code/src/posttooluse.mjs";
import { runStatusLine } from "../../../integrations/claude-code/src/statusline.mjs";

/** write and wait until flushed: on macOS pipe writes are asynchronous and process.exit() would cut them */
function writeOut(data: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      process.stdout.write(data, () => resolve());
    } catch {
      resolve();
    }
  });
}

function envFor(argv: string[]): NodeJS.ProcessEnv {
  const i = argv.indexOf("--home");
  const home = i >= 0 ? argv[i + 1] : undefined;
  return home ? { ...process.env, MAINDY_HOME: home } : process.env;
}

/** Returns true when argv was a subcommand (and it has been fully handled; process.exitCode is set). */
export async function runSubcommand(argv: string[]): Promise<boolean> {
  const [cmd, sub] = argv;
  if (cmd === "integrations") {
    const { runIntegrationsCli } = await import("./integrations-cli.js");
    const r = runIntegrationsCli(argv.slice(1));
    if (r.stdout) await writeOut(r.stdout);
    if (r.stderr) await new Promise<void>((done) => process.stderr.write(r.stderr, () => done()));
    process.exitCode = r.code;
    return true;
  }
  if (cmd === "statusline") {
    let printed = false;
    const print = async (line: string) => {
      if (printed) return;
      printed = true;
      await writeOut(`${line}\n`);
    };
    const failsafe = setTimeout(() => {
      void print("maindy.").then(() => process.exit(0));
    }, 195);
    failsafe.unref();
    let line = "maindy.";
    try {
      line = await runStatusLine({ env: envFor(argv) });
    } catch {
      line = "maindy.";
    }
    clearTimeout(failsafe);
    await print(line);
    return true;
  }
  if (cmd === "hook") {
    if (sub === "posttooluse") {
      try {
        const out = await runHook({ env: envFor(argv) });
        if (out) await writeOut(JSON.stringify(out));
      } catch {
        /* keep the original tool output */
      }
    }
    return true;
  }
  return false;
}

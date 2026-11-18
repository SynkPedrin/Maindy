/**
 * maindy. gateway — local data plane (127.0.0.1 only).
 *
 *   node maindy-gateway.mjs [--port 8787] [--home ~/.maindy] [--print-key] [--version] [--help]
 *   node maindy-gateway.mjs statusline [--home DIR]          (Claude Code status line)
 *   node maindy-gateway.mjs hook posttooluse [--home DIR]    (Claude Code PostToolUse hook)
 *   node maindy-gateway.mjs integrations <claude-code|codex> <install|uninstall|status> [--dry-run] [--json]
 *
 * Env: MAINDY_HOME, MAINDY_GATEWAY_PORT, OLLAMA_BASE_URL, OPENAI_API_KEY, ANTHROPIC_API_KEY,
 *      GATEWAY_API_URL, MAINDY_DEVICE_TOKEN, MAINDY_GATEWAY_KEY.
 */
import { runSubcommand } from "./cli.js";
import { resolveHome, loadOrCreateKey, ensureDir } from "./home.js";
import { GATEWAY_VERSION } from "./version.js";

// node:sqlite still prints an ExperimentalWarning on some Node versions — keep stdout clean for the desktop.
const origEmit = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const msg = typeof warning === "string" ? warning : warning.message;
  if (/SQLite/i.test(msg)) return;
  return (origEmit as (...a: unknown[]) => void)(warning, ...rest);
}) as typeof process.emitWarning;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const HELP = `maindy. gateway ${GATEWAY_VERSION}
Uso: maindy-gateway [--port N] [--home DIR] [--print-key] [--version]
     maindy-gateway statusline [--home DIR]         status line do Claude Code
     maindy-gateway hook posttooluse [--home DIR]   hook PostToolUse do Claude Code
     maindy-gateway integrations <claude-code|codex> <install|uninstall|status> [--dry-run] [--json]
                    [--home DIR_DO_USUARIO] [--maindy-home DIR]   instala/remove/verifica a integração
  --port N      porta (padrão 8787 ou gateway.json; 0 = aleatória)
  --home DIR    diretório de dados (padrão $MAINDY_HOME ou ~/.maindy)
  --print-key   imprime a x-maindy-key e sai
Sempre escuta somente em 127.0.0.1.`;

async function main() {
  // subcommands run before (and without) loading the server: the status line must answer in <200 ms
  if (await runSubcommand(process.argv.slice(2))) {
    process.exit(process.exitCode ?? 0);
  }
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(HELP);
    return;
  }
  if (process.argv.includes("--version")) {
    console.log(GATEWAY_VERSION);
    return;
  }
  const home = arg("--home");
  if (process.argv.includes("--print-key")) {
    const p = resolveHome(home);
    ensureDir(p.dir);
    console.log(loadOrCreateKey(p));
    return;
  }
  const portArg = arg("--port");
  const { buildGateway } = await import("./server.js");
  const gw = buildGateway({ home, port: portArg !== undefined ? Number(portArg) : undefined });
  await gw.listen();
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    gw.ctx.log.info("encerrando", { detail: signal });
    try {
      await gw.ctx.flusher.flushAll();
    } catch {
      /* best effort */
    }
    await gw.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  // never print request data; only the error class/message of startup failures
  console.error(JSON.stringify({ t: new Date().toISOString(), lvl: "error", msg: "falha ao iniciar gateway", code: err?.code ?? err?.name, detail: String(err?.message ?? "").slice(0, 200) }));
  process.exit(1);
});


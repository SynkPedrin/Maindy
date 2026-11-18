#!/usr/bin/env node
// maindy-claude-code install|uninstall|status [--dry-run] [--home <dir>] [--endpoint <url>] [--force-statusline]
import { install, uninstall, status, DEFAULT_ENDPOINT } from "../src/installer.mjs";

const USAGE = `Uso: maindy-claude-code <install|uninstall|status> [opções]

  --dry-run            mostra o que mudaria sem gravar nada
  --home <dir>         diretório home (padrão: o seu); settings em <home>/.claude/settings.json
  --endpoint <url>     endpoint OTLP do gateway maindy. (padrão: ${DEFAULT_ENDPOINT})
  --force-statusline   substitui uma statusLine existente (a anterior é restaurada no uninstall)
  --json               saída em JSON`;

function parseArgs(argv) {
  const out = { cmd: null, dryRun: false, forceStatusline: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--force-statusline") out.forceStatusline = true;
    else if (a === "--json") out.json = true;
    else if (a === "--home") out.home = argv[++i];
    else if (a === "--endpoint") out.endpoint = argv[++i];
    else if (a === "-h" || a === "--help") out.cmd = "help";
    else if (!out.cmd) out.cmd = a;
    else throw new Error(`Argumento desconhecido: ${a}`);
  }
  if (out.endpoint !== undefined) {
    let u;
    try {
      u = new URL(out.endpoint);
    } catch {
      throw new Error(`Endpoint inválido: ${out.endpoint}`);
    }
    out.endpoint = u.origin + u.pathname.replace(/\/+$/, "");
  }
  return out;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message + "\n\n" + USAGE);
    return 64;
  }
  const opts = { home: args.home, endpoint: args.endpoint, dryRun: args.dryRun, forceStatusline: args.forceStatusline };
  try {
    if (args.cmd === "install" || args.cmd === "uninstall") {
      const r = args.cmd === "install" ? install(opts) : uninstall(opts);
      if (args.json) {
        console.log(JSON.stringify({ changed: r.changed, dryRun: r.dryRun, messages: r.messages, backupPath: r.backupPath }, null, 2));
        return 0;
      }
      const head = args.cmd === "install" ? "Integração maindy. com o Claude Code" : "Remoção da integração maindy.";
      console.log(`${head}${r.dryRun ? " (simulação — nada foi gravado)" : ""}`);
      console.log(`  arquivo: ${r.paths.settingsPath}`);
      for (const m of r.messages) console.log(`  • ${m}`);
      if (r.backupPath) console.log(`  backup: ${r.backupPath}`);
      if (args.cmd === "install" && !r.dryRun) {
        console.log("  Reinicie o Claude Code para aplicar. Prompts não são enviados (OTEL_LOG_USER_PROMPTS continua desligado).");
      }
      return 0;
    }
    if (args.cmd === "status") {
      const s = status(opts);
      if (args.json) {
        console.log(JSON.stringify(s, null, 2));
        return 0;
      }
      const yn = (b) => (b ? "sim" : "não");
      console.log(`maindy. × Claude Code — ${s.paths.settingsPath}`);
      console.log(`  telemetria OTel → gateway: ${yn(s.otel)}${s.env.OTEL_EXPORTER_OTLP_ENDPOINT ? ` (${s.env.OTEL_EXPORTER_OTLP_ENDPOINT})` : ""}`);
      console.log(`  status line maindy.: ${yn(s.statusLine)}${s.foreignStatusLine ? " (há outra statusLine configurada)" : ""}`);
      console.log(`  hook PostToolUse (Bash): ${yn(s.hook)}`);
      console.log(`  modo gateway (ANTHROPIC_BASE_URL): ${s.gatewayModeEnv ? s.gatewayModeEnv : "não (padrão: somente observabilidade)"}`);
      return 0;
    }
    console.log(USAGE);
    return args.cmd === "help" ? 0 : 64;
  } catch (e) {
    console.error(`Erro: ${e.message}`);
    return e.exitCode ?? 1;
  }
}

process.exitCode = main();

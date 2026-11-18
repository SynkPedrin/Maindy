#!/usr/bin/env node
// maindy-codex install|uninstall|status [--config <config.toml>] [--home <dir>] [--endpoint <url>] [--dry-run]
// maindy-codex rate-limits --experimental   (EXPERIMENTAL: lê limites via `codex app-server`)
import { install, uninstall, status, DEFAULT_ENDPOINT } from "../src/installer.mjs";
import { readCodexRateLimits } from "../src/app-server-rate-limits.mjs";

const USAGE = `Uso: maindy-codex <install|uninstall|status|rate-limits> [opções]

  --config <arquivo>   config.toml do Codex (padrão: <home>/.codex/config.toml)
  --home <dir>         diretório home (padrão: o seu)
  --endpoint <url>     gateway maindy. (padrão: ${DEFAULT_ENDPOINT}; o caminho /v1/logs é adicionado)
  --dry-run            mostra o resultado sem gravar
  --experimental       (rate-limits) habilita a leitura experimental via codex app-server
  --json               saída em JSON`;

function parseArgs(argv) {
  const o = { cmd: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") o.dryRun = true;
    else if (a === "--json") o.json = true;
    else if (a === "--experimental") o.experimental = true;
    else if (a === "--config") o.config = argv[++i];
    else if (a === "--home") o.home = argv[++i];
    else if (a === "--endpoint") o.endpoint = argv[++i];
    else if (a === "-h" || a === "--help") o.cmd = "help";
    else if (!o.cmd) o.cmd = a;
    else throw new Error(`Argumento desconhecido: ${a}`);
  }
  if (o.endpoint !== undefined) {
    try {
      const u = new URL(o.endpoint);
      o.endpoint = u.origin + u.pathname.replace(/\/+$/, "");
    } catch {
      throw new Error(`Endpoint inválido: ${o.endpoint}`);
    }
  }
  return o;
}

async function main() {
  let a;
  try {
    a = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`${e.message}\n\n${USAGE}`);
    return 64;
  }
  try {
    if (a.cmd === "install" || a.cmd === "uninstall") {
      const r = a.cmd === "install" ? install(a) : uninstall(a);
      if (a.json) {
        console.log(JSON.stringify({ path: r.path, changed: r.changed, dryRun: r.dryRun, backupPath: r.backupPath }, null, 2));
        return 0;
      }
      const sim = r.dryRun ? " (simulação — nada foi gravado)" : "";
      if (a.cmd === "install") {
        console.log(r.changed ? `Bloco [otel] da maindy. gravado em ${r.path}${sim}` : `Nada a mudar: ${r.path} já está configurado.`);
        if (r.dryRun) console.log("\n" + r.content);
        if (r.changed && !r.dryRun) console.log("Reinicie o Codex para aplicar. Prompts continuam redigidos (log_user_prompt = false).");
      } else {
        console.log(r.changed ? `Bloco da maindy. removido de ${r.path}${sim}` : `Nenhum bloco da maindy. em ${r.path}.`);
      }
      if (r.backupPath) console.log(`backup: ${r.backupPath}`);
      return 0;
    }
    if (a.cmd === "status") {
      const s = status(a);
      if (a.json) console.log(JSON.stringify(s, null, 2));
      else {
        console.log(`maindy. × Codex — ${s.path}`);
        console.log(`  telemetria OTel → gateway: ${s.installed ? `sim (${s.endpoint})` : "não"}`);
        if (s.unmanagedOtel) console.log(`  atenção: há uma configuração otel sua (${s.unmanagedOtel})`);
      }
      return 0;
    }
    if (a.cmd === "rate-limits") {
      if (!a.experimental && process.env.MAINDY_EXPERIMENTAL_CODEX_APP_SERVER !== "1") {
        console.error("Recurso experimental desligado. Use --experimental (ou MAINDY_EXPERIMENTAL_CODEX_APP_SERVER=1).");
        return 3;
      }
      const snaps = await readCodexRateLimits({ experimental: true });
      console.log(JSON.stringify(snaps, null, 2));
      return 0;
    }
    console.log(USAGE);
    return a.cmd === "help" ? 0 : 64;
  } catch (e) {
    console.error(`Erro: ${e.message}`);
    return e.exitCode ?? 1;
  }
}

main().then((code) => {
  process.exitCode = code;
});

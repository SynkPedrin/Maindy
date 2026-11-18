#!/usr/bin/env node
// Visual QA: serves the built frontend (dist/, built-in static server) and captures the snapshot gallery with the
// Playwright install that lives in apps/web. Output: docs/evidence/screens/desktop-*.png
// Usage: pnpm --filter @maindy/desktop build && pnpm --filter @maindy/desktop snapshots
import { createRequire } from "node:module";
import http from "node:http";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, "..");
const repo = path.resolve(pkg, "../..");
const out = path.join(repo, "docs/evidence/screens");
mkdirSync(out, { recursive: true });

const req = createRequire(path.join(repo, "apps/web/package.json"));
function loadChromium() {
  try {
    return req("@playwright/test").chromium;
  } catch {
    // fallback: the playwright-core package pnpm installed for apps/web
    const store = path.join(repo, "node_modules/.pnpm");
    const dir = readdirSync(store).find((d) => d.startsWith("playwright-core@"));
    if (!dir) throw new Error("playwright não encontrado (instale as dependências de apps/web)");
    return createRequire(import.meta.url)(path.join(store, dir, "node_modules/playwright-core")).chromium;
  }
}
const chromium = loadChromium();

const PORT = 1421;
// Static server for the built frontend (dist/). No vite process needed.
const dist = path.join(pkg, "dist");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" };
const server = http.createServer((rq, rs) => {
  const u = decodeURIComponent(new URL(rq.url, "http://x").pathname);
  const f = path.join(dist, u === "/" ? "index.html" : u);
  if (!f.startsWith(dist) || !existsSync(f)) {
    rs.writeHead(404).end();
    return;
  }
  rs.writeHead(200, { "content-type": TYPES[path.extname(f)] ?? "application/octet-stream" });
  rs.end(readFileSync(f));
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);

// Scroll an element to the top of the scrolling content area.
const top = (page, locator) =>
  locator.evaluate((el) => {
    const box = el.closest(".content-body");
    if (box) box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - 12;
  });
const region = (page, name) => page.getByRole("region", { name, exact: true });

const shots = [
  // name, query, viewport, optional interaction
  ["main-overview", "shot=main&section=overview", [1280, 800]],
  ["main-integrations", "shot=main&section=integrations", [1280, 800]],
  ["main-orbit", "shot=main&section=orbit", [1280, 800]],
  ["main-limits", "shot=main&section=limits", [1280, 800]],
  ["main-settings", "shot=main&section=settings", [1280, 800]],
  ["main-empty", "shot=main&section=overview&scenario=empty", [1280, 800]],
  ["pairing", "shot=main&scenario=unpaired", [1280, 800]],
  ["quick-tray", "shot=quick", [1000, 660]],
  ["notch-collapsed", "shot=notch-collapsed&notch=collapsed", [1000, 620]],
  ["notch-hover", "shot=notch-hover&notch=hover", [1000, 620]],
  ["notch-active", "shot=notch-active&notch=active", [1000, 620]],
  ["notch-alert", "shot=notch-alert&notch=alert", [1000, 620]],
  ["notch-silent", "shot=notch-silent&notch=silent", [1000, 620]],
  ["notch-expanded", "shot=notch-expanded&notch=expanded", [1000, 660]],
  ["pill", "shot=pill&platform=windows", [1000, 620]],
  ["pill-expanded", "shot=pill-expanded&platform=windows", [1000, 660]],
  // v2 — every sidebar page + the functional flows
  ["v2-overview", "shot=main&section=overview", [1280, 800]],
  ["v2-savings", "shot=main&section=savings", [1280, 800]],
  ["v2-integrations", "shot=main&section=integrations", [1280, 900]],
  [
    "v2-integrations-connect",
    "shot=main&section=integrations",
    [1280, 900],
    async (page) => {
      const card = region(page, "Anthropic API");
      await card.getByRole("button", { name: "Conectar" }).click();
      await card.locator("input[type=password]").fill("sk-ant-api03-demo-chave-simulada");
      await top(page, card);
    },
  ],
  [
    "v2-integrations-tested",
    "shot=main&section=integrations",
    [1280, 900],
    async (page) => {
      const card = region(page, "OpenAI API");
      await card.getByRole("button", { name: "Testar conexão" }).click();
      await card.getByText("Conexão OK").waitFor();
      await top(page, card);
    },
  ],
  [
    "v2-integrations-claude-preview",
    "shot=main&section=integrations",
    [1280, 900],
    async (page) => {
      const card = region(page, "Claude Code");
      await card.getByRole("button", { name: "Instalar integração…" }).click();
      await card.getByText("Prévia da instalação").waitFor();
      await top(page, card);
    },
  ],
  [
    "v2-integrations-claude-installed",
    "shot=main&section=integrations",
    [1280, 900],
    async (page) => {
      const card = region(page, "Claude Code");
      await card.getByRole("button", { name: "Instalar integração…" }).click();
      await card.getByRole("button", { name: "Confirmar instalação" }).click();
      await card.getByText("integração instalada").waitFor();
      await top(page, card);
    },
  ],
  [
    "v2-integrations-sdk-probe",
    "shot=main&section=integrations",
    [1280, 900],
    async (page) => {
      const card = region(page, "Agentes locais (SDK)");
      await card.getByRole("button", { name: "Enviar requisição de teste" }).click();
      await card.getByText("Requisição medida pelo gateway").waitFor();
      await top(page, card);
    },
  ],
  ["v2-integrations-gateway-off", "shot=main&section=integrations&scenario=empty", [1280, 900]],
  ["v2-projects", "shot=main&section=projects", [1280, 800]],
  [
    "v2-projects-create",
    "shot=main&section=projects",
    [1280, 800],
    async (page) => {
      await page.getByRole("button", { name: "Novo projeto" }).click();
      await page.getByLabel(/Chave \(header/).fill("billing-worker");
      await page.getByLabel("Nome", { exact: true }).fill("Worker de cobrança");
      await page.getByRole("button", { name: /^API de checkout api-checkout/ }).click();
    },
  ],
  ["v2-limits", "shot=main&section=limits", [1280, 800]],
  ["v2-orbit", "shot=main&section=orbit", [1280, 900]],
  [
    "v2-orbit-mode-preview",
    "shot=main&section=orbit",
    [1280, 900],
    async (page) => {
      await page.getByRole("radio", { name: /Máximo/ }).click();
      await page.getByText(/Antes de ativar/).waitFor();
    },
  ],
  ["v2-quality", "shot=main&section=quality", [1280, 900]],
  [
    "v2-quality-reactivate",
    "shot=main&section=quality",
    [1280, 900],
    async (page) => {
      await page.getByRole("button", { name: "Reativar" }).first().click();
    },
  ],
  ["v2-reports", "shot=main&section=reports", [1280, 900], async (page) => page.getByText(/Trilha de auditoria/).waitFor()],
  [
    "v2-reports-exported",
    "shot=main&section=reports",
    [1280, 900],
    async (page) => {
      await page.getByText(/Trilha de auditoria/).waitFor();
      await page.getByRole("button", { name: "Exportar PDF" }).click();
      await page.getByRole("button", { name: "Mostrar no Finder" }).waitFor();
    },
  ],
  ["v2-billing", "shot=main&section=billing", [1280, 800]],
  ["v2-settings", "shot=main&section=settings", [1280, 900]],
  // v3 — maindy://integrations/<kind> landing + "Configurar com o Claude Code"
  ["v3-claude-agent", "shot=main&section=integrations&focus=claude_code", [1280, 900]],
  [
    "v3-claude-agent-prompt",
    "shot=main&section=integrations&focus=claude_code",
    [1280, 900],
    async (page) => {
      const card = region(page, "Claude Code");
      await card.getByText(/^Ver o prompt/).click();
      await top(page, card.getByRole("region", { name: "Configurar com o Claude Code" }));
    },
  ],
  [
    "v3-claude-agent-watching",
    "shot=main&section=integrations&focus=claude_code",
    [1280, 900],
    async (page) => {
      const card = region(page, "Claude Code");
      await card.getByRole("button", { name: "Abrir no VS Code" }).click();
      await card.getByText(/Aguardando o Claude Code concluir/).waitFor();
      await top(page, card);
    },
  ],
  [
    "v3-claude-agent-done",
    "shot=main&section=integrations&focus=claude_code",
    [1280, 900],
    async (page) => {
      const card = region(page, "Claude Code");
      await card.getByRole("button", { name: "Abrir no Terminal" }).click();
      await card.getByText(/Instalação confirmada pelo gateway/).waitFor({ timeout: 15000 });
      await top(page, card);
    },
  ],
  [
    "v3-claude-agent-copy-only",
    "shot=main&section=integrations&focus=claude_code&targets=none",
    [1280, 900],
    async (page) => {
      const card = region(page, "Claude Code");
      await card.getByText(/^Prefere o Terminal/).click();
      await top(page, card.getByRole("region", { name: "Configurar com o Claude Code" }));
    },
  ],
  ["v3-codex-agent", "shot=main&section=integrations&focus=codex", [1280, 900]],
  ["v3-deeplink-anthropic", "shot=main&section=integrations&focus=anthropic_api", [1280, 900]],
];

const browser = await chromium.launch();
try {
  for (const [name, q, [w, h], act] of shots) {
    if (only && !name.includes(only)) continue;
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await page.goto(`http://127.0.0.1:${PORT}/?view=snapshot&${q}`);
    await page.waitForTimeout(900);
    if (act) {
      await act(page);
      await page.waitForTimeout(700);
    }
    const file = path.join(out, `desktop-${name}.png`);
    await page.screenshot({ path: file });
    console.log("saved", path.relative(repo, file));
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

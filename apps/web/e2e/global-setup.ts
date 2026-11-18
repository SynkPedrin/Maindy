/**
 * Dev-mode warm-up: `next dev` compiles each route on first hit (can take 30–60s under load),
 * which would otherwise blow navigation assertions. A fake session cookie gets past the proxy so the
 * /app route modules compile (the layout then redirects, which is fine).
 */
const ROUTES = [
  "/login",
  "/cadastro",
  "/verificar-email",
  "/esqueci-senha",
  "/redefinir-senha",
  "/app",
  "/app/overview",
  "/app/economia",
  "/app/conexoes",
  "/app/agentes",
  "/app/limites",
  "/app/orbit",
  "/app/qualidade",
  "/app/relatorios",
  "/app/faturamento",
  "/app/faturamento/sandbox",
  "/app/configuracoes",
  "/app/download",
  "/app/onboarding",
  "/app/dispositivos/parear",
];

export default async function globalSetup() {
  if (process.env.E2E_SKIP_WARMUP) return;
  const base = process.env.BASE_URL ?? "http://localhost:3102";
  for (const r of ROUTES) {
    try {
      await fetch(base + r, { headers: { cookie: "maindy_session=warmup" }, redirect: "manual", signal: AbortSignal.timeout(180_000) });
    } catch {
      /* best effort */
    }
  }
}

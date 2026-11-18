import { cache } from "react";
import { cookies } from "next/headers";
import { MeDto } from "@maindy/contracts";

export const SESSION_COOKIE = "maindy_session";
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4100";

export type ServerMeResult =
  | { kind: "ok"; me: MeDto }
  | { kind: "unauthenticated" }
  | { kind: "error"; message: string };

/**
 * Real server-side session check: forwards the session cookie to `GET /v1/me`.
 * Cached per request so layout + page share one call.
 */
export const getServerMe = cache(async (): Promise<ServerMeResult> => {
  const jar = await cookies();
  const session = jar.get(SESSION_COOKIE)?.value;
  if (!session) return { kind: "unauthenticated" };
  const call = () =>
    fetch(`${API_INTERNAL_URL}/v1/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${session}`, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  try {
    // one retry for transient socket resets (keep-alive races) before showing the error screen
    const res = await call().catch(() => call());
    if (res.status === 401 || res.status === 403) return { kind: "unauthenticated" };
    if (!res.ok) return { kind: "error", message: `A API respondeu ${res.status}.` };
    const parsed = MeDto.safeParse(await res.json());
    if (!parsed.success) return { kind: "error", message: "Resposta inesperada da API (/v1/me)." };
    return { kind: "ok", me: parsed.data };
  } catch {
    return { kind: "error", message: "Não foi possível falar com a API agora." };
  }
});

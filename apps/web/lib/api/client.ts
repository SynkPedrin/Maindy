/**
 * Browser API client. Every call goes through the same-origin rewrite `/api/*` → control plane,
 * so the httpOnly `maindy_session` cookie stays first-party. Mutations send `x-maindy-csrf: 1`.
 */
import { ApiError as ApiErrorSchema } from "@maindy/contracts";
import type { z } from "zod";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const FALLBACK_MESSAGES: Record<number, string> = {
  400: "Não foi possível processar a solicitação.",
  401: "Sua sessão expirou. Entre novamente.",
  403: "Você não tem permissão para esta ação.",
  404: "Recurso não encontrado.",
  409: "Conflito com o estado atual. Atualize a página e tente de novo.",
  429: "Muitas tentativas. Aguarde um pouco e tente novamente.",
  500: "Erro interno. Tente novamente em instantes.",
  502: "Serviço temporariamente indisponível.",
  503: "Serviço temporariamente indisponível.",
};

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRequestOptions {
  method?: Method;
  body?: unknown;
  signal?: AbortSignal;
}

export function apiUrl(path: string): string {
  return `/api${path.startsWith("/") ? path : `/${path}`}`;
}

async function request(path: string, opts: ApiRequestOptions = {}): Promise<Response> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = { accept: "application/json" };
  if (method !== "GET") headers["x-maindy-csrf"] = "1";
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers,
      credentials: "include",
      cache: "no-store",
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ApiClientError(0, "network_error", "Não foi possível conectar ao servidor. Verifique sua conexão.");
  }
  if (!res.ok) {
    let code = `http_${res.status}`;
    let message = FALLBACK_MESSAGES[res.status] ?? "Algo deu errado. Tente novamente.";
    let details: unknown;
    try {
      const parsed = ApiErrorSchema.safeParse(await res.json());
      if (parsed.success) {
        code = parsed.data.error.code;
        message = parsed.data.error.message || message;
        details = parsed.data.error.details;
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiClientError(res.status, code, message, details);
  }
  return res;
}

/** Call the API and validate the JSON body with a zod schema (contracts are the source of truth). */
export async function api<S extends z.ZodType>(path: string, schema: S, opts?: ApiRequestOptions): Promise<z.infer<S>> {
  const res = await request(path, opts);
  if (res.status === 204) return schema.parse(null);
  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : null;
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[api] resposta fora do contrato em ${path}`, parsed.error.issues.slice(0, 5));
    }
    throw new ApiClientError(res.status, "contract_mismatch", "Resposta inesperada do servidor.", parsed.error.issues);
  }
  return parsed.data;
}

/** Fire a mutation where the body is irrelevant (202/204). */
export async function apiVoid(path: string, opts?: ApiRequestOptions): Promise<void> {
  await request(path, opts);
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Algo deu errado. Tente novamente.";
}

/** Only same-origin relative paths are allowed as post-login redirects. */
export function safeNextPath(next: string | null | undefined, fallback = "/app"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\r\n\t]/.test(next)) return fallback;
  try {
    const u = new URL(next, "http://same.origin");
    if (u.origin !== "http://same.origin") return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}

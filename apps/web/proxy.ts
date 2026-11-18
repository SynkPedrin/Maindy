import { NextResponse, type NextRequest } from "next/server";

/**
 * Next 16 `proxy` (formerly middleware): cheap first gate for private routes.
 * Only checks cookie presence; the /app layout performs the real session check against GET /v1/me.
 * It also forwards the requested path so the server layout can build `?next=` on a 401.
 *
 * MAINDY_PUBLIC_ONLY=1 (public marketing deploys without API/DB): account and dashboard routes
 * go to /em-breve instead of failing against a missing API.
 */
const PUBLIC_ONLY = process.env.MAINDY_PUBLIC_ONLY === "1";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (PUBLIC_ONLY) {
    const url = request.nextUrl.clone();
    url.pathname = "/em-breve";
    url.search = "";
    return path.startsWith("/api/") ? NextResponse.json({ error: { code: "unavailable", message: "Em breve." } }, { status: 503 }) : NextResponse.redirect(url);
  }
  if (!path.startsWith("/app")) return NextResponse.next();
  const next = `${path}${request.nextUrl.search}`;
  if (!request.cookies.has("maindy_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(url);
  }
  const headers = new Headers(request.headers);
  headers.set("x-maindy-path", next);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/app", "/app/:path*", "/login", "/cadastro", "/verificar-email", "/esqueci-senha", "/redefinir-senha", "/api/:path*"],
};

import { badRequest } from "./errors.js";

/** Opaque keyset cursor over (timestamp desc, id desc). */
export function encodeCursor(t: Date, id: string): string {
  return Buffer.from(JSON.stringify({ t: t.toISOString(), id })).toString("base64url");
}

export function decodeCursor(cursor: string | undefined): { t: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const v = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { t?: unknown; id?: unknown };
    if (typeof v.t !== "string" || typeof v.id !== "string" || !/^[0-9a-f-]{36}$/i.test(v.id)) throw new Error("bad");
    const t = new Date(v.t);
    if (Number.isNaN(t.getTime())) throw new Error("bad");
    return { t, id: v.id };
  } catch {
    throw badRequest("invalid_cursor", "Cursor de paginação inválido.");
  }
}

import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';

/** Cliente Supabase do usuário, com sessão em cookies httpOnly da própria LP. */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Chamado a partir de um Server Component: a escrita é ignorada (sem middleware de refresh).
        }
      },
    },
  });
}

/** Provedores sociais ativos no GoTrue (lê /auth/v1/settings, endpoint público). */
export async function getEnabledProviders(): Promise<{ google: boolean; github: boolean }> {
  try {
    const res = await fetch(`${publicEnv.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: publicEnv.supabaseAnonKey },
      cache: 'no-store',
    });
    if (!res.ok) return { google: false, github: false };
    const data = (await res.json()) as { external?: Record<string, boolean> };
    return { google: Boolean(data.external?.google), github: Boolean(data.external?.github) };
  } catch {
    return { google: false, github: false };
  }
}

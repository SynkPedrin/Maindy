import { z } from 'zod';

const publicSchema = z.object({
  siteUrl: z.string().url(),
  supabaseUrl: z.string().url(),
  supabaseAnonKey: z.string().min(20),
  appUrl: z.string().url(),
});

/** Variáveis públicas. Next só inlines NEXT_PUBLIC_* quando lidas literalmente. */
export const publicEnv = publicSchema.parse({
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3100',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  appUrl: process.env.NEXT_PUBLIC_MAINDY_APP_URL ?? 'http://localhost:8081',
});

export const POLICY_VERSION = process.env.MAINDY_POLICY_VERSION ?? '2026-11-12';

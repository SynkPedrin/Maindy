import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Backend address.
 * - Development (Metro): derived from the Metro host, so a phone on the same Wi-Fi reaches the Mac.
 * - Builds: EXPO_PUBLIC_API_URL (and optionally EXPO_PUBLIC_SUPABASE_URL) baked at build time.
 * - Runtime override: the user can change the server on the login screen ("Servidor"); it is stored
 *   on the device and used for both the MAINDY API and Supabase Auth (the API proxies /auth/v1).
 */
function devHost(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.hostname || 'localhost';
  const hostUri = Constants.expoConfig?.hostUri ?? (Constants as unknown as { manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } } }).manifest2?.extra?.expoGo?.debuggerHost;
  const host = hostUri?.split(':')[0];
  if (host && !host.includes('exp.direct') && !host.includes('ngrok')) return host;
  return Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
}

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().replace(/\/+$/, '') : null);

export const DEFAULT_API_URL = str(extra.apiUrl) ?? `http://${devHost()}:4000`;
const DEFAULT_SUPABASE_URL = str(extra.supabaseUrl) ?? (str(extra.apiUrl) ? DEFAULT_API_URL : `http://${devHost()}:54321`);

let override: string | null = null;
// v2: builds pointing at the cloud ignore server overrides saved by older LAN test builds.
const KEY = 'maindy.server.v2';

export function apiUrl(): string {
  return override ?? DEFAULT_API_URL;
}
export function supabaseUrl(): string {
  return override ?? DEFAULT_SUPABASE_URL;
}
/** Base URL the Supabase client is created with; requests are rewritten to supabaseUrl() at call time. */
export const SUPABASE_BOOT_URL = DEFAULT_SUPABASE_URL;

export async function loadServerOverride(): Promise<void> {
  try {
    override = str(await AsyncStorage.getItem(KEY));
  } catch {
    override = null;
  }
}
export async function setServerOverride(url: string | null): Promise<void> {
  override = str(url);
  try {
    if (override) await AsyncStorage.setItem(KEY, override);
    else await AsyncStorage.removeItem(KEY);
  } catch {}
}

/** Public anon key (designed to ship in clients; RLS + our API protect the data). */
export const SUPABASE_ANON_KEY =
  str(extra.supabaseAnonKey) ??
  // local Supabase default anon key (identical on every machine; not a secret)
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export const CONSENT_POLICY_VERSION = '2026-11-12';

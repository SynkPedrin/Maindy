import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { SUPABASE_ANON_KEY, SUPABASE_BOOT_URL, supabaseUrl } from './config';

/**
 * Session storage: iOS Keychain / Android Keystore via expo-secure-store. SecureStore values
 * are limited to ~2 KB, so the session JSON is chunked. Web uses localStorage.
 */
const CHUNK = 1800;
const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await SecureStore.getItemAsync(`${key}.n`);
    if (!count) return null;
    const parts: string[] = [];
    for (let i = 0; i < Number(count); i++) parts.push((await SecureStore.getItemAsync(`${key}.${i}`)) ?? '');
    return parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    const n = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < n; i++) await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    await SecureStore.setItemAsync(`${key}.n`, String(n));
  },
  async removeItem(key: string): Promise<void> {
    const count = Number((await SecureStore.getItemAsync(`${key}.n`)) ?? 0);
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.deleteItemAsync(`${key}.n`);
  },
};

/** Rewrites the boot URL to the current server so the server can be changed at runtime. */
const rewritingFetch: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const target = url.startsWith(SUPABASE_BOOT_URL) ? supabaseUrl() + url.slice(SUPABASE_BOOT_URL.length) : url;
  return fetch(target, init);
};

export const supabase = createClient(SUPABASE_BOOT_URL, SUPABASE_ANON_KEY, {
  global: { fetch: rewritingFetch },
  auth: {
    storage: Platform.OS === 'web' ? undefined : secureStorage,
    storageKey: 'maindy.session',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/** Reads `#access_token=…&refresh_token=…` (landing page / OAuth hand-off) and stores the session. */
export async function setSessionFromFragment(fragment: string): Promise<boolean> {
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return false;
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  return !error;
}

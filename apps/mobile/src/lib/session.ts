import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from './supabase';

interface SessionStore {
  ready: boolean;
  session: Session | null;
  set: (p: Partial<Pick<SessionStore, 'ready' | 'session'>>) => void;
}

export const useSession = create<SessionStore>((set) => ({ ready: false, session: null, set: (p) => set(p) }));

let started = false;
export function startSessionListener(): void {
  if (started) return;
  started = true;
  supabase.auth.getSession().then(({ data }) => useSession.getState().set({ session: data.session, ready: true }));
  supabase.auth.onAuthStateChange((_event, session) => useSession.getState().set({ session, ready: true }));
}

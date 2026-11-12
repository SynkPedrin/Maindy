import type {
  ActionSummary,
  AgentProfile,
  AgentSettings,
  CalendarEvent,
  ChatResponse,
  FocusMode,
  HealthStatus,
  Memory,
  MemorySearchHit,
  Reminder,
  Task,
  VoiceOption,
} from '@maindy/core/contracts';
import { apiUrl } from './config';
import { supabase } from './supabase';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

async function token(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function idemKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function request<T>(method: string, path: string, body?: unknown, opts: { idempotent?: boolean; raw?: boolean } = {}): Promise<T> {
  const t = await token();
  const headers: Record<string, string> = {};
  if (t) headers.Authorization = `Bearer ${t}`;
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (opts.idempotent) headers['Idempotency-Key'] = idemKey();
  let res: Response;
  try {
    res = await fetch(`${apiUrl()}${path}`, { method, headers, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'network', 'Sem conexão com o servidor da MAINDY.');
  }
  if (res.status === 204) return null as T;
  if (!res.ok) {
    let j: { error?: string; message?: string } = {};
    try {
      j = await res.json();
    } catch {}
    if (res.status === 401) await supabase.auth.refreshSession().catch(() => undefined);
    throw new ApiError(res.status, j.error ?? 'error', j.message ?? `Erro ${res.status}`);
  }
  if (opts.raw) return (await res.arrayBuffer()) as T;
  return (await res.json()) as T;
}

export interface HomeData {
  profile: { displayName: string | null; timezone: string; onboardingCompletedAt: string | null } | null;
  agent: AgentProfile;
  timezone: string;
  now: string;
  priorities: Task[];
  pendingTasks: number;
  upcomingReminders: Reminder[];
  todayEvents: CalendarEvent[];
  focus: { id: string; mode: FocusMode; startedAt: string; endsAt: string | null } | null;
  recentMemories: Memory[];
}

export interface VoiceChatResponse extends ChatResponse {
  transcript: string;
  transcriptionProvider: string;
  speech: { audioBase64: string; mimeType: string; provider: string } | null;
}

export const api = {
  health: () => request<HealthStatus>('GET', '/v1/health'),
  me: () => request<{ profile: HomeData['profile'] & { role: string }; agent: AgentProfile; settings: AgentSettings; email?: string }>('GET', '/v1/me'),
  updateMe: (patch: { displayName?: string; timezone?: string; onboardingCompleted?: boolean }) => request('PATCH', '/v1/me', patch),
  home: () => request<HomeData>('GET', '/v1/home'),

  chat: (message: string, conversationId: string | null) => request<ChatResponse>('POST', '/v1/agent/chat', { message, conversationId, inputMode: 'text' }, { idempotent: true }),
  voiceChat: (form: FormData) => request<VoiceChatResponse>('POST', '/v1/agent/voice', form),
  conversations: () => request<Array<{ id: string; title: string | null; updatedAt: string }>>('GET', '/v1/agent/conversations'),
  messages: (id: string) => request<Array<{ id: string; role: 'user' | 'assistant'; content: string; memoryRefs: string[]; createdAt: string }>>('GET', `/v1/agent/conversations/${id}/messages`),

  actions: (status?: string) => request<ActionSummary[]>('GET', `/v1/actions${status ? `?status=${status}` : ''}`),
  confirmAction: (id: string, approve: boolean) => request<ActionSummary>('POST', `/v1/actions/${id}/confirm`, { approve }, { idempotent: true }),

  memories: (q: { category?: string; personId?: string } = {}) => request<Memory[]>('GET', `/v1/memories?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])}`),
  memory: (id: string) => request<Memory & { versions: Array<{ version: number; content: string; changedBy: string; createdAt: string }> }>('GET', `/v1/memories/${id}`),
  searchMemories: (q: string) => request<MemorySearchHit[]>('GET', `/v1/memories/search?q=${encodeURIComponent(q)}`),
  createMemory: (content: string, source: 'text' | 'voice' = 'text') => request<Memory>('POST', '/v1/memories', { content, source }, { idempotent: true }),
  updateMemory: (id: string, patch: { title?: string; content?: string; category?: string }) => request<Memory>('PATCH', `/v1/memories/${id}`, patch),
  deleteMemory: (id: string) => request<null>('DELETE', `/v1/memories/${id}`),
  people: () => request<Array<{ id: string; name: string; relation: string | null; memoryCount: number }>>('GET', '/v1/people'),

  provisionVault: () => request<{ id: string; status: string; lastSyncedAt: string | null; folders: string[] }>('POST', '/v1/vaults/provision', {}, { idempotent: true }),
  syncVault: () => request<{ written: number; imported: number; created: number; conflicts: number; removed: number }>('POST', '/v1/vaults/sync', {}),
  connectVault: () => request<{ id: string; token: string; note: string }>('POST', '/v1/vaults/connect', { deviceLabel: 'Obsidian' }, { idempotent: true }),

  tasks: (status: 'pending' | 'done' | 'all' = 'pending') => request<Task[]>('GET', `/v1/tasks?status=${status}`),
  createTask: (t: { title: string; priority?: 1 | 2 | 3; dueAt?: string | null }) => request<Task>('POST', '/v1/tasks', t, { idempotent: true }),
  updateTask: (id: string, patch: { status?: 'pending' | 'done' | 'cancelled'; priority?: number }) => request<Task>('PATCH', `/v1/tasks/${id}`, patch),

  reminders: (from?: string, to?: string) => request<Reminder[]>('GET', `/v1/reminders?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}`),
  createReminder: (r: { title: string; remindAt: string; recurrenceRule?: string | null }) => request<Reminder>('POST', '/v1/reminders', r, { idempotent: true }),
  completeReminder: (id: string) => request<Reminder>('POST', `/v1/reminders/${id}/complete`, {}),
  snoozeReminder: (id: string, minutes: number) => request<Reminder>('POST', `/v1/reminders/${id}/snooze`, { minutes }),
  cancelReminder: (id: string) => request<null>('DELETE', `/v1/reminders/${id}`),

  events: (from: string, to: string) => request<CalendarEvent[]>('GET', `/v1/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  createEvent: (e: { title: string; startsAt: string; endsAt: string; location?: string | null; recurrenceRule?: string | null }) => request<CalendarEvent>('POST', '/v1/calendar/events', e, { idempotent: true }),
  deleteEvent: (id: string) => request<null>('DELETE', `/v1/calendar/events/${id}`),

  focus: () => request<HomeData['focus']>('GET', '/v1/focus'),
  setFocus: (mode: FocusMode, minutes: number | null) => request<HomeData['focus']>('POST', '/v1/focus', { mode, minutes }),

  agent: () => request<AgentProfile>('GET', '/v1/agents/me'),
  updateAgent: (patch: Partial<Omit<AgentProfile, 'id'>>) => request<AgentProfile>('PATCH', '/v1/agents/me', patch),
  settings: () => request<AgentSettings>('GET', '/v1/settings'),
  updateSettings: (patch: Partial<AgentSettings>) => request<AgentSettings>('PATCH', '/v1/settings', patch),

  permissions: () => request<{ capabilities: Array<{ capability: string; level: number; defaultMode: string; integration?: string; description: string }>; grants: Array<{ id: string; capability: string; mode: string; revokedAt: string | null; expiresAt: string | null; createdAt: string }> }>('GET', '/v1/permissions'),
  grant: (capability: string, mode: 'auto' | 'confirm' | 'deny') => request('POST', '/v1/permissions', { capability, mode }, { idempotent: true }),
  revoke: (id: string) => request<null>('DELETE', `/v1/permissions/${id}`),
  audit: () => request<Array<{ id: number; actor: string; action: string; targetType: string | null; createdAt: string }>>('GET', '/v1/audit?limit=60'),

  integrations: () => request<Array<{ provider: string; label: string; available: boolean; status: string; note?: string }>>('GET', '/v1/integrations'),
  connectIntegration: (provider: string) => request<{ authorizationUrl: string }>('POST', `/v1/integrations/${provider}/connect`, {}),
  disconnectIntegration: (provider: string) => request<null>('DELETE', `/v1/integrations/${provider}`),
  weather: (lat: number, lon: number) => request<{ temperatureC: number; description: string; todayMinC: number; todayMaxC: number; precipitationProbability: number | null }>('GET', `/v1/weather?lat=${lat}&lon=${lon}`),

  devices: () => request<Array<{ id: string; platform: string; name: string | null; lastSeenAt: string; revokedAt: string | null }>>('GET', '/v1/devices'),
  registerDevice: (d: { platform: 'ios' | 'android' | 'web'; name: string | null; pushToken: string | null }) => request('POST', '/v1/devices', d, { idempotent: true }),
  revokeDevice: (id: string) => request<null>('DELETE', `/v1/devices/${id}`),

  voiceProviders: () => request<Array<{ id: string; label: string; available: boolean; detail?: string }>>('GET', '/v1/voice/providers'),
  voices: (provider: string) => request<VoiceOption[]>('GET', `/v1/voice/voices?provider=${provider}`),
  voicePreviewUrl: () => `${apiUrl()}/v1/voice/preview`,
  about: () => request<{ work: string; activities: string; routine: string }>('GET', '/v1/profile/about'),
  saveAbout: (a: { work: string; activities: string; routine: string }) => request<{ ok: true }>('PUT', '/v1/profile/about', a),

  recordConsent: (kind: string, granted: boolean, policyVersion: string) => request('POST', '/v1/consents', { kind, granted, policyVersion }, { idempotent: true }),
  exportData: () => request<unknown>('GET', '/v1/privacy/export'),
  deleteAccount: () => request<null>('DELETE', '/v1/account', { confirm: 'APAGAR' }),
};

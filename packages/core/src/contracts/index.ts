/**
 * Shared, dependency-light contracts used by the API, the mobile app and the core engines.
 * Nothing in this file may import Node-only modules (the mobile bundle imports it).
 */

export const MEMORY_TYPES = [
  'personal',
  'episodic',
  'semantic',
  'people',
  'task',
  'commitment',
  'habit',
  'contextual',
] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export const MEMORY_SOURCES = ['voice', 'text', 'import', 'integration', 'agent', 'vault'] as const;
export type MemorySource = (typeof MEMORY_SOURCES)[number];

/** Where a piece of information came from — always shown to the user. */
export const PROVENANCES = ['user_confirmed', 'ai_inferred', 'external', 'unverified'] as const;
export type Provenance = (typeof PROVENANCES)[number];

export const CATEGORIES = [
  'people',
  'personal',
  'work',
  'study',
  'health',
  'finance',
  'routines',
  'important',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const FOCUS_MODES = ['off', 'work', 'study', 'rest', 'sleep', 'driving'] as const;
export type FocusMode = (typeof FOCUS_MODES)[number];

export interface PersonRef {
  id: string;
  name: string;
  relation: string | null;
}

export interface Memory {
  id: string;
  type: MemoryType;
  category: Category | string;
  title: string;
  content: string;
  source: MemorySource;
  provenance: Provenance;
  confidence: number;
  tags: string[];
  originalUtterance: string | null;
  occurredAt: string | null;
  version: number;
  vaultPath: string | null;
  people: PersonRef[];
  createdAt: string;
  updatedAt: string;
}

export interface MemorySearchHit {
  memory: Memory;
  score: number;
  textRank: number;
  vectorSimilarity: number;
  personMatch: boolean;
}

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  status: 'pending' | 'done' | 'cancelled';
  priority: 1 | 2 | 3;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface Reminder {
  id: string;
  title: string;
  body: string | null;
  remindAt: string;
  timezone: string;
  recurrenceRule: string | null;
  status: 'scheduled' | 'delivered' | 'done' | 'cancelled';
  taskId: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  timezone: string;
  recurrenceRule: string | null;
  source: 'maindy' | 'google' | 'device';
}

export interface AgentProfile {
  id: string;
  name: string;
  personality: string;
  tone: string;
  language: string;
  responseStyle: 'curto' | 'equilibrado' | 'detalhado';
  voiceProvider: string;
  voiceId: string | null;
}

export interface AgentSettings {
  autoSaveMemories: boolean;
  speechRate: number;
  speakResponses: boolean;
  storeAudio: boolean;
  allowModelTraining: boolean;
  forwardNotificationContents: boolean;
}

/** Autonomy levels of the Permission Engine. */
export enum AutonomyLevel {
  Read = 0,
  Organize = 1,
  Reversible = 2,
  External = 3,
  Sensitive = 4,
}

export type PermissionMode = 'auto' | 'confirm' | 'deny';

export interface ActionSummary {
  id: string;
  tool: string;
  summary: string;
  autonomyLevel: AutonomyLevel;
  status:
    | 'planned'
    | 'awaiting_confirmation'
    | 'executing'
    | 'succeeded'
    | 'failed'
    | 'rejected'
    | 'expired';
  requiresConfirmation: boolean;
  result?: unknown;
  error?: string | null;
}

export type AgentMode = 'claude' | 'offline';

export interface ChatResponse {
  conversationId: string;
  messageId: string;
  reply: string;
  /** memories the answer was based on, with provenance for source attribution */
  memoryRefs: Array<Pick<Memory, 'id' | 'title' | 'provenance' | 'source' | 'createdAt'>>;
  actions: ActionSummary[];
  suggestions: string[];
  /** 'offline' = Claude was not available; the deterministic local engine answered */
  mode: AgentMode;
  intent: string;
}

export interface VoiceOption {
  id: string;
  name: string;
  provider: string;
  language: string | null;
  description?: string;
}

export interface HealthStatus {
  ok: boolean;
  database: boolean;
  ai: { provider: string; configured: boolean; model: string | null };
  voice: Array<{ provider: string; available: boolean; detail?: string }>;
  embeddings: { provider: string; ready: boolean };
}

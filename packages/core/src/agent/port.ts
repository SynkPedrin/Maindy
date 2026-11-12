import type {
  ActionSummary,
  AgentProfile,
  AgentSettings,
  CalendarEvent,
  FocusMode,
  Memory,
  MemorySearchHit,
  MemorySource,
  MemoryType,
  Provenance,
  Reminder,
  Task,
} from '../contracts/index.js';
import type { AgentTurnMessage } from '../ai/provider.js';
import type { PermissionContext } from '../permissions/engine.js';

/**
 * Data port the agent uses to act. Implemented by the API with a user-scoped database
 * transaction (RLS enforced). The agent never touches SQL, the filesystem or a shell.
 */

export interface NewMemoryInput {
  title: string;
  content: string;
  type: MemoryType;
  category: string;
  tags: string[];
  people: Array<{ name: string; relation: string | null }>;
  source: MemorySource;
  provenance: Provenance;
  confidence: number;
  originalUtterance: string | null;
  occurredAt?: string | null;
}

export interface NewTaskInput {
  title: string;
  notes: string | null;
  priority: 1 | 2 | 3;
  dueAt: string | null;
  sourceMemoryId?: string | null;
}

export interface NewReminderInput {
  title: string;
  body: string | null;
  remindAt: string;
  timezone: string;
  recurrenceRule: string | null;
  taskId?: string | null;
}

export interface NewEventInput {
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  recurrenceRule: string | null;
}

export interface EmailDraftInput {
  to: string;
  subject: string;
  body: string;
}

export interface PlannedActionInput {
  tool: string;
  input: unknown;
  autonomyLevel: number;
  summary: string;
  requiresConfirmation: boolean;
  status: ActionSummary['status'];
  result?: unknown;
  error?: string | null;
}

export interface AgentPort {
  searchMemories(query: string, limit: number): Promise<MemorySearchHit[]>;
  saveMemory(input: NewMemoryInput): Promise<Memory>;
  deleteMemory(id: string): Promise<void>;
  getMemory(id: string): Promise<Memory | null>;

  createTask(input: NewTaskInput): Promise<Task>;
  completeTask(id: string): Promise<Task>;
  listTasks(status: 'pending' | 'done' | 'all'): Promise<Task[]>;

  createReminder(input: NewReminderInput): Promise<Reminder>;
  listReminders(fromIso: string | null, toIso: string | null): Promise<Reminder[]>;

  listEvents(fromIso: string, toIso: string): Promise<CalendarEvent[]>;
  createEvent(input: NewEventInput): Promise<CalendarEvent>;

  /** Gmail adapter; throws IntegrationUnavailableError when not connected */
  draftEmail(input: EmailDraftInput): Promise<{ draftId: string }>;
  sendEmail(input: EmailDraftInput): Promise<{ messageId: string }>;

  startFocus(mode: FocusMode, minutes: number | null): Promise<{ id: string; endsAt: string | null }>;

  /** Runs `fn` so that a failure inside it does not poison the surrounding transaction (savepoint). */
  atomic<T>(fn: () => Promise<T>): Promise<T>;

  recordAction(input: PlannedActionInput): Promise<ActionSummary>;
  audit(action: string, targetType: string | null, targetId: string | null, metadata?: Record<string, unknown>): Promise<void>;
}

export class IntegrationUnavailableError extends Error {
  constructor(readonly integration: string, message?: string) {
    super(message ?? `${integration} não está conectado`);
    this.name = 'IntegrationUnavailableError';
  }
}

export interface AgentContext {
  userId: string;
  displayName: string | null;
  timezone: string;
  agent: AgentProfile;
  settings: AgentSettings;
  history: AgentTurnMessage[];
  permissions: PermissionContext;
  /** what the user told us about themselves (work, activities, routine) — user-confirmed */
  aboutUser?: string[];
}

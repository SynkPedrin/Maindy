import {
  AgentOrchestrator,
  AnthropicProvider,
  ElevenLabsProvider,
  OpenAIAudioProvider,
  VaultEngine,
  VoiceRegistry,
  VoiceStudioProvider,
  executeTool,
  planSync,
  serializeMemory,
  sha256,
  type ActionSummary,
  type AgentContext,
  type AgentPort,
  type Memory,
  type MemorySearchHit,
  type NewMemoryInput,
  type PlannedActionInput,
  type ToolName,
} from '@maindy/core';
import type { FastifyBaseLogger } from 'fastify';
import { AuthVerifier } from './auth.js';
import type { AppConfig } from './config.js';
import { Database, type Db, type UserClaims } from './db.js';
import { LocalEmbeddingProvider, NoEmbeddingProvider, SupabaseEdgeEmbeddingProvider, type EmbeddingProvider } from './embeddings.js';
import { GoogleClient } from './integrations/google.js';
import * as M from './repo/memories.js';
import * as P from './repo/planning.js';
import * as S from './repo/system.js';

export interface AppServices {
  config: AppConfig;
  db: Database;
  auth: AuthVerifier;
  embeddings: EmbeddingProvider;
  vault: VaultEngine;
  ai: AnthropicProvider;
  voice: VoiceRegistry;
  orchestrator: AgentOrchestrator;
  log: FastifyBaseLogger;
}

export function createServices(config: AppConfig, log: FastifyBaseLogger, overrides: Partial<AppServices> = {}): AppServices {
  const db = overrides.db ?? new Database(config.databaseUrl);
  const ai = overrides.ai ?? new AnthropicProvider(config.models, config.anthropicApiKey);
  return {
    config,
    db,
    auth: overrides.auth ?? new AuthVerifier(config.supabaseUrl, config.supabaseJwtSecret),
    embeddings:
      overrides.embeddings ??
      (config.embeddingsProvider === 'local'
        ? new LocalEmbeddingProvider()
        : config.embeddingsProvider === 'supabase' && config.serviceRoleKey
          ? new SupabaseEdgeEmbeddingProvider(config.supabaseUrl, config.serviceRoleKey)
          : new NoEmbeddingProvider()),
    vault: overrides.vault ?? new VaultEngine(config.storageRoot),
    ai,
    voice:
      overrides.voice ??
      new VoiceRegistry()
        .register(new VoiceStudioProvider(config.voiceStudioUrl))
        .register(new ElevenLabsProvider(config.elevenLabsApiKey))
        .register(new OpenAIAudioProvider(config.openAiApiKey)),
    orchestrator: overrides.orchestrator ?? new AgentOrchestrator(ai),
    log,
  };
}

export interface RequestUser {
  id: string;
  email: string | undefined;
  appRole: string;
  claims: UserClaims;
}

/** Memory operations that keep DB, embeddings and the Obsidian vault consistent. */
export class MemoryService {
  constructor(private readonly s: AppServices, private readonly db: Db, private readonly user: RequestUser) {}

  async vaultKey(): Promise<string> {
    const { rows } = await this.db.query(`select storage_key from maindy.vaults where status = 'active' limit 1`);
    if (rows[0]) return rows[0].storage_key;
    const profile = await S.getProfile(this.db);
    const { storageKey } = await this.s.vault.provision(this.user.id, profile?.displayName ?? null);
    await this.db.query(`insert into maindy.vaults (user_id, storage_key) values ($1, $2) on conflict (user_id) do update set status = 'active'`, [this.user.id, storageKey]);
    await S.audit(this.db, this.user.id, 'system', 'vault.provisioned', 'vault', storageKey);
    return storageKey;
  }

  async embed(text: string): Promise<number[] | null> {
    if (this.s.embeddings.id === 'none') return null;
    try {
      const [v] = await this.s.embeddings.embed([text]);
      return v ?? null;
    } catch (err) {
      this.s.log.warn({ err: (err as Error).message }, 'embedding failed; continuing with lexical search');
      return null;
    }
  }

  private async mirror(memory: Memory, previousPath: string | null): Promise<Memory> {
    try {
      const key = await this.vaultKey();
      const { relPath, hash } = await this.s.vault.writeMemory(key, memory, previousPath);
      await M.setVaultState(this.db, memory.id, relPath, hash);
      for (const p of memory.people) {
        const { rows } = await this.db.query(
          `select m.title, m.vault_path from maindy.memories m join maindy.memory_people mp on mp.memory_id = m.id where mp.person_id = $1 order by m.created_at desc limit 200`,
          [p.id],
        );
        await this.s.vault.writePersonNote(key, p.name, p.relation, rows.map((r) => ({ title: r.title, vaultPath: r.vault_path })));
      }
      return { ...memory, vaultPath: relPath };
    } catch (err) {
      // the DB is the source of truth; the next /vaults/sync repairs the mirror
      this.s.log.error({ err: (err as Error).message, memoryId: memory.id }, 'vault write failed');
      return memory;
    }
  }

  async create(input: NewMemoryInput, actor: 'user' | 'agent' = 'user'): Promise<Memory> {
    // the same fact said twice is one memory (keeps retrieval clean)
    const { rows: dup } = await this.db.query(
      `select id from maindy.memories where maindy.immutable_unaccent(lower(regexp_replace(content, '[[:punct:][:space:]]+', '', 'g'))) =
              maindy.immutable_unaccent(lower(regexp_replace($1, '[[:punct:][:space:]]+', '', 'g'))) limit 1`,
      [input.content],
    );
    if (dup[0]) {
      const existing = await M.getMemoryRow(this.db, dup[0].id);
      if (existing) {
        await S.audit(this.db, this.user.id, actor, 'memory.duplicate_skipped', 'memory', existing.memory.id);
        return existing.memory;
      }
    }
    const memory = await M.insertMemory(this.db, this.user.id, input);
    const vector = await this.embed(`${memory.title}\n${memory.content}`);
    if (vector) await M.upsertEmbedding(this.db, this.user.id, memory.id, this.s.embeddings.model, vector);
    const mirrored = await this.mirror(memory, null);
    await S.audit(this.db, this.user.id, actor, 'memory.created', 'memory', memory.id, { source: input.source, type: input.type });
    return mirrored;
  }

  async update(id: string, patch: { title?: string; content?: string; category?: string; tags?: string[] }, changedBy: 'user' | 'agent' | 'vault_sync' = 'user'): Promise<Memory | null> {
    const before = await M.getMemoryRow(this.db, id);
    if (!before) return null;
    const memory = await M.updateMemory(this.db, this.user.id, id, { ...patch, provenance: changedBy === 'user' || changedBy === 'vault_sync' ? 'user_confirmed' : undefined }, changedBy);
    if (!memory) return null;
    if (patch.title || patch.content) {
      const vector = await this.embed(`${memory.title}\n${memory.content}`);
      if (vector) await M.upsertEmbedding(this.db, this.user.id, memory.id, this.s.embeddings.model, vector);
    }
    const mirrored = await this.mirror(memory, before.memory.vaultPath);
    await S.audit(this.db, this.user.id, changedBy === 'vault_sync' ? 'system' : changedBy, 'memory.updated', 'memory', id, { version: memory.version });
    return mirrored;
  }

  async delete(id: string, actor: 'user' | 'agent' = 'user'): Promise<boolean> {
    const deleted = await M.deleteMemory(this.db, id);
    if (!deleted) return false;
    try {
      await this.s.vault.deleteMemory(await this.vaultKey(), id, deleted.vaultPath);
    } catch (err) {
      this.s.log.error({ err: (err as Error).message }, 'vault delete failed');
    }
    await S.audit(this.db, this.user.id, actor, 'memory.deleted', 'memory', id);
    return true;
  }

  async search(query: string, limit: number): Promise<MemorySearchHit[]> {
    const [vector, people] = await Promise.all([this.embed(query), M.peopleMentioned(this.db, query)]);
    return M.searchMemories(this.db, query, vector, limit, people.length ? people : null);
  }

  /** Bidirectional sync between DB and the managed vault (see planSync for the rules). */
  async sync(): Promise<{ written: number; imported: number; created: number; conflicts: number; removed: number }> {
    const key = await this.vaultKey();
    const [db, files] = await Promise.all([M.allMemoriesForSync(this.db), this.s.vault.scan(key)]);
    const actions = planSync(db, files);
    const stats = { written: 0, imported: 0, created: 0, conflicts: 0, removed: 0 };
    const byId = new Map(db.map((d) => [d.memory.id, d.memory]));
    for (const a of actions) {
      if (a.kind === 'write') {
        const m = byId.get(a.memoryId)!;
        await this.mirror(m, m.vaultPath);
        stats.written++;
      } else if (a.kind === 'import_edit') {
        await this.update(a.memoryId, { ...(a.title ? { title: a.title } : {}), content: a.content }, 'vault_sync');
        stats.imported++;
      } else if (a.kind === 'conflict') {
        const preserved = await this.s.vault.preserveConflict(key, a.relPath, a.fileText);
        const m = byId.get(a.memoryId)!;
        await this.mirror(m, m.vaultPath);
        await S.audit(this.db, this.user.id, 'system', 'vault.conflict', 'memory', a.memoryId, { preserved });
        stats.conflicts++;
      } else if (a.kind === 'remove_orphan') {
        await this.s.vault.deleteMemory(key, a.id, a.relPath);
        stats.removed++;
      } else if (a.kind === 'import_new') {
        const created = await this.create({ title: a.title ?? 'Nota do Obsidian', content: a.content || a.title || '', type: 'semantic', category: 'personal', tags: a.tags, people: [], source: 'vault', provenance: 'user_confirmed', confidence: 1, originalUtterance: null });
        // the original note is replaced by the managed, id-tagged version
        await this.s.vault.deleteMemory(key, created.id, a.relPath).catch(() => undefined);
        await this.mirror(created, null);
        stats.created++;
      }
    }
    await this.db.query(`update maindy.vaults set last_synced_at = now() where storage_key = $1`, [key]);
    await S.audit(this.db, this.user.id, 'system', 'vault.synced', 'vault', key, stats);
    return stats;
  }

  /** Re-renders a memory to check the vault file matches the DB (used by tests). */
  static renderedHash(m: Memory): string {
    return sha256(serializeMemory(m));
  }
}

let savepointSeq = 0;

/** AgentPort backed by the user's RLS-scoped transaction. */
export class DbAgentPort implements AgentPort {
  private readonly memories: MemoryService;
  private readonly google: GoogleClient;

  constructor(private readonly s: AppServices, private readonly db: Db, private readonly user: RequestUser, private readonly ctx: { timezone: string; conversationId: string | null }) {
    this.memories = new MemoryService(s, db, user);
    this.google = new GoogleClient(s.config.google, (fn) => s.db.withService(fn), s.config.credentialsKey, user.id);
  }

  searchMemories(query: string, limit: number) {
    return this.memories.search(query, limit);
  }
  saveMemory(input: NewMemoryInput) {
    return this.memories.create(input, 'agent');
  }
  async deleteMemory(id: string) {
    if (!(await this.memories.delete(id, 'agent'))) throw new Error('memória não encontrada');
  }
  async getMemory(id: string) {
    return (await M.getMemoryRow(this.db, id))?.memory ?? null;
  }
  createTask(input: Parameters<AgentPort['createTask']>[0]) {
    return P.createTask(this.db, this.user.id, input);
  }
  async completeTask(id: string) {
    const t = await P.updateTask(this.db, id, { status: 'done' });
    if (!t) throw new Error('tarefa não encontrada');
    return t;
  }
  listTasks(status: 'pending' | 'done' | 'all') {
    return P.listTasks(this.db, status);
  }
  createReminder(input: Parameters<AgentPort['createReminder']>[0]) {
    return P.createReminder(this.db, this.user.id, input);
  }
  listReminders(from: string | null, to: string | null) {
    return P.listReminders(this.db, from, to);
  }
  listEvents(from: string, to: string) {
    return P.listEvents(this.db, from, to);
  }
  createEvent(input: Parameters<AgentPort['createEvent']>[0]) {
    return P.createEvent(this.db, this.user.id, input);
  }
  draftEmail(input: { to: string; subject: string; body: string }) {
    return this.google.createDraft(input.to, input.subject, input.body);
  }
  sendEmail(input: { to: string; subject: string; body: string }) {
    return this.google.send(input.to, input.subject, input.body);
  }
  startFocus(mode: Parameters<AgentPort['startFocus']>[0], minutes: number | null) {
    return P.startFocus(this.db, this.user.id, mode, minutes);
  }
  async atomic<T>(fn: () => Promise<T>): Promise<T> {
    const sp = `sp_${++savepointSeq}`;
    await this.db.query(`savepoint ${sp}`);
    try {
      const out = await fn();
      await this.db.query(`release savepoint ${sp}`);
      return out;
    } catch (err) {
      await this.db.query(`rollback to savepoint ${sp}`);
      throw err;
    }
  }
  recordAction(input: PlannedActionInput): Promise<ActionSummary> {
    return S.recordAction(this.db, this.user.id, this.ctx.conversationId, input);
  }
  audit(action: string, targetType: string | null, targetId: string | null, metadata?: Record<string, unknown>) {
    return S.audit(this.db, this.user.id, 'agent', action, targetType, targetId, metadata ?? {});
  }
}

export async function buildAgentContext(db: Db, user: RequestUser, history: AgentContext['history']): Promise<AgentContext> {
  const [profile, agent, settings, grants, connected] = await Promise.all([
    S.getProfile(db),
    S.ensureAgent(db, user.id),
    S.getSettings(db),
    S.listGrants(db),
    S.connectedIntegrations(db),
  ]);
  const { rows: about } = await db.query(`select content from maindy.memories where 'perfil' = any(tags) order by created_at limit 5`);
  return {
    aboutUser: about.map((r) => r.content as string),
    userId: user.id,
    displayName: profile?.displayName ?? null,
    timezone: profile?.timezone ?? 'America/Sao_Paulo',
    agent,
    settings,
    history,
    permissions: { grants, connectedIntegrations: connected, autoSaveMemories: settings.autoSaveMemories },
  };
}

/** Executes a previously confirmed action (status awaiting_confirmation → succeeded/failed). */
export async function executeConfirmedAction(s: AppServices, db: Db, user: RequestUser, actionId: string): Promise<ActionSummary> {
  const action = await S.getAction(db, actionId);
  if (!action) throw Object.assign(new Error('Ação não encontrada'), { statusCode: 404 });
  if (action.status !== 'awaiting_confirmation') throw Object.assign(new Error(`Ação já está em ${action.status}`), { statusCode: 409 });
  if (action.expiresAt && Date.parse(action.expiresAt) < Date.now()) {
    return S.setActionStatus(db, actionId, 'expired');
  }
  const profile = await S.getProfile(db);
  const port = new DbAgentPort(s, db, user, { timezone: profile?.timezone ?? 'America/Sao_Paulo', conversationId: null });
  await S.setActionStatus(db, actionId, 'executing');
  try {
    const { result } = await port.atomic(() => executeTool(action.tool as ToolName, action.input as Record<string, unknown>, port, { timezone: profile?.timezone ?? 'America/Sao_Paulo' }));
    await S.audit(db, user.id, 'user', 'action.confirmed_and_executed', 'action', actionId, { tool: action.tool });
    return S.setActionStatus(db, actionId, 'succeeded', { result });
  } catch (err) {
    await S.audit(db, user.id, 'user', 'action.failed', 'action', actionId, { tool: action.tool, error: (err as Error).message });
    return S.setActionStatus(db, actionId, 'failed', { error: (err as Error).message });
  }
}

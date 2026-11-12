import type { ActionSummary, AgentProfile, AgentSettings, PermissionGrant, PlannedActionInput, UsageInfo } from '@maindy/core';
import type { Db } from '../db.js';

type Row = Record<string, any>;

export const mapAction = (r: Row): ActionSummary => ({
  id: r.id,
  tool: r.tool,
  summary: r.summary,
  autonomyLevel: r.autonomy_level,
  status: r.status,
  requiresConfirmation: r.requires_confirmation,
  result: r.result ?? undefined,
  error: r.error,
});

export const mapAgent = (r: Row): AgentProfile => ({
  id: r.id,
  name: r.name,
  personality: r.personality,
  tone: r.tone,
  language: r.language,
  responseStyle: r.response_style,
  voiceProvider: r.voice_provider,
  voiceId: r.voice_id,
});

export const mapSettings = (r: Row): AgentSettings => ({
  autoSaveMemories: r.auto_save_memories,
  speechRate: Number(r.speech_rate),
  speakResponses: r.speak_responses,
  storeAudio: r.store_audio,
  allowModelTraining: r.allow_model_training,
  forwardNotificationContents: r.forward_notification_contents,
});

export async function getProfile(db: Db): Promise<{ id: string; displayName: string | null; locale: string; timezone: string; role: string; onboardingCompletedAt: string | null } | null> {
  const { rows } = await db.query(`select * from maindy.profiles limit 1`);
  const r = rows[0];
  return r ? { id: r.id, displayName: r.display_name, locale: r.locale, timezone: r.timezone, role: r.role, onboardingCompletedAt: r.onboarding_completed_at } : null;
}

export async function updateProfile(db: Db, userId: string, patch: { displayName?: string; timezone?: string; locale?: string; onboardingCompleted?: boolean }) {
  await db.query(
    `update maindy.profiles set display_name = coalesce($2, display_name), timezone = coalesce($3, timezone), locale = coalesce($4, locale),
       onboarding_completed_at = case when $5 then coalesce(onboarding_completed_at, now()) else onboarding_completed_at end
     where id = $1`,
    [userId, patch.displayName ?? null, patch.timezone ?? null, patch.locale ?? null, patch.onboardingCompleted === true],
  );
}

export async function getAgent(db: Db): Promise<AgentProfile | null> {
  const { rows } = await db.query(`select * from maindy.agents limit 1`);
  return rows[0] ? mapAgent(rows[0]) : null;
}

export async function ensureAgent(db: Db, userId: string): Promise<AgentProfile> {
  await db.query(`insert into maindy.agents (user_id) values ($1) on conflict (user_id) do nothing`, [userId]);
  await db.query(`insert into maindy.agent_settings (user_id) values ($1) on conflict (user_id) do nothing`, [userId]);
  return (await getAgent(db))!;
}

export async function updateAgent(db: Db, patch: Partial<Omit<AgentProfile, 'id'>>): Promise<AgentProfile | null> {
  const { rows } = await db.query(
    `update maindy.agents set name = coalesce($1, name), personality = coalesce($2, personality), tone = coalesce($3, tone),
       language = coalesce($4, language), response_style = coalesce($5, response_style),
       voice_provider = coalesce($6, voice_provider), voice_id = coalesce($7, voice_id)
     returning *`,
    [patch.name ?? null, patch.personality ?? null, patch.tone ?? null, patch.language ?? null, patch.responseStyle ?? null, patch.voiceProvider ?? null, patch.voiceId ?? null],
  );
  return rows[0] ? mapAgent(rows[0]) : null;
}

export async function getSettings(db: Db): Promise<AgentSettings> {
  const { rows } = await db.query(`select * from maindy.agent_settings limit 1`);
  return mapSettings(rows[0] ?? { auto_save_memories: true, speech_rate: 1, speak_responses: true, store_audio: false, allow_model_training: false, forward_notification_contents: false });
}

export async function updateSettings(db: Db, patch: Partial<AgentSettings>): Promise<AgentSettings> {
  const { rows } = await db.query(
    `update maindy.agent_settings set auto_save_memories = coalesce($1, auto_save_memories), speech_rate = coalesce($2, speech_rate),
       speak_responses = coalesce($3, speak_responses), store_audio = coalesce($4, store_audio),
       allow_model_training = coalesce($5, allow_model_training), forward_notification_contents = coalesce($6, forward_notification_contents),
       updated_at = now()
     returning *`,
    [patch.autoSaveMemories ?? null, patch.speechRate ?? null, patch.speakResponses ?? null, patch.storeAudio ?? null, patch.allowModelTraining ?? null, patch.forwardNotificationContents ?? null],
  );
  return mapSettings(rows[0]);
}

export async function listGrants(db: Db): Promise<PermissionGrant[]> {
  const { rows } = await db.query(`select * from maindy.permissions order by created_at desc limit 500`);
  return rows.map((r) => ({ id: r.id, capability: r.capability, integration: r.integration, mode: r.mode, expiresAt: r.expires_at, revokedAt: r.revoked_at, createdAt: r.created_at }));
}

export async function createGrant(db: Db, userId: string, g: { capability: string; integration: string | null; mode: string; expiresAt: string | null }): Promise<PermissionGrant> {
  const { rows } = await db.query(
    `insert into maindy.permissions (user_id, capability, integration, mode, expires_at) values ($1,$2,$3,$4,$5) returning *`,
    [userId, g.capability, g.integration, g.mode, g.expiresAt],
  );
  const r = rows[0];
  return { id: r.id, capability: r.capability, integration: r.integration, mode: r.mode, expiresAt: r.expires_at, revokedAt: r.revoked_at, createdAt: r.created_at };
}

export async function revokeGrant(db: Db, id: string): Promise<boolean> {
  const { rowCount } = await db.query(`update maindy.permissions set revoked_at = now() where id = $1 and revoked_at is null`, [id]);
  return (rowCount ?? 0) > 0;
}

export async function connectedIntegrations(db: Db): Promise<string[]> {
  const { rows } = await db.query(`select provider from maindy.integrations where status = 'connected'`);
  const providers = rows.map((r) => r.provider as string);
  // Gmail and Google Calendar share one Google OAuth grant
  if (providers.includes('google')) providers.push('gmail', 'google_calendar');
  return providers;
}

export async function recordAction(db: Db, userId: string, conversationId: string | null, a: PlannedActionInput): Promise<ActionSummary> {
  const { rows } = await db.query(
    `insert into maindy.action_executions (user_id, conversation_id, tool, input, autonomy_level, status, requires_confirmation, summary, result, error, expires_at, executed_at)
     values ($1,$2,$3,$4,$5,$6::maindy.action_status,$7,$8,$9,$10,
             case when $6::text = 'awaiting_confirmation' then now() + interval '24 hours' end,
             case when $6::text in ('succeeded','failed') then now() end)
     returning *`,
    [userId, conversationId, a.tool, JSON.stringify(a.input ?? {}), a.autonomyLevel, a.status, a.requiresConfirmation, a.summary, a.result === undefined ? null : JSON.stringify(a.result), a.error ?? null],
  );
  return mapAction(rows[0]);
}

export async function getAction(db: Db, id: string): Promise<(ActionSummary & { input: unknown; expiresAt: string | null }) | null> {
  const { rows } = await db.query(`select * from maindy.action_executions where id = $1`, [id]);
  return rows[0] ? { ...mapAction(rows[0]), input: rows[0].input, expiresAt: rows[0].expires_at } : null;
}

export async function listActions(db: Db, status: string | null): Promise<ActionSummary[]> {
  const { rows } = await db.query(
    `select * from maindy.action_executions where ($1::text is null or status::text = $1) order by created_at desc limit 100`,
    [status],
  );
  return rows.map(mapAction);
}

export async function setActionStatus(db: Db, id: string, status: ActionSummary['status'], extra: { result?: unknown; error?: string | null } = {}): Promise<ActionSummary> {
  const { rows } = await db.query(
    `update maindy.action_executions set status = $2::maindy.action_status, result = coalesce($3::jsonb, result), error = $4,
       confirmed_at = case when $2::text in ('executing','succeeded','failed') and confirmed_at is null and requires_confirmation then now() else confirmed_at end,
       executed_at = case when $2::text in ('succeeded','failed') then now() else executed_at end
     where id = $1 returning *`,
    [id, status, extra.result === undefined ? null : JSON.stringify(extra.result), extra.error ?? null],
  );
  return mapAction(rows[0]);
}

export async function audit(db: Db, userId: string, actor: 'user' | 'agent' | 'system', action: string, targetType: string | null, targetId: string | null, metadata: Record<string, unknown> = {}): Promise<void> {
  await db.query(`insert into maindy.audit_logs (user_id, actor, action, target_type, target_id, metadata) values ($1,$2,$3,$4,$5,$6)`, [
    userId,
    actor,
    action,
    targetType,
    targetId,
    JSON.stringify(metadata),
  ]);
}

export async function listAudit(db: Db, limit: number) {
  const { rows } = await db.query(`select id, actor, action, target_type, target_id, metadata, created_at from maindy.audit_logs order by id desc limit $1`, [limit]);
  return rows.map((r) => ({ id: r.id, actor: r.actor, action: r.action, targetType: r.target_type, targetId: r.target_id, metadata: r.metadata, createdAt: r.created_at }));
}

export async function recordUsage(db: Db, userId: string, provider: string, operation: string, usage: UsageInfo[]): Promise<void> {
  for (const u of usage) {
    await db.query(
      `insert into maindy.usage_records (user_id, provider, model, operation, input_tokens, output_tokens, cache_read_tokens, cost_usd) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [userId, provider, u.model, operation, u.inputTokens, u.outputTokens, u.cacheReadTokens, u.costUsd],
    );
  }
}

export async function ensureConversation(db: Db, userId: string, conversationId: string | null): Promise<string> {
  if (conversationId) {
    const { rows } = await db.query(`select id from maindy.conversations where id = $1`, [conversationId]);
    if (rows[0]) return rows[0].id;
  }
  const { rows } = await db.query(`insert into maindy.conversations (user_id) values ($1) returning id`, [userId]);
  return rows[0].id;
}

export async function conversationHistory(db: Db, conversationId: string, limit = 12): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const { rows } = await db.query(
    `select role, content from (select role, content, created_at from maindy.conversation_messages where conversation_id = $1 order by created_at desc limit $2) t order by created_at`,
    [conversationId, limit],
  );
  return rows.map((r) => ({ role: r.role, content: r.content }));
}

export async function addMessage(db: Db, userId: string, conversationId: string, m: { role: 'user' | 'assistant'; content: string; inputMode?: 'text' | 'voice' | null; memoryRefs?: string[]; actionRefs?: string[]; provider?: string | null }): Promise<string> {
  const { rows } = await db.query(
    `insert into maindy.conversation_messages (conversation_id, user_id, role, content, input_mode, memory_refs, action_refs, provider) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [conversationId, userId, m.role, m.content, m.inputMode ?? null, m.memoryRefs ?? [], m.actionRefs ?? [], m.provider ?? null],
  );
  await db.query(`update maindy.conversations set updated_at = now(), title = coalesce(title, left($2, 80)) where id = $1`, [conversationId, m.role === 'user' ? m.content : null]);
  return rows[0].id;
}

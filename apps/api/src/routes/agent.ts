import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ToolExecutor, capabilityOf, evaluatePermission, summarizeAction, toolSchemas, type ChatResponse, type ToolName, type VoiceProvider } from '@maindy/core';
import { HttpError, asUser, idParams, idempotent, parse } from '../http.js';
import { DbAgentPort, buildAgentContext, executeConfirmedAction, type AppServices, type RequestUser } from '../services.js';
import type { Db } from '../db.js';
import * as S from '../repo/system.js';

const chatBody = z.object({
  message: z.string().trim().min(1).max(4000),
  conversationId: z.string().uuid().nullish(),
  inputMode: z.enum(['text', 'voice']).default('text'),
});

async function runChat(s: AppServices, db: Db, user: RequestUser, body: z.infer<typeof chatBody>): Promise<ChatResponse> {
  const conversationId = await S.ensureConversation(db, user.id, body.conversationId ?? null);
  const history = await S.conversationHistory(db, conversationId, 12);
  const ctx = await buildAgentContext(db, user, history);
  const port = new DbAgentPort(s, db, user, { timezone: ctx.timezone, conversationId });
  await S.addMessage(db, user.id, conversationId, { role: 'user', content: body.message, inputMode: body.inputMode });
  const result = await s.orchestrator.handle({ text: body.message, inputMode: body.inputMode }, ctx, port);
  if (result.usage.length) await S.recordUsage(db, user.id, 'anthropic', 'agent.chat', result.usage);
  if (result.degradedReason) s.log.warn({ reason: result.degradedReason }, 'agent answered in offline mode');
  const messageId = await S.addMessage(db, user.id, conversationId, {
    role: 'assistant',
    content: result.reply,
    memoryRefs: result.memoryRefs.map((m) => m.id),
    actionRefs: result.actions.map((a) => a.id),
    provider: result.mode === 'claude' ? s.ai.modelId : 'offline',
  });
  return {
    conversationId,
    messageId,
    reply: result.reply,
    memoryRefs: result.memoryRefs.map((m) => ({ id: m.id, title: m.title, provenance: m.provenance, source: m.source, createdAt: m.createdAt })),
    actions: result.actions,
    suggestions: result.suggestions,
    mode: result.mode,
    intent: result.intent,
  };
}

async function pickVoice(s: AppServices, preferred: string): Promise<VoiceProvider> {
  const p = await s.voice.firstAvailable(preferred);
  if (!p) throw new HttpError(503, 'Nenhum provedor de voz disponível. Abra o VoiceStudio ou configure ElevenLabs/OpenAI.', 'voice_unavailable');
  return p;
}

export async function agentRoutes(app: FastifyInstance, s: AppServices) {
  const agentLimit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

  app.post('/v1/agent/chat', { ...agentLimit, schema: { tags: ['agent'], summary: 'Conversa por texto com o agente (memória + ferramentas)' } }, async (req, reply) => {
    const body = parse(chatBody, req.body);
    return idempotent(s, req, reply, 200, (db, user) => runChat(s, db, user, body));
  });

  /** multipart: field `audio` (m4a/wav/webm), optional `conversationId`, `speak` ("true"/"false") */
  app.post('/v1/agent/voice', { ...agentLimit, schema: { tags: ['agent'], summary: 'Conversa por voz: transcreve, responde e sintetiza (áudio não é armazenado)' } }, async (req) => {
    const parts = req.parts();
    let audio: Buffer | null = null;
    let mimeType = 'audio/m4a';
    let fileName = 'audio.m4a';
    const fields: Record<string, string> = {};
    for await (const part of parts) {
      if (part.type === 'file') {
        audio = await part.toBuffer();
        mimeType = part.mimetype;
        fileName = part.filename || fileName;
      } else fields[part.fieldname] = String(part.value);
    }
    if (!audio || audio.length < 200) throw new HttpError(400, 'Áudio ausente ou vazio');

    const user = req.user!;
    const agent = await asUser(s, req, async (db) => S.ensureAgent(db, user.id));
    const settings = await asUser(s, req, async (db) => S.getSettings(db));
    // 'device' = the phone speaks the reply itself (instant); the server only transcribes
    const deviceVoice = agent.voiceProvider === 'device';
    const provider = await pickVoice(s, deviceVoice ? 'voicestudio' : agent.voiceProvider);
    const t0 = Date.now();
    const transcript = await provider.transcribe({ audio: new Uint8Array(audio), mimeType, fileName, language: agent.language });
    audio = null; // never persisted
    if (!transcript.text) throw new HttpError(422, 'Não consegui entender o áudio', 'empty_transcript');
    const sttMs = Date.now() - t0;

    const chat = await asUser(s, req, (db, u) => runChat(s, db, u, { message: transcript.text, conversationId: fields.conversationId || null, inputMode: 'voice' }));
    let speech: { audioBase64: string; mimeType: string; provider: string } | null = null;
    if (!deviceVoice && fields.speak !== 'false' && settings.speakResponses) {
      try {
        const out = await provider.synthesize({ text: chat.reply, voiceId: agent.voiceId ?? 'alloy', language: agent.language, speed: settings.speechRate });
        speech = { audioBase64: Buffer.from(out.audio).toString('base64'), mimeType: out.mimeType, provider: provider.id };
      } catch (err) {
        s.log.warn({ err: (err as Error).message }, 'speech synthesis failed');
      }
    }
    return { transcript: transcript.text, transcriptionProvider: provider.id, sttMs, ...chat, speech };
  });

  app.get('/v1/agent/conversations', { schema: { tags: ['agent'] } }, async (req) =>
    asUser(s, req, async (db) => {
      const { rows } = await db.query(`select id, title, updated_at from maindy.conversations order by updated_at desc limit 50`);
      return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at }));
    }),
  );

  app.get('/v1/agent/conversations/:id/messages', { schema: { tags: ['agent'] } }, async (req) => {
    const { id } = parse(idParams, req.params);
    return asUser(s, req, async (db) => {
      const { rows } = await db.query(`select id, role, content, input_mode, memory_refs, action_refs, created_at from maindy.conversation_messages where conversation_id = $1 order by created_at limit 500`, [id]);
      return rows.map((r) => ({ id: r.id, role: r.role, content: r.content, inputMode: r.input_mode, memoryRefs: r.memory_refs, actionRefs: r.action_refs, createdAt: r.created_at }));
    });
  });

  // ── actions (plan / execute / confirm) ──
  const planBody = z.object({ tool: z.string(), input: z.record(z.string(), z.unknown()) });

  app.post('/v1/actions/plan', { schema: { tags: ['actions'], summary: 'Avalia uma ação na Permission Engine sem executá-la' } }, async (req) => {
    const body = parse(planBody, req.body);
    return asUser(s, req, async (db, user) => {
      const ctx = await buildAgentContext(db, user, []);
      if (!(body.tool in toolSchemas)) throw new HttpError(400, 'Ferramenta desconhecida');
      const parsed = (toolSchemas as Record<string, z.ZodType>)[body.tool]!.safeParse(body.input);
      if (!parsed.success) throw new HttpError(400, 'Entrada inválida para a ferramenta');
      const decision = evaluatePermission(capabilityOf(body.tool as ToolName), ctx.permissions);
      return { decision, summary: summarizeAction(body.tool as never, body.input, ctx.timezone) };
    });
  });

  app.post('/v1/actions/execute', { schema: { tags: ['actions'], summary: 'Executa uma ação pelo mesmo caminho do agente (permissões aplicadas)' } }, async (req, reply) => {
    const body = parse(planBody, req.body);
    return idempotent(s, req, reply, 200, async (db, user) => {
      const ctx = await buildAgentContext(db, user, []);
      const port = new DbAgentPort(s, db, user, { timezone: ctx.timezone, conversationId: null });
      const exec = new ToolExecutor(port, ctx);
      const r = await exec.run(body.tool, body.input);
      if (r.isError && !r.action) throw new HttpError(r.content.startsWith('NEGADO') ? 403 : 400, r.content);
      return { action: r.action, output: r.isError ? null : r.content };
    });
  });

  app.get('/v1/actions', { schema: { tags: ['actions'] } }, async (req) => {
    const q = parse(z.object({ status: z.string().optional() }), req.query);
    return asUser(s, req, (db) => S.listActions(db, q.status ?? null));
  });

  app.post('/v1/actions/:id/confirm', { schema: { tags: ['actions'], summary: 'Confirma (ou rejeita) uma ação pendente' } }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    const body = parse(z.object({ approve: z.boolean().default(true) }), req.body ?? {});
    return idempotent(s, req, reply, 200, async (db, user) => {
      if (!body.approve) {
        const a = await S.getAction(db, id);
        if (!a) throw new HttpError(404, 'Ação não encontrada');
        if (a.status !== 'awaiting_confirmation') throw new HttpError(409, `Ação já está em ${a.status}`);
        await S.audit(db, user.id, 'user', 'action.rejected', 'action', id, { tool: a.tool });
        return S.setActionStatus(db, id, 'rejected');
      }
      return executeConfirmedAction(s, db, user, id);
    });
  });
}

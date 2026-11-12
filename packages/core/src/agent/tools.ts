import { z } from 'zod';
import { CATEGORIES, FOCUS_MODES, MEMORY_TYPES, type ActionSummary, type Memory } from '../contracts/index.js';
import { evaluatePermission, getCapability } from '../permissions/engine.js';
import type { ToolSpec } from '../ai/provider.js';
import { parseRRule } from '../time/rrule.js';
import { formatPtBr } from '../time/zoned.js';
import type { AgentContext, AgentPort } from './port.js';
import { IntegrationUnavailableError } from './port.js';

/**
 * Typed tool contracts. Each tool: strict zod schema (validated before execution),
 * capability (→ Permission Engine), human summary for confirmations, and an executor
 * that only calls the AgentPort. Optional fields are nullable so the JSON schema
 * satisfies Claude's strict tool mode (every property required, no extras).
 */

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'must be an ISO-8601 date-time');

export const toolSchemas = {
  search_memories: z.strictObject({
    query: z.string().min(1).max(500),
    limit: z.number().int().min(1).max(20).nullable(),
  }),
  save_memory: z.strictObject({
    title: z.string().min(1).max(140),
    content: z.string().min(1).max(4000),
    type: z.enum(MEMORY_TYPES),
    category: z.enum(CATEGORIES),
    tags: z.array(z.string().max(40)).max(10),
    people: z.array(z.strictObject({ name: z.string().min(1).max(80), relation: z.string().max(40).nullable() })).max(10),
    provenance: z.enum(['user_confirmed', 'ai_inferred']),
    original_utterance: z.string().max(4000).nullable(),
  }),
  delete_memory: z.strictObject({ memory_id: z.string().uuid() }),
  create_task: z.strictObject({
    title: z.string().min(1).max(200),
    notes: z.string().max(2000).nullable(),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
    due_at: isoDate.nullable(),
  }),
  complete_task: z.strictObject({ task_id: z.string().uuid() }),
  list_tasks: z.strictObject({ status: z.enum(['pending', 'done', 'all']) }),
  create_reminder: z.strictObject({
    title: z.string().min(1).max(200),
    body: z.string().max(1000).nullable(),
    remind_at: isoDate,
    recurrence_rule: z.string().max(200).nullable(),
  }),
  list_reminders: z.strictObject({ from: isoDate.nullable(), to: isoDate.nullable() }),
  list_calendar_events: z.strictObject({ from: isoDate, to: isoDate }),
  create_calendar_event: z.strictObject({
    title: z.string().min(1).max(200),
    starts_at: isoDate,
    ends_at: isoDate,
    location: z.string().max(300).nullable(),
    description: z.string().max(2000).nullable(),
    recurrence_rule: z.string().max(200).nullable(),
  }),
  draft_email: z.strictObject({ to: z.string().email(), subject: z.string().min(1).max(300), body: z.string().min(1).max(20000) }),
  send_email: z.strictObject({ to: z.string().email(), subject: z.string().min(1).max(300), body: z.string().min(1).max(20000) }),
  start_focus: z.strictObject({ mode: z.enum(FOCUS_MODES.filter((m) => m !== 'off') as ['work', 'study', 'rest', 'sleep', 'driving']), minutes: z.number().int().min(5).max(600).nullable() }),
} as const;

export type ToolName = keyof typeof toolSchemas;

const TOOL_META: Record<ToolName, { capability: string; description: string }> = {
  search_memories: { capability: 'memory.search', description: 'Busca nas memórias do usuário (busca híbrida: texto + semântica + pessoas). Use antes de responder qualquer pergunta sobre o passado, preferências, pessoas, lugares ou combinados.' },
  save_memory: { capability: 'memory.save', description: 'Salva uma informação que o usuário quer lembrar (fato, preferência de alguém, onde deixou algo, combinado). Use somente o que o usuário disse; provenance=user_confirmed quando ele afirmou diretamente, ai_inferred quando você deduziu.' },
  delete_memory: { capability: 'memory.delete', description: 'Apaga uma memória. Sempre exige confirmação do usuário no app.' },
  create_task: { capability: 'task.create', description: 'Cria uma tarefa pendente. due_at em ISO-8601 com fuso.' },
  complete_task: { capability: 'task.complete', description: 'Marca uma tarefa como concluída (use list_tasks para obter o id).' },
  list_tasks: { capability: 'tasks.read', description: 'Lista tarefas do usuário.' },
  create_reminder: { capability: 'reminder.create', description: 'Cria um lembrete com notificação. remind_at em ISO-8601 com fuso, no futuro. recurrence_rule no formato RRULE (FREQ=DAILY|WEEKLY|MONTHLY|YEARLY;INTERVAL=n;BYDAY=MO,...) ou null.' },
  list_reminders: { capability: 'tasks.read', description: 'Lista lembretes num intervalo (ISO-8601) ou todos os próximos.' },
  list_calendar_events: { capability: 'calendar.read', description: 'Lista eventos da agenda entre duas datas ISO-8601.' },
  create_calendar_event: { capability: 'calendar.create', description: 'Cria um evento na agenda. Pode exigir confirmação do usuário.' },
  draft_email: { capability: 'email.draft', description: 'Cria um rascunho de e-mail no Gmail do usuário (não envia).' },
  send_email: { capability: 'email.send', description: 'Envia um e-mail pelo Gmail do usuário. Exige confirmação por padrão.' },
  start_focus: { capability: 'focus.start', description: 'Ativa um modo de foco (work, study, rest, sleep, driving) por N minutos.' },
};

export function capabilityOf(tool: ToolName): string {
  return TOOL_META[tool].capability;
}

export function toolSpecs(): ToolSpec[] {
  return (Object.keys(toolSchemas) as ToolName[]).map((name) => {
    const schema = z.toJSONSchema(toolSchemas[name], { target: 'draft-7', io: 'input' }) as Record<string, unknown>;
    delete schema.$schema;
    return { name, description: TOOL_META[name].description, inputSchema: schema };
  });
}

export function summarizeAction(tool: ToolName, input: Record<string, unknown>, tz: string): string {
  const when = (iso: unknown) => (typeof iso === 'string' ? formatPtBr(new Date(iso), tz) : '');
  switch (tool) {
    case 'save_memory':
      return `Salvar memória: “${String(input.title)}”`;
    case 'delete_memory':
      return 'Apagar uma memória';
    case 'create_task':
      return `Criar tarefa: “${String(input.title)}”${input.due_at ? ` para ${when(input.due_at)}` : ''}`;
    case 'complete_task':
      return 'Concluir tarefa';
    case 'create_reminder':
      return `Lembrete: “${String(input.title)}” em ${when(input.remind_at)}`;
    case 'create_calendar_event':
      return `Criar evento “${String(input.title)}” em ${when(input.starts_at)}`;
    case 'draft_email':
      return `Rascunho de e-mail para ${String(input.to)}: “${String(input.subject)}”`;
    case 'send_email':
      return `Enviar e-mail para ${String(input.to)}: “${String(input.subject)}”`;
    case 'start_focus':
      return `Ativar modo de foco (${String(input.mode)})${input.minutes ? ` por ${input.minutes} min` : ''}`;
    default:
      return tool;
  }
}

export interface ToolRunResult {
  /** text returned to the model */
  content: string;
  isError: boolean;
  action: ActionSummary | null;
  memories: Memory[];
}

/** Validates, authorizes and executes one tool call. */
export class ToolExecutor {
  readonly actions: ActionSummary[] = [];
  readonly touchedMemories = new Map<string, Memory>();

  constructor(private readonly port: AgentPort, private readonly ctx: AgentContext, private readonly now: () => Date = () => new Date()) {}

  async run(name: string, rawInput: unknown): Promise<ToolRunResult> {
    if (!(name in toolSchemas)) return this.fail(`Ferramenta desconhecida: ${name}`);
    const tool = name as ToolName;
    const parsed = toolSchemas[tool].safeParse(rawInput);
    if (!parsed.success) return this.fail(`Entrada inválida para ${tool}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    const input = parsed.data as Record<string, unknown>;

    // result validation that schemas cannot express
    const semanticError = this.validateSemantics(tool, input);
    if (semanticError) return this.fail(semanticError);

    const meta = TOOL_META[tool];
    const decision = evaluatePermission(meta.capability, this.ctx.permissions);
    const level = getCapability(meta.capability).level;
    const summary = summarizeAction(tool, input, this.ctx.timezone);
    const isRead = level === 0;

    if (decision.mode === 'deny') {
      const reason = decision.reason.startsWith('integration_not_connected')
        ? `A integração ${decision.reason.split(':')[1]} não está conectada. Peça ao usuário para conectá-la em Ajustes > Integrações.`
        : 'O usuário não autorizou esta ação.';
      let action: ActionSummary | null = null;
      if (!isRead) {
        action = await this.port.recordAction({ tool, input, autonomyLevel: level, summary, requiresConfirmation: false, status: 'rejected', error: decision.reason });
        this.actions.push(action);
      }
      return { content: `NEGADO: ${reason} Não diga que a ação foi feita.`, isError: true, action, memories: [] };
    }

    if (decision.mode === 'confirm') {
      const action = await this.port.recordAction({ tool, input, autonomyLevel: level, summary, requiresConfirmation: true, status: 'awaiting_confirmation' });
      this.actions.push(action);
      return {
        content: `AGUARDANDO_CONFIRMACAO: a ação "${summary}" foi preparada (id ${action.id}) e só será executada depois que o usuário confirmar no app. Diga isso ao usuário; não diga que já foi feita.`,
        isError: false,
        action,
        memories: [],
      };
    }

    try {
      const { content, memories, result } = await this.port.atomic(() => executeTool(tool, input, this.port, this.ctx, this.now));
      for (const m of memories) this.touchedMemories.set(m.id, m);
      let action: ActionSummary | null = null;
      if (!isRead) {
        action = await this.port.recordAction({ tool, input, autonomyLevel: level, summary, requiresConfirmation: false, status: 'succeeded', result });
        this.actions.push(action);
      }
      return { content, isError: false, action, memories };
    } catch (err) {
      const message = err instanceof IntegrationUnavailableError ? `A integração ${err.integration} não está disponível: ${err.message}` : (err as Error).message;
      if (!isRead) {
        const action = await this.port.recordAction({ tool, input, autonomyLevel: level, summary, requiresConfirmation: false, status: 'failed', error: message });
        this.actions.push(action);
      }
      return this.fail(`FALHOU: ${message}. Não diga que a ação foi feita.`);
    }
  }

  private validateSemantics(tool: ToolName, input: Record<string, unknown>): string | null {
    const now = this.now().getTime();
    if (tool === 'create_reminder') {
      if (Date.parse(String(input.remind_at)) < now - 60_000) return 'remind_at está no passado; pergunte ao usuário o horário correto.';
      if (input.recurrence_rule) {
        try {
          parseRRule(String(input.recurrence_rule));
        } catch (e) {
          return `recurrence_rule inválida: ${(e as Error).message}`;
        }
      }
    }
    if (tool === 'create_calendar_event' && Date.parse(String(input.ends_at)) < Date.parse(String(input.starts_at))) {
      return 'ends_at deve ser depois de starts_at.';
    }
    return null;
  }

  private fail(content: string): ToolRunResult {
    return { content, isError: true, action: null, memories: [] };
  }
}

/** Executes an already-authorized tool (also used when the user confirms a pending action). */
export async function executeTool(
  tool: ToolName,
  input: Record<string, unknown>,
  port: AgentPort,
  ctx: Pick<AgentContext, 'timezone'>,
  now: () => Date = () => new Date(),
): Promise<{ content: string; memories: Memory[]; result: unknown }> {
  const i = input as never as Record<string, any>;
  switch (tool) {
    case 'search_memories': {
      const hits = await port.searchMemories(i.query, i.limit ?? 6);
      const memories = hits.map((h) => h.memory);
      const content = hits.length
        ? JSON.stringify(hits.map((h) => ({ id: h.memory.id, title: h.memory.title, content: h.memory.content, provenance: h.memory.provenance, source: h.memory.source, recorded_at: h.memory.createdAt, people: h.memory.people.map((p) => p.name), score: Number(h.score.toFixed(3)) })))
        : 'Nenhuma memória encontrada.';
      return { content: `<search_results untrusted="true">${content}</search_results>`, memories, result: { count: hits.length } };
    }
    case 'save_memory': {
      const memory = await port.saveMemory({
        title: i.title,
        content: i.content,
        type: i.type,
        category: i.category,
        tags: i.tags,
        people: i.people,
        source: 'agent',
        provenance: i.provenance,
        confidence: i.provenance === 'user_confirmed' ? 0.95 : 0.6,
        originalUtterance: i.original_utterance,
      });
      return { content: JSON.stringify({ saved: true, id: memory.id, vault_path: memory.vaultPath }), memories: [memory], result: { memoryId: memory.id } };
    }
    case 'delete_memory': {
      await port.deleteMemory(i.memory_id);
      return { content: JSON.stringify({ deleted: true }), memories: [], result: { memoryId: i.memory_id } };
    }
    case 'create_task': {
      const task = await port.createTask({ title: i.title, notes: i.notes, priority: i.priority ?? 2, dueAt: i.due_at });
      return { content: JSON.stringify({ created: true, id: task.id }), memories: [], result: { taskId: task.id } };
    }
    case 'complete_task': {
      const task = await port.completeTask(i.task_id);
      return { content: JSON.stringify({ completed: true, id: task.id, title: task.title }), memories: [], result: { taskId: task.id } };
    }
    case 'list_tasks': {
      const tasks = await port.listTasks(i.status);
      return { content: `<tasks untrusted="true">${JSON.stringify(tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, due_at: t.dueAt })))}</tasks>`, memories: [], result: null };
    }
    case 'create_reminder': {
      const r = await port.createReminder({ title: i.title, body: i.body, remindAt: new Date(i.remind_at).toISOString(), timezone: ctx.timezone, recurrenceRule: i.recurrence_rule });
      return { content: JSON.stringify({ created: true, id: r.id, remind_at_local: formatPtBr(new Date(r.remindAt), ctx.timezone) }), memories: [], result: { reminderId: r.id } };
    }
    case 'list_reminders': {
      const rs = await port.listReminders(i.from ?? now().toISOString(), i.to);
      return { content: `<reminders untrusted="true">${JSON.stringify(rs.map((r) => ({ id: r.id, title: r.title, remind_at_local: formatPtBr(new Date(r.remindAt), ctx.timezone), status: r.status })))}</reminders>`, memories: [], result: null };
    }
    case 'list_calendar_events': {
      const evs = await port.listEvents(i.from, i.to);
      return { content: `<events untrusted="true">${JSON.stringify(evs.map((e) => ({ id: e.id, title: e.title, starts_local: formatPtBr(new Date(e.startsAt), ctx.timezone), location: e.location })))}</events>`, memories: [], result: null };
    }
    case 'create_calendar_event': {
      const ev = await port.createEvent({ title: i.title, description: i.description, location: i.location, startsAt: new Date(i.starts_at).toISOString(), endsAt: new Date(i.ends_at).toISOString(), timezone: ctx.timezone, recurrenceRule: i.recurrence_rule });
      return { content: JSON.stringify({ created: true, id: ev.id }), memories: [], result: { eventId: ev.id } };
    }
    case 'draft_email': {
      const d = await port.draftEmail({ to: i.to, subject: i.subject, body: i.body });
      return { content: JSON.stringify({ drafted: true, draft_id: d.draftId }), memories: [], result: d };
    }
    case 'send_email': {
      const s = await port.sendEmail({ to: i.to, subject: i.subject, body: i.body });
      return { content: JSON.stringify({ sent: true, message_id: s.messageId }), memories: [], result: s };
    }
    case 'start_focus': {
      const f = await port.startFocus(i.mode, i.minutes);
      return { content: JSON.stringify({ started: true, ends_at: f.endsAt }), memories: [], result: f };
    }
  }
}

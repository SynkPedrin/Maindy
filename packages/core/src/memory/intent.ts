/**
 * Deterministic pt-BR intent classifier. It is the fast path for routing and the
 * whole planner when Claude is unavailable (offline mode). It never answers on its
 * own; it only decides which typed tool flow applies.
 */

export type Intent =
  | 'save_memory'
  | 'recall'
  | 'physical_check'
  | 'create_reminder'
  | 'create_task'
  | 'complete_task'
  | 'tasks_query'
  | 'calendar_query'
  | 'calendar_create'
  | 'draft_email'
  | 'focus'
  | 'delete_memory'
  | 'smalltalk';

export interface IntentResult {
  intent: Intent;
  confidence: number;
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const PHYSICAL_VERBS =
  /\b(tranquei|fechei|desliguei|liguei|lavei|tomei|tirei|guardei|apaguei|trancou|fechou|desligou|lavou|tomou|tirei)\b/;

/**
 * Removes a leading address to the assistant ("Nico, …", "Ei Nico …", "Ok MAINDY: …") so the rest
 * of the sentence is classified/extracted on its own. Accent- and case-insensitive.
 */
export function stripAssistantAddress(raw: string, names: string[]): string {
  const text = raw.normalize('NFC').trim();
  const norm = normalizeText(text);
  for (const name of [...new Set(names.map((n) => normalizeText(n)).filter(Boolean))]) {
    const m = norm.match(new RegExp(`^(?:(?:ei|oi|ola|ok|hey|e ai)[,!]?\\s+)?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s,!.:;?-]|$)[\\s,!.:;-]*`));
    if (m) {
      // normalizeText keeps 1:1 length for pt-BR letters, so the matched length maps back onto `text`
      const rest = text.slice(m[0].length).trim();
      return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : text;
    }
  }
  return text;
}

export function classifyIntent(raw: string): IntentResult {
  const t = normalizeText(raw);
  const isQuestion =
    raw.trim().endsWith('?') ||
    /^(qual|quais|quando|onde|quem|o que|oque|como|sera que|por que|porque|quanto|quantos|quantas|cade|lembra|voce lembra|eu ja|ja)\b/.test(t);

  if (/\b(apag|exclu|delet|remov)\w*\b.*\b(memoria|lembranca|anotacao|nota)/.test(t)) {
    return { intent: 'delete_memory', confidence: 0.85 };
  }
  if (/\b(me lembr|lembre-me|lembra-me|me avis|cria(r)? (um )?lembrete|lembrete (para|pra|de)|me cobr)/.test(t)) {
    return { intent: 'create_reminder', confidence: 0.9 };
  }
  if (/\b(e-?mail)\b/.test(t) && /\b(escrev|rascunh|redig|prepar|mand|envi|respond)/.test(t)) {
    return { intent: 'draft_email', confidence: 0.85 };
  }
  if (/\b(modo (foco|estudo|trabalho|descanso|sono|direcao|dirigindo)|me ajud\w* a (focar|concentrar)|quero focar|ativ\w* (o )?foco)\b/.test(t)) {
    return { intent: 'focus', confidence: 0.85 };
  }
  if (/\b(marc\w*|agend\w*|cri\w*) (uma |um )?(reuniao|evento|consulta|compromisso)\b/.test(t)) {
    return { intent: 'calendar_create', confidence: 0.8 };
  }
  if (/\b(conclu|termin|finaliz)\w* (a )?tarefa|\bja (fiz|terminei|conclui)\b|marc\w* (como )?(feita|concluida)/.test(t)) {
    return { intent: 'complete_task', confidence: 0.75 };
  }
  if (isQuestion && PHYSICAL_VERBS.test(t)) return { intent: 'physical_check', confidence: 0.85 };
  if (isQuestion && /\b(agenda|compromisso|reuni|evento|calendario)/.test(t)) {
    return { intent: 'calendar_query', confidence: 0.8 };
  }
  if (/\b(o que (eu )?(tenho|preciso) (pra |para )?(fazer|hoje|amanha))|\b(minhas tarefas|tarefas pendentes|o que (falta|esta pendente)|prioridade|priorizar)\b/.test(t)) {
    return { intent: 'tasks_query', confidence: 0.8 };
  }
  if (/\b(preciso|tenho que|tenho de|devo|anota (uma )?tarefa|adicion\w* (uma )?tarefa|cria(r)? (uma )?tarefa|to-?do)\b/.test(t) && !isQuestion) {
    return { intent: 'create_task', confidence: 0.75 };
  }
  if (/^(oi|ola|bom dia|boa tarde|boa noite|obrigad|valeu|tudo bem|e ai)\b/.test(t) && t.split(' ').length <= 6) {
    return { intent: 'smalltalk', confidence: 0.8 };
  }
  if (isQuestion) return { intent: 'recall', confidence: 0.7 };
  // declarative statement with content → it is information to remember
  if (t.split(' ').length >= 3) return { intent: 'save_memory', confidence: 0.65 };
  return { intent: 'smalltalk', confidence: 0.4 };
}

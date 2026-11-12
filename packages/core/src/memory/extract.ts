import type { Category, MemoryType, Provenance } from '../contracts/index.js';
import { normalizeText } from './intent.js';

/**
 * Deterministic pt-BR memory extraction. Claude does richer extraction when it is
 * configured; this extractor is used offline and as a safety net. It only uses
 * what the user literally said — it never adds facts.
 */

export interface ExtractedPerson {
  name: string;
  relation: string | null;
}

export interface ExtractedMemory {
  type: MemoryType;
  category: Category;
  title: string;
  content: string;
  tags: string[];
  people: ExtractedPerson[];
  provenance: Provenance;
  confidence: number;
}

const RELATIONS: Array<[RegExp, string, string]> = [
  // [pattern, canonical relation, display name]
  [/\bminha mae\b|\bmamae\b/, 'mãe', 'Mãe'],
  [/\bmeu pai\b|\bpapai\b/, 'pai', 'Pai'],
  [/\bminha irma\b/, 'irmã', 'Irmã'],
  [/\bmeu irmao\b/, 'irmão', 'Irmão'],
  [/\bminha avo\b/, 'avó', 'Avó'],
  [/\bmeu avo\b/, 'avô', 'Avô'],
  [/\bminha esposa\b|\bminha mulher\b/, 'esposa', 'Esposa'],
  [/\bmeu marido\b/, 'marido', 'Marido'],
  [/\bminha namorada\b/, 'namorada', 'Namorada'],
  [/\bmeu namorado\b/, 'namorado', 'Namorado'],
  [/\bminha filha\b/, 'filha', 'Filha'],
  [/\bmeu filho\b/, 'filho', 'Filho'],
  [/\bminha chefe\b|\bmeu chefe\b/, 'chefe', 'Chefe'],
  [/\bminha tia\b/, 'tia', 'Tia'],
  [/\bmeu tio\b/, 'tio', 'Tio'],
  [/\bminha sogra\b/, 'sogra', 'Sogra'],
  [/\bmeu sogro\b/, 'sogro', 'Sogro'],
  [/\bmeu medico\b|\bminha medica\b/, 'médico(a)', 'Médico(a)'],
  [/\bmeu dentista\b|\bminha dentista\b/, 'dentista', 'Dentista'],
];

const NOT_NAMES = new Set([
  'Eu', 'Ele', 'Ela', 'Minha', 'Meu', 'Hoje', 'Amanhã', 'Ontem', 'Segunda', 'Terça', 'Quarta',
  'Quinta', 'Sexta', 'Sábado', 'Domingo', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio',
  'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro', 'MAINDY', 'Maindy',
  'Anota', 'Lembra', 'Guarda', 'Salva', 'Preciso', 'Tenho', 'Não', 'Sim', 'Oi', 'Olá', 'PIX', 'Pix',
]);

const PREFIXES =
  /^(?:(?:maindy|ei|oi)[,!]?\s+)?(?:por favor\s+)?(?:anota(?:r)?|anote|lembra|lembre|guarda(?:r)?|guarde|salva(?:r)?|salve|registra(?:r)?|registre|grava(?:r)?|grave)(?:\s+(?:a[ií]|isso|pra mim|para mim|(?:essas?|estas?|as|a)\s+informa[cç](?:[aã]o|[oõ]es)))*(?:\s+(?:que|a informa[cç][aã]o(?: de)? que))?[:,]?\s+/i;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function cleanStatement(raw: string): string {
  let s = raw.trim().replace(/\s+/g, ' ');
  s = s.replace(PREFIXES, '');
  s = s.replace(/[.!\s]+$/, '');
  return capitalize(s);
}

export function extractPeople(raw: string): ExtractedPerson[] {
  const t = normalizeText(raw);
  const people: ExtractedPerson[] = [];
  for (const [re, relation, display] of RELATIONS) {
    if (re.test(t)) people.push({ name: display, relation });
  }
  // proper names: capitalised words that are not the first word and not common words
  const words = raw.replace(/[.,!?;:()"]/g, ' ').split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    if (!/^\p{Lu}\p{Ll}{1,}$/u.test(w)) continue;
    if (NOT_NAMES.has(w)) continue;
    // The first word is capitalised anyway; only treat it as a name when a speech/
    // preference verb follows ("Ana disse…"). Mid-sentence capitals are names in pt-BR.
    let name = w;
    let span = 1;
    // compound names (Ana Paula, João Pedro)
    const next = words[i + 1];
    if (next && /^\p{Lu}\p{Ll}+$/u.test(next) && !NOT_NAMES.has(next)) {
      name = `${w} ${next}`;
      span = 2;
    }
    if (i === 0 && !/^(disse|falou|contou|pediu|prefere|gosta|mora|vai|tem|é|mandou|ligou)$/i.test(words[span] ?? '')) continue;
    i += span - 1;
    if (!people.some((p) => p.name.toLowerCase() === name.toLowerCase())) people.push({ name, relation: null });
  }
  return people;
}

function classify(t: string, hasPeople: boolean): { type: MemoryType; category: Category } {
  const category: Category = /\b(reuniao|projeto|cliente|trabalho|escritorio|empresa|chefe|entrega|deadline|prazo)\b/.test(t)
    ? 'work'
    : /\b(prova|aula|faculdade|escola|curso|estudar|trabalho de|materia|professor)\b/.test(t)
      ? 'study'
      : /\b(remedio|medico|medica|consulta|dentista|exame|saude|alergi|pressao|vacina|academia|treino)\b/.test(t)
        ? 'health'
        : /\b(pagar|conta|boleto|pix|r\$|banco|cartao|fatura|dinheiro|divida|salario|aluguel)\b/.test(t)
          ? 'finance'
          : /\b(todo dia|todos os dias|rotina|toda manha|toda noite|sempre que)\b/.test(t)
            ? 'routines'
            : /\b(importante|urgente|nao esquecer|nunca esquecer|senha|codigo)\b/.test(t)
              ? 'important'
              : hasPeople
                ? 'people'
                : 'personal';

  let type: MemoryType = 'episodic';
  if (/\b(prometi|combinei|fiquei de|me comprometi|vou te|devo (entregar|devolver|pagar))\b/.test(t)) type = 'commitment';
  else if (/\b(sempre|costumo|todo dia|todos os dias|toda semana|nunca)\b/.test(t)) type = 'habit';
  else if (hasPeople && /\b(prefere|gosta|odeia|detesta|nao gosta|ama|alergic|aniversario|faz anos)\b/.test(t)) type = 'people';
  else if (/\b(prefiro|gosto|nao gosto|odeio|meu (tipo|numero|endereco|cpf|tamanho)|minha (senha|placa|alergia))\b/.test(t)) type = 'personal';
  else if (/\b(fica|e|esta|sao)\b/.test(t) && /\b(codigo|endereco|senha|numero|telefone|chave|wifi|wi-fi|placa)\b/.test(t)) type = 'semantic';
  else if (/\b(estacionei|deixei|guardei|coloquei|tranquei|fechei|tomei|lavei|paguei)\b/.test(t)) type = 'episodic';
  else if (/\b(onde|quando|amanha|hoje|semana que vem|dia \d+)\b/.test(t)) type = 'contextual';
  return { type, category };
}

function makeTitle(statement: string, people: ExtractedPerson[], type: MemoryType): string {
  const firstPerson = people[0];
  const max = 70;
  let base = statement;
  if (firstPerson && type === 'people') {
    const rest = statement.replace(/^(minha|meu)\s+\p{L}+\s+/iu, '');
    base = `${firstPerson.name}: ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`;
  }
  return base.length > max ? `${base.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : base;
}

export function extractMemoryLocal(raw: string): ExtractedMemory {
  const statement = cleanStatement(raw);
  const t = normalizeText(statement);
  const people = extractPeople(statement);
  const { type, category } = classify(t, people.length > 0);
  const tags = new Set<string>([category]);
  if (people.length) tags.add('people');
  for (const p of people) if (p.relation) tags.add(p.relation);
  return {
    type,
    category,
    title: makeTitle(statement, people, type),
    content: statement.endsWith('.') ? statement : `${statement}.`,
    tags: [...tags],
    people,
    // the user said it directly → user confirmed; the classification is ours, the fact is theirs
    provenance: 'user_confirmed',
    confidence: 0.95,
  };
}

/** Strips "me lembra de"/"lembrete para" etc. from a reminder request, leaving the subject. */
export function reminderSubject(raw: string, timeExpression?: string): string {
  let s = raw.trim();
  if (timeExpression) s = s.replace(new RegExp(timeExpression.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ');
  s = s
    .replace(/^(?:maindy[,!]?\s+)?(?:por favor\s+)?/i, '')
    .replace(/\b(?:me\s+lembr\w*|lembre-me|lembra-me|me\s+avis\w*|cria(?:r)?\s+(?:um\s+)?lembrete|lembrete|me\s+cobr\w*)\b\s*(?:de|que|para|pra)?\s*/i, '')
    .replace(/(?<![\p{L}\d])(?:hoje|amanh[ãa]|depois de amanh[ãa]|daqui a \S+ \S+|em \d+ \S+|[àa]s?\s+\d{1,2}(?:[:h]\d{2})?\s*h?(?:oras)?)(?![\p{L}\d])/giu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.:;-]+|[\s,.:;!?-]+$/g, '');
  return capitalize(s || raw.trim());
}

export function taskSubject(raw: string): string {
  const s = raw
    .trim()
    .replace(/^(?:maindy[,!]?\s+)?(?:por favor\s+)?/i, '')
    .replace(/^(?:anota|adiciona|adicione|cria|crie)\s+(?:uma\s+)?tarefa\s*(?:de|para|pra|:)?\s*/i, '')
    .replace(/^(?:eu\s+)?(?:preciso|tenho que|tenho de|devo)\s+/i, '')
    .replace(/[.!\s]+$/, '');
  return capitalize(s);
}

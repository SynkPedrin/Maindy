import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { Memory, MemorySource, MemoryType, Provenance } from '../contracts/index.js';
import { MEMORY_SOURCES, MEMORY_TYPES, PROVENANCES } from '../contracts/index.js';

/** Obsidian-compatible Markdown with YAML frontmatter for memories. */

export const VAULT_FOLDERS = [
  '00-Profile',
  '01-Personal',
  '02-People',
  '03-Memories',
  '04-Tasks',
  '05-Calendar',
  '06-Routines',
  '07-Knowledge',
  '08-Projects',
  '09-Archive',
] as const;

const PROVENANCE_PT: Record<Provenance, string> = {
  user_confirmed: 'Confirmado por você.',
  ai_inferred: 'Inferido pela MAINDY — ainda não confirmado por você.',
  external: 'Vindo de uma integração externa.',
  unverified: 'Não verificado.',
};

const SOURCE_PT: Record<MemorySource, string> = {
  voice: 'por voz',
  text: 'por texto',
  import: 'por importação',
  integration: 'por uma integração',
  agent: 'pela MAINDY durante uma conversa',
  vault: 'diretamente no Obsidian',
};

export interface MemoryFrontmatter {
  id: string;
  type: MemoryType;
  category: string;
  source: MemorySource;
  provenance: Provenance;
  confidence: number;
  version: number;
  created_at: string;
  updated_at: string;
  occurred_at?: string;
  tags: string[];
  people: string[];
}

export function folderForMemory(type: MemoryType): string {
  switch (type) {
    case 'personal':
      return '01-Personal';
    case 'semantic':
      return '07-Knowledge';
    case 'habit':
      return '06-Routines';
    default:
      return '03-Memories';
  }
}

/** File-system and Obsidian safe file name (no path separators, no wiki-link breakers). */
export function safeFileName(title: string): string {
  const cleaned = title
    .normalize('NFC')
    .replace(/[\\/:*?"<>|#^[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/, '');
  return cleaned || 'Sem título';
}

export function memoryRelativePath(memory: Pick<Memory, 'type' | 'title' | 'createdAt'>): string {
  const d = memory.createdAt.slice(0, 10);
  const [y, m] = d.split('-');
  const folder = folderForMemory(memory.type);
  const sub = folder === '03-Memories' ? `${folder}/${y}/${m}` : folder;
  return `${sub}/${d} ${safeFileName(memory.title)}.md`;
}

function escapeMarkdownText(text: string): string {
  // memories are user content: neutralise accidental frontmatter fences / headings at line start
  return text.replace(/^---$/gm, '—').replace(/^(#{1,6})\s/gm, '\\$1 ');
}

export function serializeMemory(memory: Memory): string {
  const fm: MemoryFrontmatter = {
    id: memory.id,
    type: memory.type,
    category: memory.category,
    source: memory.source,
    provenance: memory.provenance,
    confidence: Math.round(memory.confidence * 100) / 100,
    version: memory.version,
    created_at: memory.createdAt,
    updated_at: memory.updatedAt,
    ...(memory.occurredAt ? { occurred_at: memory.occurredAt } : {}),
    tags: memory.tags,
    people: memory.people.map((p) => p.name),
  };
  const lines: string[] = [];
  lines.push('---', stringifyYaml(fm).trimEnd(), '---', '');
  lines.push(`# ${memory.title.replace(/\n/g, ' ')}`, '');
  lines.push(escapeMarkdownText(memory.content), '');
  if (memory.people.length) {
    lines.push('## Pessoas', '');
    for (const p of memory.people) lines.push(`- [[02-People/${safeFileName(p.name)}|${p.name}]]${p.relation ? ` (${p.relation})` : ''}`);
    lines.push('');
  }
  lines.push('## Contexto', '');
  lines.push(`Registrado ${SOURCE_PT[memory.source]} em ${memory.createdAt}.`);
  if (memory.originalUtterance) lines.push('', `> ${escapeMarkdownText(memory.originalUtterance).replace(/\n/g, '\n> ')}`);
  lines.push('', '## Verificação', '', PROVENANCE_PT[memory.provenance], '');
  return lines.join('\n');
}

export interface ParsedMemoryFile {
  frontmatter: Partial<MemoryFrontmatter> & Record<string, unknown>;
  title: string | null;
  /** body text between the title and the first `## ` section */
  content: string;
}

export function splitFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return { data: {}, body: normalized };
  const end = normalized.indexOf('\n---', 4);
  if (end < 0) return { data: {}, body: normalized };
  const raw = normalized.slice(4, end);
  let data: Record<string, unknown> = {};
  try {
    const parsed = parseYaml(raw, { schema: 'core' });
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
  } catch {
    data = {};
  }
  const body = normalized.slice(end + 4).replace(/^\n+/, '');
  return { data, body };
}

export function parseMemoryMarkdown(text: string): ParsedMemoryFile {
  const { data, body } = splitFrontmatter(text);
  const lines = body.split('\n');
  let title: string | null = null;
  let i = 0;
  while (i < lines.length && lines[i]!.trim() === '') i++;
  if (i < lines.length && /^#\s+/.test(lines[i]!)) {
    title = lines[i]!.replace(/^#\s+/, '').trim();
    i++;
  }
  const contentLines: string[] = [];
  for (; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i]!)) break;
    contentLines.push(lines[i]!);
  }
  const content = contentLines.join('\n').trim().replace(/^\\(#{1,6}) /gm, '$1 ');

  const fm: ParsedMemoryFile['frontmatter'] = { ...data };
  if (typeof fm.type !== 'string' || !(MEMORY_TYPES as readonly string[]).includes(fm.type)) delete fm.type;
  if (typeof fm.source !== 'string' || !(MEMORY_SOURCES as readonly string[]).includes(fm.source)) delete fm.source;
  if (typeof fm.provenance !== 'string' || !(PROVENANCES as readonly string[]).includes(fm.provenance)) delete fm.provenance;
  if (fm.tags !== undefined && !Array.isArray(fm.tags)) fm.tags = [String(fm.tags)];
  if (Array.isArray(fm.tags)) fm.tags = fm.tags.map(String);
  if (fm.confidence !== undefined) {
    const c = Number(fm.confidence);
    fm.confidence = Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : undefined;
  }
  if (fm.id !== undefined) fm.id = String(fm.id);
  return { frontmatter: fm, title, content };
}

export function personNote(name: string, relation: string | null, memories: Array<Pick<Memory, 'title' | 'vaultPath'>>): string {
  const lines = ['---', stringifyYaml({ type: 'person', name, relation }).trimEnd(), '---', '', `# ${name}`, ''];
  if (relation) lines.push(`Relação: ${relation}`, '');
  lines.push('## Memórias', '');
  for (const m of memories) {
    if (m.vaultPath) lines.push(`- [[${m.vaultPath.replace(/\.md$/, '')}|${m.title}]]`);
  }
  lines.push('');
  return lines.join('\n');
}

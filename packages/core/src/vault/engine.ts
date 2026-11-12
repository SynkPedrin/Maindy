import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import type { Memory } from '../contracts/index.js';
import { VAULT_FOLDERS, memoryRelativePath, parseMemoryMarkdown, personNote, safeFileName, serializeMemory, splitFrontmatter } from './markdown.js';

/**
 * Managed Obsidian vault engine. One independent vault per user under
 * `<storageRoot>/users/<userId>/managed-vault`. The storage root itself is NOT a
 * vault (no `.obsidian` there), so vaults are never nested.
 *
 * PostgreSQL is the operational source of truth; the vault is a human-readable,
 * Obsidian-compatible mirror that the user may also edit (changes sync back).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sha256(text: string | Uint8Array): string {
  return createHash('sha256').update(text).digest('hex');
}

export interface VaultFileEntry {
  relPath: string;
  id: string | null;
  hash: string;
  text: string;
}

export interface DbMemoryState {
  memory: Memory;
  /** hash of the file content last written to / read from the vault */
  vaultHash: string | null;
}

export type SyncAction =
  | { kind: 'write'; memoryId: string; reason: 'missing_file' | 'db_changed' }
  | { kind: 'import_edit'; memoryId: string; relPath: string; title: string | null; content: string; hash: string }
  | { kind: 'conflict'; memoryId: string; relPath: string; fileText: string }
  | { kind: 'import_new'; relPath: string; title: string | null; content: string; tags: string[]; hash: string }
  | { kind: 'remove_orphan'; relPath: string; id: string };

/**
 * Pure sync planner (unit-tested). Rules:
 *  - DB row without a file → rewrite file from DB.
 *  - file unchanged since last sync but DB rendering differs → rewrite file.
 *  - file changed, DB unchanged since last sync → import the user's edit into DB.
 *  - both changed → conflict: DB wins, the file version is preserved in 09-Archive/Conflitos.
 *  - file with an id that no longer exists in DB → the memory was deleted → remove the file.
 *  - new note without id inside 03-Memories → import as a new memory (source: vault).
 */
export function planSync(db: DbMemoryState[], files: VaultFileEntry[]): SyncAction[] {
  const actions: SyncAction[] = [];
  const byId = new Map(files.filter((f) => f.id).map((f) => [f.id!, f]));
  const dbIds = new Set(db.map((d) => d.memory.id));

  for (const { memory, vaultHash } of db) {
    const file = byId.get(memory.id);
    const rendered = sha256(serializeMemory(memory));
    if (!file) {
      actions.push({ kind: 'write', memoryId: memory.id, reason: 'missing_file' });
      continue;
    }
    const fileChanged = file.hash !== vaultHash;
    const dbChanged = rendered !== vaultHash;
    if (!fileChanged && !dbChanged) continue;
    if (!fileChanged && dbChanged) {
      actions.push({ kind: 'write', memoryId: memory.id, reason: 'db_changed' });
    } else if (fileChanged && !dbChanged) {
      const parsed = parseMemoryMarkdown(file.text);
      actions.push({ kind: 'import_edit', memoryId: memory.id, relPath: file.relPath, title: parsed.title, content: parsed.content, hash: file.hash });
    } else {
      actions.push({ kind: 'conflict', memoryId: memory.id, relPath: file.relPath, fileText: file.text });
    }
  }

  for (const f of files) {
    if (f.id && !dbIds.has(f.id)) {
      actions.push({ kind: 'remove_orphan', relPath: f.relPath, id: f.id });
    } else if (!f.id && f.relPath.startsWith('03-Memories/')) {
      const parsed = parseMemoryMarkdown(f.text);
      if (parsed.content.trim() || parsed.title) {
        actions.push({ kind: 'import_new', relPath: f.relPath, title: parsed.title ?? path.basename(f.relPath, '.md'), content: parsed.content, tags: (parsed.frontmatter.tags as string[] | undefined) ?? [], hash: f.hash });
      }
    }
  }
  return actions;
}

export class VaultEngine {
  constructor(private readonly storageRoot: string) {}

  static storageKeyFor(userId: string): string {
    if (!UUID_RE.test(userId)) throw new Error('invalid user id');
    return `users/${userId.toLowerCase()}/managed-vault`;
  }

  /** Absolute vault directory for a storage key; rejects anything escaping the root. */
  vaultDir(storageKey: string): string {
    if (!/^users\/[0-9a-f-]{36}\/managed-vault$/.test(storageKey)) throw new Error('invalid storage key');
    const dir = path.resolve(this.storageRoot, storageKey);
    const rel = path.relative(path.resolve(this.storageRoot), dir);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('storage key escapes root');
    return dir;
  }

  /** Resolve a vault-relative path safely (no traversal, .md only). */
  resolveInVault(storageKey: string, relPath: string): string {
    const dir = this.vaultDir(storageKey);
    const abs = path.resolve(dir, relPath);
    const rel = path.relative(dir, abs);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('path escapes vault');
    return abs;
  }

  async provision(userId: string, displayName: string | null): Promise<{ storageKey: string; dir: string; created: boolean }> {
    const storageKey = VaultEngine.storageKeyFor(userId);
    const dir = this.vaultDir(storageKey);
    let created = false;
    try {
      await fs.access(path.join(dir, '.obsidian'));
    } catch {
      created = true;
    }
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    for (const f of VAULT_FOLDERS) await fs.mkdir(path.join(dir, f), { recursive: true, mode: 0o700 });
    await fs.mkdir(path.join(dir, '.obsidian'), { recursive: true, mode: 0o700 });
    await fs.mkdir(path.join(dir, '.maindy', 'history'), { recursive: true, mode: 0o700 });
    if (created) {
      await this.atomicWrite(path.join(dir, '.obsidian', 'app.json'), JSON.stringify({ showFrontmatter: true, newFileLocation: 'folder', newFileFolderPath: '03-Memories' }, null, 2));
      await this.atomicWrite(
        path.join(dir, '00-Profile', 'Perfil.md'),
        `---\ntype: profile\n---\n\n# ${displayName ?? 'Meu perfil'}\n\nEste vault é gerenciado pela MAINDY. Você pode ler e editar as notas no Obsidian;\nas alterações em memórias são sincronizadas de volta.\n\n- [[04-Tasks/Tarefas|Tarefas]]\n- [[05-Calendar/Lembretes|Lembretes]]\n`,
      );
    }
    return { storageKey, dir, created };
  }

  private async atomicWrite(abs: string, text: string): Promise<void> {
    await fs.mkdir(path.dirname(abs), { recursive: true, mode: 0o700 });
    const tmp = `${abs}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmp, text, { mode: 0o600 });
    await fs.rename(tmp, abs);
  }

  /** Writes a memory file. Keeps the previous file content as a version in `.maindy/history`. */
  async writeMemory(storageKey: string, memory: Memory, previousPath?: string | null): Promise<{ relPath: string; hash: string }> {
    const dir = this.vaultDir(storageKey);
    let relPath = previousPath ?? memoryRelativePath(memory);
    const text = serializeMemory(memory);
    const abs = this.resolveInVault(storageKey, relPath);

    // never clobber a different memory's file that happens to share the name
    try {
      const existing = await fs.readFile(abs, 'utf8');
      const existingId = parseMemoryMarkdown(existing).frontmatter.id;
      if (existingId && existingId !== memory.id) {
        relPath = relPath.replace(/\.md$/, ` (${memory.id.slice(0, 8)}).md`);
      } else if (existing !== text) {
        const histDir = path.join(dir, '.maindy', 'history', memory.id);
        await fs.mkdir(histDir, { recursive: true, mode: 0o700 });
        await fs.writeFile(path.join(histDir, `v${Math.max(1, memory.version - 1)}-${Date.now()}.md`), existing, { mode: 0o600 });
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    await this.atomicWrite(this.resolveInVault(storageKey, relPath), text);
    return { relPath, hash: sha256(text) };
  }

  async deleteMemory(storageKey: string, memoryId: string, relPath: string | null): Promise<void> {
    const dir = this.vaultDir(storageKey);
    if (relPath) await fs.rm(this.resolveInVault(storageKey, relPath), { force: true });
    if (!UUID_RE.test(memoryId)) throw new Error('invalid memory id');
    await fs.rm(path.join(dir, '.maindy', 'history', memoryId), { recursive: true, force: true });
  }

  async readFile(storageKey: string, relPath: string): Promise<string> {
    return fs.readFile(this.resolveInVault(storageKey, relPath), 'utf8');
  }

  async writeNote(storageKey: string, relPath: string, text: string): Promise<void> {
    await this.atomicWrite(this.resolveInVault(storageKey, relPath), text);
  }

  async writePersonNote(storageKey: string, name: string, relation: string | null, memories: Array<Pick<Memory, 'title' | 'vaultPath'>>): Promise<string> {
    const rel = `02-People/${safeFileName(name)}.md`;
    await this.writeNote(storageKey, rel, personNote(name, relation, memories));
    return rel;
  }

  /** Lists every Markdown note (excluding .obsidian/.maindy and archive). */
  async scan(storageKey: string): Promise<VaultFileEntry[]> {
    const dir = this.vaultDir(storageKey);
    const out: VaultFileEntry[] = [];
    const walk = async (sub: string) => {
      const entries = await fs.readdir(path.join(dir, sub), { withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        const rel = sub ? `${sub}/${e.name}` : e.name;
        if (e.isDirectory()) {
          if (rel === '09-Archive') continue;
          await walk(rel);
        } else if (e.isFile() && e.name.endsWith('.md')) {
          const text = await fs.readFile(path.join(dir, rel), 'utf8');
          const parsed = parseMemoryMarkdown(text);
          const fmType = splitFrontmatter(text).data.type;
          const isMemory = typeof parsed.frontmatter.id === 'string' && UUID_RE.test(parsed.frontmatter.id);
          if (!isMemory && (fmType === 'person' || fmType === 'profile' || fmType === 'index')) continue;
          out.push({ relPath: rel, id: isMemory ? (parsed.frontmatter.id as string) : null, hash: sha256(text), text });
        }
      }
    };
    await walk('');
    return out;
  }

  async preserveConflict(storageKey: string, relPath: string, fileText: string): Promise<string> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rel = `09-Archive/Conflitos/${path.basename(relPath, '.md')} (conflito ${stamp}).md`;
    await this.writeNote(storageKey, rel, fileText);
    return rel;
  }

  /** Zip export of the whole vault (notes + Obsidian config), for data portability. */
  async exportZip(storageKey: string): Promise<Uint8Array> {
    const dir = this.vaultDir(storageKey);
    const files: Record<string, Uint8Array> = {};
    const walk = async (sub: string) => {
      const entries = await fs.readdir(path.join(dir, sub), { withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        const rel = sub ? `${sub}/${e.name}` : e.name;
        if (rel === '.maindy') continue;
        if (e.isDirectory()) await walk(rel);
        else if (e.isFile()) files[`maindy-vault/${rel}`] = new Uint8Array(await fs.readFile(path.join(dir, rel)));
      }
    };
    await walk('');
    if (Object.keys(files).length === 0) files['maindy-vault/LEIA-ME.md'] = strToU8('# Vault vazio\n');
    return zipSync(files, { level: 6 });
  }

  async destroy(storageKey: string): Promise<void> {
    await fs.rm(this.vaultDir(storageKey), { recursive: true, force: true });
  }
}

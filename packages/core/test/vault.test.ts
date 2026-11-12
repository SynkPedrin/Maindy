import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Memory } from '../src/contracts/index.js';
import { parseMemoryMarkdown, serializeMemory, memoryRelativePath, safeFileName } from '../src/vault/markdown.js';
import { VaultEngine, planSync, sha256 } from '../src/vault/engine.js';

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';

function mem(p: Partial<Memory> = {}): Memory {
  return {
    id: p.id ?? 'aaaaaaaa-0000-4000-8000-000000000001',
    type: p.type ?? 'people',
    category: p.category ?? 'people',
    title: p.title ?? 'Mãe: prefere que eu ligue depois das 18h',
    content: p.content ?? 'Minha mãe prefere que eu ligue depois das 18h.',
    source: p.source ?? 'voice',
    provenance: p.provenance ?? 'user_confirmed',
    confidence: p.confidence ?? 0.95,
    tags: p.tags ?? ['people', 'mãe'],
    originalUtterance: p.originalUtterance ?? 'Minha mãe prefere que eu ligue depois das 18h.',
    occurredAt: null,
    version: p.version ?? 1,
    vaultPath: null,
    people: p.people ?? [{ id: 'p1', name: 'Mãe', relation: 'mãe' }],
    createdAt: p.createdAt ?? '2026-11-12T10:30:00.000Z',
    updatedAt: p.updatedAt ?? '2026-11-12T10:30:00.000Z',
  };
}

describe('markdown', () => {
  it('round-trips frontmatter, title and content', () => {
    const md = serializeMemory(mem());
    expect(md.startsWith('---\nid: aaaaaaaa')).toBe(true);
    expect(md).toContain('[[02-People/Mãe|Mãe]]');
    expect(md).toContain('## Verificação');
    const parsed = parseMemoryMarkdown(md);
    expect(parsed.frontmatter).toMatchObject({ id: mem().id, type: 'people', source: 'voice', provenance: 'user_confirmed', confidence: 0.95, tags: ['people', 'mãe'] });
    expect(parsed.title).toBe('Mãe: prefere que eu ligue depois das 18h');
    expect(parsed.content).toBe('Minha mãe prefere que eu ligue depois das 18h.');
  });

  it('neutralises fences/headings in user content and survives round-trip', () => {
    const tricky = mem({ content: '---\n# não é título\nlinha' });
    const parsed = parseMemoryMarkdown(serializeMemory(tricky));
    expect(parsed.content).toBe('—\n# não é título\nlinha');
  });

  it('rejects invalid enum values from hand-edited frontmatter', () => {
    const parsed = parseMemoryMarkdown('---\nid: x\ntype: hacked\nprovenance: admin\nconfidence: 9\n---\n# T\n\nC');
    expect(parsed.frontmatter.type).toBeUndefined();
    expect(parsed.frontmatter.provenance).toBeUndefined();
    expect(parsed.frontmatter.confidence).toBe(1);
  });

  it('builds safe paths', () => {
    expect(safeFileName('a/b\\c:d*?"<>|[[x]]')).toBe('a b c d x');
    expect(memoryRelativePath(mem())).toBe('03-Memories/2026/11/2026-11-12 Mãe prefere que eu ligue depois das 18h.md'.replace('Mãe prefere', 'Mãe prefere'));
  });
});

describe('VaultEngine', () => {
  let root: string;
  let engine: VaultEngine;
  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'maindy-vault-'));
    engine = new VaultEngine(root);
  });
  afterAll(async () => rm(root, { recursive: true, force: true }));

  it('provisions independent, non-nested vaults per user', async () => {
    const a = await engine.provision(userA, 'Ana');
    const b = await engine.provision(userB, 'Bruno');
    expect(a.dir).not.toBe(b.dir);
    expect(path.relative(a.dir, b.dir).startsWith('..')).toBe(true);
    const folders = await readdir(a.dir);
    expect(folders).toEqual(expect.arrayContaining(['00-Profile', '03-Memories', '09-Archive', '.obsidian']));
    // the storage root is not a vault itself
    await expect(readdir(path.join(root, '.obsidian'))).rejects.toThrow();
  });

  it('rejects traversal and invalid keys', () => {
    expect(() => engine.vaultDir('users/../../etc/managed-vault')).toThrow();
    expect(() => engine.resolveInVault(VaultEngine.storageKeyFor(userA), '../../x.md')).toThrow();
    expect(() => VaultEngine.storageKeyFor('../evil')).toThrow();
  });

  it('writes, versions and deletes memory files', async () => {
    const key = VaultEngine.storageKeyFor(userA);
    const m = mem();
    const w1 = await engine.writeMemory(key, m);
    expect(w1.hash).toBe(sha256(serializeMemory(m)));
    const w2 = await engine.writeMemory(key, { ...m, content: 'Atualizado.', version: 2 }, w1.relPath);
    expect(w2.relPath).toBe(w1.relPath);
    const hist = await readdir(path.join(engine.vaultDir(key), '.maindy', 'history', m.id));
    expect(hist.length).toBe(1);
    expect(await readFile(path.join(engine.vaultDir(key), w1.relPath), 'utf8')).toContain('Atualizado.');
    await engine.deleteMemory(key, m.id, w1.relPath);
    await expect(readFile(path.join(engine.vaultDir(key), w1.relPath), 'utf8')).rejects.toThrow();
  });

  it('plans sync: missing, db change, user edit, conflict, orphan, new note', async () => {
    const key = VaultEngine.storageKeyFor(userB);
    const m1 = mem({ id: 'bbbbbbbb-0000-4000-8000-000000000001', title: 'Um' });
    const m2 = mem({ id: 'bbbbbbbb-0000-4000-8000-000000000002', title: 'Dois' });
    const m3 = mem({ id: 'bbbbbbbb-0000-4000-8000-000000000003', title: 'Tres' });
    const m4 = mem({ id: 'bbbbbbbb-0000-4000-8000-000000000004', title: 'Quatro' });
    const w2 = await engine.writeMemory(key, m2);
    const w3 = await engine.writeMemory(key, m3);
    const w4 = await engine.writeMemory(key, m4);
    // user edits m3 and m4 in Obsidian; m4 also changed in DB → conflict
    const dir = engine.vaultDir(key);
    for (const rel of [w3.relPath, w4.relPath]) {
      const t = await readFile(path.join(dir, rel), 'utf8');
      await writeFile(path.join(dir, rel), t.replace('Minha mãe prefere', 'Editado no Obsidian: minha mãe prefere'));
    }
    // orphan (id not in DB) and brand new note
    await writeFile(path.join(dir, '03-Memories', 'orfa.md'), serializeMemory(mem({ id: 'bbbbbbbb-0000-4000-8000-000000000099', title: 'Órfã' })));
    await writeFile(path.join(dir, '03-Memories', 'nova.md'), '# Senha do wifi\n\nA senha do wifi da casa da praia é maresia2026.\n');

    const files = await engine.scan(key);
    const actions = planSync(
      [
        { memory: m1, vaultHash: null },
        { memory: { ...m2, version: 2, content: 'Mudou no app.' }, vaultHash: w2.hash },
        { memory: m3, vaultHash: w3.hash },
        { memory: { ...m4, version: 2, content: 'Mudou no app também.' }, vaultHash: w4.hash },
      ],
      files,
    );
    const byKind = (k: string) => actions.filter((a) => a.kind === k);
    expect(byKind('write').map((a) => (a as { memoryId: string }).memoryId).sort()).toEqual([m1.id, m2.id].sort());
    expect(byKind('import_edit')).toHaveLength(1);
    expect((byKind('import_edit')[0] as { content: string }).content).toContain('Editado no Obsidian');
    expect(byKind('conflict')).toHaveLength(1);
    expect(byKind('remove_orphan')).toHaveLength(1);
    expect(byKind('import_new')).toHaveLength(1);
    expect((byKind('import_new')[0] as { title: string }).title).toBe('Senha do wifi');
  });

  it('exports a zip without internal history', async () => {
    const key = VaultEngine.storageKeyFor(userA);
    await engine.writeMemory(key, mem({ id: 'cccccccc-0000-4000-8000-000000000001', title: 'Exportável' }));
    const zip = unzipSync(await engine.exportZip(key));
    const names = Object.keys(zip);
    expect(names.some((n) => n.includes('Exportável'))).toBe(true);
    expect(names.some((n) => n.includes('.maindy'))).toBe(false);
  });
});

import type { Memory, MemorySearchHit, NewMemoryInput, PersonRef } from '@maindy/core';
import type { Db } from '../db.js';
import { toVectorLiteral } from '../embeddings.js';

type Row = Record<string, any>;

export function mapMemory(r: Row, people: PersonRef[] = []): Memory {
  return {
    id: r.id,
    type: r.type,
    category: r.category,
    title: r.title,
    content: r.content,
    source: r.source,
    provenance: r.provenance,
    confidence: Number(r.confidence),
    tags: r.tags ?? [],
    originalUtterance: r.original_utterance ?? null,
    occurredAt: r.occurred_at ?? null,
    version: r.version,
    vaultPath: r.vault_path ?? null,
    people,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const MEMORY_COLS = 'id, type, category, title, content, source, provenance, confidence, tags, original_utterance, occurred_at, version, vault_path, vault_hash, created_at, updated_at';

async function peopleFor(db: Db, ids: string[]): Promise<Map<string, PersonRef[]>> {
  const map = new Map<string, PersonRef[]>();
  if (!ids.length) return map;
  const { rows } = await db.query(
    `select mp.memory_id, p.id, p.name, p.relation from maindy.memory_people mp join maindy.people p on p.id = mp.person_id where mp.memory_id = any($1::uuid[]) order by p.name`,
    [ids],
  );
  for (const r of rows) {
    const list = map.get(r.memory_id) ?? [];
    list.push({ id: r.id, name: r.name, relation: r.relation });
    map.set(r.memory_id, list);
  }
  return map;
}

export async function getMemories(db: Db, ids: string[]): Promise<Memory[]> {
  if (!ids.length) return [];
  const { rows } = await db.query(`select ${MEMORY_COLS} from maindy.memories where id = any($1::uuid[])`, [ids]);
  const people = await peopleFor(db, rows.map((r) => r.id));
  const byId = new Map(rows.map((r) => [r.id, mapMemory(r, people.get(r.id) ?? [])]));
  return ids.map((id) => byId.get(id)).filter((m): m is Memory => Boolean(m));
}

export async function getMemoryRow(db: Db, id: string): Promise<{ memory: Memory; vaultHash: string | null } | null> {
  const { rows } = await db.query(`select ${MEMORY_COLS} from maindy.memories where id = $1`, [id]);
  if (!rows[0]) return null;
  const people = await peopleFor(db, [id]);
  return { memory: mapMemory(rows[0], people.get(id) ?? []), vaultHash: rows[0].vault_hash ?? null };
}

/** Finds or creates people by name/relation (case-insensitive) for the current user. */
export async function upsertPeople(db: Db, userId: string, people: Array<{ name: string; relation: string | null }>): Promise<PersonRef[]> {
  const out: PersonRef[] = [];
  for (const p of people) {
    const name = p.name.trim().slice(0, 80);
    if (!name) continue;
    const { rows } = await db.query(
      `insert into maindy.people (user_id, name, relation)
       values ($1, $2, $3)
       on conflict (user_id, lower(name)) do update set relation = coalesce(maindy.people.relation, excluded.relation)
       returning id, name, relation`,
      [userId, name, p.relation],
    );
    out.push({ id: rows[0].id, name: rows[0].name, relation: rows[0].relation });
  }
  return out;
}

export async function insertMemory(db: Db, userId: string, input: NewMemoryInput): Promise<Memory> {
  const { rows } = await db.query(
    `insert into maindy.memories (user_id, type, category, title, content, source, provenance, confidence, tags, original_utterance, occurred_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning ${MEMORY_COLS}`,
    [userId, input.type, input.category, input.title, input.content, input.source, input.provenance, input.confidence, input.tags, input.originalUtterance, input.occurredAt ?? null],
  );
  const row = rows[0];
  const people = await upsertPeople(db, userId, input.people);
  for (const p of people) {
    await db.query(`insert into maindy.memory_people (memory_id, person_id, user_id) values ($1, $2, $3) on conflict do nothing`, [row.id, p.id, userId]);
  }
  await db.query(`insert into maindy.memory_versions (memory_id, user_id, version, title, content, changed_by) values ($1, $2, 1, $3, $4, $5)`, [
    row.id,
    userId,
    row.title,
    row.content,
    input.source === 'vault' ? 'vault_sync' : input.source === 'agent' ? 'agent' : 'user',
  ]);
  return mapMemory(row, people);
}

export async function updateMemory(
  db: Db,
  userId: string,
  id: string,
  patch: { title?: string; content?: string; category?: string; tags?: string[]; provenance?: string },
  changedBy: 'user' | 'agent' | 'vault_sync',
): Promise<Memory | null> {
  const { rows } = await db.query(
    `update maindy.memories set
       title = coalesce($2, title), content = coalesce($3, content), category = coalesce($4, category),
       tags = coalesce($5, tags), provenance = coalesce($6::maindy.provenance, provenance), version = version + 1
     where id = $1 returning ${MEMORY_COLS}`,
    [id, patch.title ?? null, patch.content ?? null, patch.category ?? null, patch.tags ?? null, patch.provenance ?? null],
  );
  if (!rows[0]) return null;
  await db.query(`insert into maindy.memory_versions (memory_id, user_id, version, title, content, changed_by) values ($1, $2, $3, $4, $5, $6)`, [
    id,
    userId,
    rows[0].version,
    rows[0].title,
    rows[0].content,
    changedBy,
  ]);
  const people = await peopleFor(db, [id]);
  return mapMemory(rows[0], people.get(id) ?? []);
}

export async function setVaultState(db: Db, id: string, vaultPath: string, vaultHash: string): Promise<void> {
  // does not bump updated_at semantics we care about; the touch trigger updates it, which is fine
  await db.query(`update maindy.memories set vault_path = $2, vault_hash = $3 where id = $1`, [id, vaultPath, vaultHash]);
}

export async function deleteMemory(db: Db, id: string): Promise<{ vaultPath: string | null } | null> {
  const { rows } = await db.query(`delete from maindy.memories where id = $1 returning vault_path`, [id]);
  return rows[0] ? { vaultPath: rows[0].vault_path } : null;
}

export async function upsertEmbedding(db: Db, userId: string, memoryId: string, model: string, vector: number[]): Promise<void> {
  await db.query(
    `insert into maindy.memory_embeddings (memory_id, user_id, model, embedding) values ($1, $2, $3, $4::extensions.vector)
     on conflict (memory_id) do update set embedding = excluded.embedding, model = excluded.model, created_at = now()`,
    [memoryId, userId, model, toVectorLiteral(vector)],
  );
}

export async function searchMemories(
  db: Db,
  query: string,
  embedding: number[] | null,
  limit: number,
  personIds: string[] | null = null,
): Promise<MemorySearchHit[]> {
  const { rows } = await db.query(
    `select * from maindy.search_memories($1, $2::extensions.vector, $3, null, $4::uuid[])`,
    [query, embedding ? toVectorLiteral(embedding) : null, limit, personIds],
  );
  const memories = await getMemories(db, rows.map((r) => r.memory_id));
  const byId = new Map(memories.map((m) => [m.id, m]));
  return rows
    .map((r) => {
      const memory = byId.get(r.memory_id);
      return memory ? { memory, score: Number(r.score), textRank: Number(r.text_rank), vectorSimilarity: Number(r.vector_similarity), personMatch: r.person_match } : null;
    })
    .filter((h): h is MemorySearchHit => h !== null);
}

/** People whose name/relation/alias appears in the query → entity-relationship boost. */
export async function peopleMentioned(db: Db, query: string): Promise<string[]> {
  const { rows } = await db.query(
    `select id from maindy.people p
     where maindy.immutable_unaccent(lower($1)) like '%' || maindy.immutable_unaccent(lower(p.name)) || '%'
        or (p.relation is not null and maindy.immutable_unaccent(lower($1)) like '%' || maindy.immutable_unaccent(lower(p.relation)) || '%')
        or exists (select 1 from unnest(p.aliases) a where maindy.immutable_unaccent(lower($1)) like '%' || maindy.immutable_unaccent(lower(a)) || '%')`,
    [query],
  );
  return rows.map((r) => r.id);
}

export async function listMemories(
  db: Db,
  opts: { category?: string | null; type?: string | null; personId?: string | null; limit: number; before?: string | null },
): Promise<Memory[]> {
  const { rows } = await db.query(
    `select ${MEMORY_COLS} from maindy.memories m
     where ($1::text is null or m.category = $1)
       and ($2::text is null or m.type::text = $2)
       and ($3::uuid is null or exists (select 1 from maindy.memory_people mp where mp.memory_id = m.id and mp.person_id = $3))
       and ($5::timestamptz is null or m.created_at < $5)
     order by m.created_at desc limit $4`,
    [opts.category ?? null, opts.type ?? null, opts.personId ?? null, opts.limit, opts.before ?? null],
  );
  const people = await peopleFor(db, rows.map((r) => r.id));
  return rows.map((r) => mapMemory(r, people.get(r.id) ?? []));
}

export async function listPeople(db: Db): Promise<Array<PersonRef & { memoryCount: number }>> {
  const { rows } = await db.query(
    `select p.id, p.name, p.relation, count(mp.memory_id)::int as memory_count
     from maindy.people p left join maindy.memory_people mp on mp.person_id = p.id
     group by p.id order by count(mp.memory_id) desc, p.name`,
  );
  return rows.map((r) => ({ id: r.id, name: r.name, relation: r.relation, memoryCount: r.memory_count }));
}

export async function allMemoriesForSync(db: Db): Promise<Array<{ memory: Memory; vaultHash: string | null }>> {
  const { rows } = await db.query(`select ${MEMORY_COLS} from maindy.memories order by created_at`);
  const people = await peopleFor(db, rows.map((r) => r.id));
  return rows.map((r) => ({ memory: mapMemory(r, people.get(r.id) ?? []), vaultHash: r.vault_hash ?? null }));
}

/**
 * End-to-end scenarios against the REAL running stack: API (pnpm dev:api), local Supabase
 * (Auth + Postgres/pgvector + RLS), the managed Obsidian vaults on disk, and VoiceStudio.
 * Prerequisites: pnpm db:start, pnpm dev:api, node scripts/dev-setup.mjs, VoiceStudio open.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { API, api, env, login } from './helpers.js';

let A: { token: string; id: string };
let B: { token: string; id: string };
const run = Date.now().toString(36);

beforeAll(async () => {
  A = await login('user-demo-001');
  B = await login('user-demo-002');
});

describe('Scenario A — second brain', () => {
  let memoryId = '';
  it('saves a memory from natural language and mirrors it to the vault', async () => {
    const r = await api(A.token, 'POST', '/v1/agent/chat', { message: `Minha mãe prefere que eu ligue depois das 18h. (${run})` });
    expect(r.status).toBe(200);
    expect(r.body.intent).toBe('save_memory');
    expect(r.body.actions.some((a: any) => a.tool === 'save_memory' && a.status === 'succeeded')).toBe(true);
    memoryId = r.body.memoryRefs[0].id;
    const m = await api(A.token, 'GET', `/v1/memories/${memoryId}`);
    expect(m.body.people.map((p: any) => p.name)).toContain('Mãe');
    expect(m.body.provenance).toBe('user_confirmed');
    expect(m.body.vaultPath).toMatch(/^03-Memories\//);
    const file = await readFile(join(env.MAINDY_STORAGE_ROOT!, 'users', A.id, 'managed-vault', m.body.vaultPath), 'utf8');
    expect(file).toContain(`id: ${memoryId}`);
    expect(file).toContain('[[02-People/Mãe|Mãe]]');
  });

  it('after a fresh session (new login), answers from the stored memory with its source', async () => {
    const fresh = await login('user-demo-001');
    const r = await api(fresh.token, 'POST', '/v1/agent/chat', { message: 'Qual o melhor horário para ligar para minha mãe?' });
    expect(r.status).toBe(200);
    expect(r.body.intent).toBe('recall');
    expect(r.body.reply).toMatch(/18h/);
    expect(r.body.memoryRefs.length).toBeGreaterThan(0);
    expect(r.body.memoryRefs[0].title).toMatch(/Mãe/);
    expect(r.body.memoryRefs[0].provenance).toBe('user_confirmed');
  });

  it('semantic search finds it with different words', async () => {
    const r = await api(A.token, 'GET', `/v1/memories/search?q=${encodeURIComponent('quando posso telefonar pra mamãe')}`);
    expect(r.status).toBe(200);
    expect(r.body.map((h: any) => h.memory.id)).toContain(memoryId);
  });

  it('never claims a physical action without a record', async () => {
    const r = await api(A.token, 'POST', '/v1/agent/chat', { message: `Eu tranquei a porta do depósito ${run}?` });
    expect(r.body.intent).toBe('physical_check');
    expect(r.body.reply).toMatch(/não (tenho|consigo)/i);
  });

  it('edits made in Obsidian sync back to the database', async () => {
    const m = await api(A.token, 'GET', `/v1/memories/${memoryId}`);
    const path = join(env.MAINDY_STORAGE_ROOT!, 'users', A.id, 'managed-vault', m.body.vaultPath);
    const text = await readFile(path, 'utf8');
    // edit the body line (the title also contains the sentence)
    await writeFile(path, text.replace(/^(Minha mãe prefere que eu ligue depois das 18h)/m, '$1, nunca antes das 9h'));
    const s = await api(A.token, 'POST', '/v1/vaults/sync', {});
    expect(s.status).toBe(200);
    expect(s.body.imported).toBeGreaterThanOrEqual(1);
    const after = await api(A.token, 'GET', `/v1/memories/${memoryId}`);
    expect(after.body.content).toContain('nunca antes das 9h');
    expect(after.body.version).toBeGreaterThan(m.body.version);
    expect(after.body.versions[0].changedBy).toBe('vault_sync');
  });
});

describe('Scenario B — user isolation', () => {
  let aMemory = '';
  beforeAll(async () => {
    const r = await api(A.token, 'POST', '/v1/memories', { content: `O código do cofre da Ana é 9182 (${run})` });
    aMemory = r.body.id;
    await api(B.token, 'POST', '/v1/memories', { content: `O Bruno estacionou no piso G2 (${run})` });
  });

  it('B cannot read, edit or delete A’s memory by id', async () => {
    expect((await api(B.token, 'GET', `/v1/memories/${aMemory}`)).status).toBe(404);
    expect((await api(B.token, 'PATCH', `/v1/memories/${aMemory}`, { content: 'hack' })).status).toBe(404);
    expect((await api(B.token, 'DELETE', `/v1/memories/${aMemory}`)).status).toBe(404);
    expect((await api(A.token, 'GET', `/v1/memories/${aMemory}`)).status).toBe(200);
  });

  it('B’s search and agent never see A’s data', async () => {
    const s = await api(B.token, 'GET', `/v1/memories/search?q=${encodeURIComponent('código do cofre')}`);
    expect(s.body.every((h: any) => h.memory.id !== aMemory)).toBe(true);
    const c = await api(B.token, 'POST', '/v1/agent/chat', { message: 'Qual é o código do cofre?' });
    expect(c.body.reply).not.toContain('9182');
  });

  it('unauthenticated and forged tokens are rejected', async () => {
    expect((await api(null, 'GET', '/v1/memories')).status).toBe(401);
    expect((await api('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.x', 'GET', '/v1/memories')).status).toBe(401);
  });

  it('RLS holds at the database level for B’s claims', async () => {
    const client = new pg.Client({ connectionString: env.DATABASE_URL });
    await client.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: B.id, role: 'authenticated' })]);
      await client.query('set local role authenticated');
      const { rows } = await client.query('select id from maindy.memories where id = $1', [aMemory]);
      expect(rows).toHaveLength(0);
      const upd = await client.query(`update maindy.memories set content = 'x' where id = $1`, [aMemory]);
      expect(upd.rowCount).toBe(0);
      await expect(client.query(`insert into maindy.memories (user_id, title, content) values ($1, 't', 'c')`, [A.id])).rejects.toThrow(/row-level security/);
      await client.query('rollback');
      await client.query('begin');
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: B.id, role: 'authenticated' })]);
      await client.query('set local role authenticated');
      await expect(client.query('select * from maindy.provider_credentials')).rejects.toThrow(/permission denied/);
      await client.query('rollback');
    } finally {
      await client.end();
    }
  });

  it('the maindy schema is not exposed through PostgREST', async () => {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/memories?select=*`, { headers: { apikey: env.SUPABASE_ANON_KEY!, Authorization: `Bearer ${B.token}`, 'Accept-Profile': 'maindy' } });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it('vaults are separate directories', async () => {
    const aExport = await fetch(`${API}/v1/vaults/export`, { headers: { Authorization: `Bearer ${A.token}` } });
    const bExport = await fetch(`${API}/v1/vaults/export`, { headers: { Authorization: `Bearer ${B.token}` } });
    const aZip = Buffer.from(await aExport.arrayBuffer()).toString('latin1');
    const bZip = Buffer.from(await bExport.arrayBuffer()).toString('latin1');
    expect(aExport.headers.get('content-type')).toBe('application/zip');
    expect(bZip.includes('9182')).toBe(false);
    expect(aZip.length).toBeGreaterThan(100);
  });
});

describe('Scenario C — voice (VoiceStudio, pt-BR)', () => {
  it('transcribes spoken Portuguese, answers through the agent and speaks back', async () => {
    const tts = await fetch(`${env.VOICESTUDIO_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts-1', input: 'Qual o melhor horário para ligar para minha mãe?', voice: 'alloy', language: 'pt', response_format: 'wav' }),
    });
    expect(tts.ok).toBe(true);
    const wav = new Uint8Array(await tts.arrayBuffer());
    const form = new FormData();
    form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'pergunta.wav');
    const r = await fetch(`${API}/v1/agent/voice`, { method: 'POST', headers: { Authorization: `Bearer ${A.token}` }, body: form });
    const j = (await r.json()) as any;
    expect(r.status).toBe(200);
    expect(j.transcript.toLowerCase()).toMatch(/hor[áa]rio/);
    expect(j.transcriptionProvider).toBe('voicestudio');
    expect(j.reply).toMatch(/18h/);
    expect(j.speech?.mimeType).toBe('audio/wav');
    expect(Buffer.from(j.speech.audioBase64, 'base64').length).toBeGreaterThan(10_000);
  }, 240_000);
});

describe('Scenario D — reminder', () => {
  it('creates, persists, dispatches and completes a reminder', async () => {
    const remindAt = new Date(Date.now() + 2_000).toISOString();
    const c = await api(A.token, 'POST', '/v1/reminders', { title: `Beber água ${run}`, remindAt });
    expect(c.status).toBe(201);
    const list = await api(A.token, 'GET', '/v1/reminders?includeDone=true');
    expect(list.body.some((r: any) => r.id === c.body.id)).toBe(true);
    // wait for the API's dispatcher (30 s tick)
    let delivered: any = null;
    for (let i = 0; i < 40 && !delivered; i++) {
      await new Promise((res) => setTimeout(res, 1_000));
      const l = await api(A.token, 'GET', '/v1/reminders?includeDone=true');
      delivered = l.body.find((r: any) => r.id === c.body.id && r.status === 'delivered');
    }
    expect(delivered?.deliveredAt).toBeTruthy();
    const done = await api(A.token, 'POST', `/v1/reminders/${c.body.id}/complete`, {});
    expect(done.body.status).toBe('done');
  }, 60_000);

  it('creates a reminder from natural language', async () => {
    const r = await api(A.token, 'POST', '/v1/agent/chat', { message: 'Me lembra de tomar o remédio daqui a 30 minutos' });
    expect(r.body.intent).toBe('create_reminder');
    expect(r.body.actions[0]).toMatchObject({ tool: 'create_reminder', status: 'succeeded' });
    expect(r.body.reply).toMatch(/tomar o remédio/i);
  });
});

describe('Scenario E — permission & audit', () => {
  it('a calendar event requested to the agent waits for confirmation, then executes and is audited', async () => {
    const r = await api(A.token, 'POST', '/v1/agent/chat', { message: `Marca uma reunião com a Carla ${run} amanhã às 15h` });
    expect(r.body.intent).toBe('calendar_create');
    const action = r.body.actions.find((a: any) => a.tool === 'create_calendar_event');
    expect(action.status).toBe('awaiting_confirmation');
    expect(r.body.reply).toMatch(/confirme/i);
    // nothing was created yet
    const tomorrow = new Date(Date.now() + 86_400_000);
    const from = new Date(tomorrow.getTime() - 86_400_000).toISOString();
    const to = new Date(tomorrow.getTime() + 86_400_000).toISOString();
    const before = await api(A.token, 'GET', `/v1/calendar/events?from=${from}&to=${to}`);
    expect(before.body.some((e: any) => e.title.includes(run))).toBe(false);
    // B cannot confirm A's action
    expect((await api(B.token, 'POST', `/v1/actions/${action.id}/confirm`, { approve: true })).status).toBe(404);
    const conf = await api(A.token, 'POST', `/v1/actions/${action.id}/confirm`, { approve: true }, { 'Idempotency-Key': `confirm-${action.id}` });
    expect(conf.body.status).toBe('succeeded');
    // retry with the same key replays, never double-executes
    const replay = await api(A.token, 'POST', `/v1/actions/${action.id}/confirm`, { approve: true }, { 'Idempotency-Key': `confirm-${action.id}` });
    expect(replay.headers.get('idempotent-replayed')).toBe('true');
    const after = await api(A.token, 'GET', `/v1/calendar/events?from=${from}&to=${to}`);
    expect(after.body.filter((e: any) => e.title.includes(run))).toHaveLength(1);
    const audit = await api(A.token, 'GET', '/v1/audit?limit=20');
    expect(audit.body.some((l: any) => l.action === 'action.confirmed_and_executed' && l.targetId === action.id)).toBe(true);
  });

  it('external actions without the integration are denied, never faked', async () => {
    const r = await api(A.token, 'POST', '/v1/actions/execute', { tool: 'send_email', input: { to: 'x@example.com', subject: 'Oi', body: 'Teste' } });
    expect(r.status).toBe(200);
    expect(r.body.action.status).toBe('rejected');
  });

  it('sensitive capabilities cannot be set to automatic', async () => {
    const r = await api(A.token, 'POST', '/v1/permissions', { capability: 'memory.delete', mode: 'auto' });
    expect(r.status).toBe(400);
  });
});

describe('Obsidian plugin (existing vault)', () => {
  it('connects with a vault token, pulls memories and pushes a tagged note', async () => {
    const c = await api(A.token, 'POST', '/v1/vaults/connect', { deviceLabel: 'Obsidian teste' });
    expect(c.status).toBe(201);
    const token = c.body.token as string;
    const pull = await fetch(`${API}/v1/plugin/memories`, { headers: { Authorization: `MaindyVault ${token}` } }).then((r) => r.json() as Promise<any>);
    expect(pull.memories.length).toBeGreaterThan(0);
    const push = await fetch(`${API}/v1/plugin/notes`, { method: 'POST', headers: { Authorization: `MaindyVault ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: 'Diario/hoje.md', title: `Senha da academia ${run}`, content: `A senha do armário da academia é 3344 (${run})` }) });
    expect(push.status).toBe(201);
    const s = await api(A.token, 'GET', `/v1/memories/search?q=${encodeURIComponent('armário da academia')}`);
    expect(s.body.some((h: any) => h.memory.source === 'vault')).toBe(true);
    // B never sees it, and a bad token is rejected
    const sb = await api(B.token, 'GET', `/v1/memories/search?q=${encodeURIComponent('armário da academia')}`);
    expect(sb.body.length).toBe(0);
    expect((await fetch(`${API}/v1/plugin/memories`, { headers: { Authorization: 'MaindyVault mdy_invalidinvalidinvalidinvalid' } })).status).toBe(401);
  });
});

describe('Talking to the assistant by name + "Sobre você"', () => {
  it('"Nico, guarda…" saves, "Nico, me lembra … às 18h" schedules, and the profile is kept', async () => {
    await api(A.token, 'PATCH', '/v1/agents/me', { name: 'Nico' });
    const save = await api(A.token, 'POST', '/v1/agent/chat', { message: `Nico, guarda essas informações: o portão do prédio novo abre com o código 7788 (${run})` });
    expect(save.body.intent).toBe('save_memory');
    expect(save.body.reply).toMatch(/7788/);
    expect(save.body.reply).not.toMatch(/Nico/);
    const remind = await api(A.token, 'POST', '/v1/agent/chat', { message: `Nico, me lembra de ligar para o contador às 18h` });
    expect(remind.body.intent).toBe('create_reminder');
    expect(remind.body.actions[0]).toMatchObject({ tool: 'create_reminder', status: 'succeeded' });
    expect(remind.body.reply).toMatch(/ligar para o contador/i);
    const about = await api(A.token, 'PUT', '/v1/profile/about', { work: `Sou designer de produto (${run})`, activities: 'Faço faculdade à noite', routine: 'Acordo às 6h30 e trabalho das 9h às 18h' });
    expect(about.status).toBe(200);
    const got = await api(A.token, 'GET', '/v1/profile/about');
    expect(got.body.work).toContain('designer');
    const ask = await api(A.token, 'POST', '/v1/agent/chat', { message: 'Que horas eu acordo?' });
    expect(ask.body.reply).toMatch(/6h30/);
    await api(A.token, 'PATCH', '/v1/agents/me', { name: 'MAINDY' });
  });

  it('auth gateway logs in through the API and blocks admin routes', async () => {
    const k = 'DEMO_USER_DEMO_002';
    const r = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY!, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env[`${k}_EMAIL`], password: env[`${k}_PASSWORD`] }) });
    const j = (await r.json()) as any;
    expect(r.status).toBe(200);
    expect(j.access_token).toBeTruthy();
    expect((await api(j.access_token, 'GET', '/v1/me')).status).toBe(200);
    const admin = await fetch(`${API}/auth/v1/admin/users`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } });
    expect(admin.status).toBe(404);
  });
});

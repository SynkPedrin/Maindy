import pg from 'pg';

/**
 * Database access.
 * - `withUser` runs a transaction as the Postgres role `authenticated` with the caller's JWT
 *   claims, so every query is filtered by Row Level Security (auth.uid()).
 * - `withService` runs without RLS and is reserved for system jobs (reminder dispatch,
 *   encrypted credentials, account deletion). It is never reachable with client input alone.
 */

pg.types.setTypeParser(1184, (v) => new Date(v).toISOString()); // timestamptz → ISO string
pg.types.setTypeParser(20, (v) => Number(v)); // int8 → number

export type Db = pg.PoolClient;

export interface UserClaims {
  sub: string;
  email?: string;
  role?: string;
  [k: string]: unknown;
}

export class Database {
  readonly pool: pg.Pool;

  constructor(connectionString: string) {
    // Hosted Supabase/pooler URLs carry `sslmode=require` (which node-postgres now treats as
    // verify-full, failing on the pooler's chain) plus vendor params such as `supa=`. Strip them
    // and set TLS explicitly instead.
    const remoteTls = /sslmode=require|supabase\.(co|com)/.test(connectionString);
    let cs = connectionString;
    if (remoteTls) {
      const u = new URL(connectionString);
      for (const p of ['sslmode', 'supa', 'pgbouncer', 'sslrootcert']) u.searchParams.delete(p);
      cs = u.toString();
    }
    this.pool = new pg.Pool({ connectionString: cs, max: Number(process.env.DB_POOL_MAX ?? 10), idleTimeoutMillis: 30_000, ssl: remoteTls ? { rejectUnauthorized: false } : undefined });
  }

  async withUser<T>(claims: UserClaims, fn: (db: Db) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [
        JSON.stringify({ ...claims, role: 'authenticated' }),
        claims.sub,
      ]);
      await client.query('set local role authenticated');
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async withService<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.pool.query('select 1');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

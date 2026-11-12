/**
 * Embedding provider for semantic memory search (pgvector, 384 dims).
 * Default: local multilingual MiniLM via transformers.js — runs on the server, no data leaves
 * it, no API key. The model is downloaded once (~120 MB) into the Hugging Face cache.
 */

export interface EmbeddingProvider {
  readonly id: string;
  readonly model: string;
  readonly dimensions: number;
  ready(): boolean;
  embed(texts: string[]): Promise<number[][]>;
}

const LOCAL_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'local';
  readonly model = LOCAL_MODEL;
  readonly dimensions = 384;
  private extractor: ((texts: string[], opts: Record<string, unknown>) => Promise<{ tolist(): number[][] }>) | null = null;
  private loading: Promise<void> | null = null;
  private failed: string | null = null;

  ready(): boolean {
    return this.extractor !== null;
  }

  lastError(): string | null {
    return this.failed;
  }

  warmUp(): Promise<void> {
    if (!this.loading) {
      this.loading = (async () => {
        try {
          const { pipeline } = await import('@huggingface/transformers');
          this.extractor = (await pipeline('feature-extraction', LOCAL_MODEL, { dtype: 'q8' })) as never;
          this.failed = null;
        } catch (err) {
          this.failed = (err as Error).message;
          this.loading = null;
          throw err;
        }
      })();
    }
    return this.loading;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.extractor) await this.warmUp();
    const out = await this.extractor!(texts, { pooling: 'mean', normalize: true });
    return out.tolist();
  }
}

/**
 * Serverless deployments (Vercel): embeddings come from the Supabase Edge Function `embed`
 * (built-in gte-small, 384 dims — same column size). Data stays inside the Supabase project.
 */
export class SupabaseEdgeEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'supabase';
  readonly model = 'gte-small';
  readonly dimensions = 384;
  constructor(private readonly supabaseUrl: string, private readonly serviceKey: string) {}
  ready() {
    return true;
  }
  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.supabaseUrl}/functions/v1/embed`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`embed function HTTP ${res.status}`);
    return ((await res.json()) as { vectors: number[][] }).vectors;
  }
}

/** Used when semantic search is disabled; retrieval falls back to full-text + entities. */
export class NoEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'none';
  readonly model = 'none';
  readonly dimensions = 384;
  ready() {
    return false;
  }
  async embed(): Promise<number[][]> {
    throw new Error('embeddings disabled');
  }
}

export function toVectorLiteral(v: number[]): string {
  return `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(6) : '0')).join(',')}]`;
}

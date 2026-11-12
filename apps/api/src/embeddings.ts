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

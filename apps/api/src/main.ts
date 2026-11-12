import { buildApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { LocalEmbeddingProvider } from './embeddings.js';
import { startScheduler } from './scheduler.js';

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[maindy-api] ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
  const { app, services } = await buildApp(config);

  if (!services.ai.configured) app.log.warn('ANTHROPIC_API_KEY not set: the agent runs in OFFLINE mode (deterministic local engine). Responses are flagged mode="offline".');
  else app.log.info({ model: services.ai.modelId }, 'Claude provider configured');
  if (!(await services.db.ping())) app.log.error('Database is not reachable — run `pnpm db:start`');

  if (services.embeddings instanceof LocalEmbeddingProvider) {
    services.embeddings.warmUp().then(
      () => app.log.info('local embedding model ready'),
      (err: Error) => app.log.warn({ err: err.message }, 'local embedding model unavailable; semantic search disabled until it loads'),
    );
  }
  const stopScheduler = config.schedulerEnabled ? startScheduler(services) : () => undefined;

  const shutdown = async () => {
    stopScheduler();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ port: config.port, host: config.host });
}

void main();

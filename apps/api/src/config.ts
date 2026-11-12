import { resolveModelConfig, type ModelConfig } from '@maindy/core';

/** Validated server configuration. Secrets only come from the process environment. */
export interface AppConfig {
  port: number;
  host: string;
  databaseUrl: string;
  supabaseUrl: string;
  supabaseJwtSecret: string | null;
  storageRoot: string;
  credentialsKey: string;
  anthropicApiKey: string | undefined;
  models: ModelConfig;
  voiceStudioUrl: string;
  elevenLabsApiKey: string | undefined;
  openAiApiKey: string | undefined;
  embeddingsProvider: 'local' | 'supabase' | 'none';
  serviceRoleKey: string | null;
  cronSecret: string | null;
  google: { clientId: string; clientSecret: string; redirectUri: string } | null;
  publicApiUrl: string;
  corsOrigins: string[];
  schedulerEnabled: boolean;
  logLevel: string;
}

export class ConfigError extends Error {}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const missing: string[] = [];
  const req = (k: string) => {
    const v = env[k]?.trim();
    if (!v) missing.push(k);
    return v ?? '';
  };
  const databaseUrl = req('DATABASE_URL');
  const supabaseUrl = req('SUPABASE_URL');
  const storageRoot = req('MAINDY_STORAGE_ROOT');
  const credentialsKey = req('MAINDY_CREDENTIALS_KEY');
  if (missing.length) throw new ConfigError(`Missing required environment variables: ${missing.join(', ')} (see .env.example)`);
  if (!/^[0-9a-f]{64}$/i.test(credentialsKey)) throw new ConfigError('MAINDY_CREDENTIALS_KEY must be 64 hex characters (32 bytes)');

  const port = Number(env.API_PORT ?? 4000);
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: env.GOOGLE_REDIRECT_URI ?? `http://localhost:${port}/v1/integrations/google/callback` }
      : null;

  return {
    port,
    host: env.API_HOST ?? '0.0.0.0',
    databaseUrl,
    supabaseUrl: supabaseUrl.replace(/\/+$/, ''),
    supabaseJwtSecret: env.SUPABASE_JWT_SECRET?.trim() || null,
    storageRoot,
    credentialsKey,
    anthropicApiKey: env.ANTHROPIC_API_KEY?.trim() || undefined,
    models: resolveModelConfig(env),
    voiceStudioUrl: (env.VOICESTUDIO_URL ?? 'http://127.0.0.1:3900').replace(/\/+$/, ''),
    elevenLabsApiKey: env.ELEVENLABS_API_KEY?.trim() || undefined,
    openAiApiKey: env.OPENAI_API_KEY?.trim() || undefined,
    embeddingsProvider: env.EMBEDDINGS_PROVIDER === 'none' ? 'none' : env.EMBEDDINGS_PROVIDER === 'supabase' ? 'supabase' : 'local',
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null,
    cronSecret: env.CRON_SECRET?.trim() || null,
    google,
    publicApiUrl: env.PUBLIC_API_URL ?? `http://localhost:${port}`,
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:8081,http://localhost:3100').split(',').map((s) => s.trim()).filter(Boolean),
    schedulerEnabled: env.MAINDY_SCHEDULER !== 'off',
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}

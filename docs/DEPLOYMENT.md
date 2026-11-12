# Implantação

## Backend

1. **Supabase em nuvem**
   - Crie um projeto, ative pgvector e rode as migrations: `pnpm exec supabase link --project-ref <ref>` e depois `pnpm exec supabase db push`.
   - Em `api.schemas`, mantenha somente `public` (o schema `maindy` não pode ser exposto).
   - Configure Auth: e-mail, Google/GitHub se quiser, e `site_url`/redirects com `maindy://` e o domínio web.
2. **API (container)**
   - Build e execução:
     ```bash
     docker build -f apps/api/Dockerfile -t maindy-api .
     docker run -p 4000:4000 -v maindy-vaults:/data --env-file production.env maindy-api
     ```
   - Variáveis em `.env.example`. Obrigatórias: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET` (ou JWKS), `MAINDY_STORAGE_ROOT=/data`, `MAINDY_CREDENTIALS_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (só para excluir contas) e `ANTHROPIC_API_KEY`.
   - Volume `/data`: são os vaults dos usuários. Use disco criptografado e faça backup diário.
   - Ponha a API atrás de um proxy HTTPS (Caddy, Nginx ou o load balancer do provedor) e defina `PUBLIC_API_URL` e `CORS_ORIGINS`.
   - Escala horizontal: o agendador é seguro com várias réplicas (`SKIP LOCKED`). Os vaults precisam de volume compartilhado ou de afinidade por usuário.
3. **Voz:** hospede o VoiceStudio num servidor com GPU (Docker do projeto) e aponte `VOICESTUDIO_URL`, ou configure `ELEVENLABS_API_KEY`/`OPENAI_API_KEY` e mude o provedor padrão no Voice Studio do app.

## App (EAS)

```bash
cd apps/mobile
npx eas init                 # cria o projectId (necessário para push)
npx eas build -p ios --profile preview
npx eas build -p android --profile preview
```

- Configure `EXPO_PUBLIC_API_URL` e `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` (públicos) como variáveis do EAS.
- iOS: precisa de uma conta Apple Developer. O widget e o App Group `group.com.maindy.app` exigem o target configurado (ver `docs/NATIVE.md`).
- Android: a sobreposição (`SYSTEM_ALERT_WINDOW`) e o `NotificationListenerService` exigem justificativa na Google Play.

## Desenvolvimento num aparelho real (rede local)

1. O Mac e o celular precisam estar no mesmo Wi-Fi.
2. Rode `pnpm db:start`, `pnpm dev:api` e depois `pnpm dev:mobile`.
3. Escaneie o QR com o **Expo Go**. Funciona para tudo, exceto o módulo nativo (orb flutuante, widget). O app descobre sozinho o IP do Mac pela URL do Metro.
4. Para os módulos nativos, use um development build (`npx expo run:ios --device` ou `npx expo run:android`), com espaço em disco suficiente.
5. O Supabase local escuta em `0.0.0.0:54321`, então o login funciona pelo IP do Mac.

## Vercel + Supabase na nuvem

**Em produção hoje:** API em `https://maindy-api.vercel.app` (projeto Vercel `maindy-api`, região gru1); Supabase `maindy` criado pela integração da Vercel (Marketplace) e ligado ao projeto. APK em `https://maindy-api.vercel.app/download`.

Atalho para tudo isso: `node scripts/deploy-cloud.mjs`. O script é idempotente e faz, nesta ordem:
- lê as variáveis da integração;
- aplica as migrations;
- define os segredos na Vercel, inclusive `ANTHROPIC_API_KEY`, se existir no `.env.local`;
- faz o build e o deploy;
- cria o usuário master;
- agenda o cron;
- grava a configuração pública do app em `.env.cloud` (0600, ignorado pelo git).

O APK que estiver em `~/MAINDY/downloads/maindy.apk` é publicado junto como arquivo estático. Sem a função `embed` (ela exige `supabase login`), a API roda com `EMBEDDINGS_PROVIDER=none`, ou seja, só com busca por texto.

### Supabase
1. Vincular o projeto e aplicar o banco: `pnpm exec supabase link --project-ref <ref>` e depois `pnpm exec supabase db push`. Isso aplica todas as migrations, inclusive a waitlist/consentimento da LP (`20261112100000`) e o cron (`20261112220000`).
2. Ativar a função de embeddings (gte-small, 384 dimensões): `pnpm exec supabase functions deploy embed --no-verify-jwt`. A própria função exige a service-role key.
3. Agendar os lembretes: `select maindy.schedule_reminder_dispatch('https://<api>.vercel.app/v1/internal/reminders/dispatch', '<CRON_SECRET>');`
4. Em Auth > URL Configuration, cadastrar como Redirect URLs `maindy://`, `https://<LP>/auth/callback`, `https://<LP>/**` e a URL do app web.
5. Google/GitHub: o callback dos provedores é `https://<ref>.supabase.co/auth/v1/callback`.

### API (projeto Vercel `maindy-api`, deploy pré-compilado)
```bash
pnpm --filter @maindy/core build
node scripts/build-vercel-api.mjs           # gera deploy/api/.vercel/output
cd deploy/api && npx vercel deploy --prebuilt --prod
```

Variáveis do projeto:
- `DATABASE_URL`: pooler do Supabase, porta 6543.
- `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (marcar como Sensitive).
- `MAINDY_CREDENTIALS_KEY`, `CRON_SECRET`, `ANTHROPIC_API_KEY`.
- Valores fixos: `MAINDY_STORAGE_ROOT=/tmp/maindy`, `EMBEDDINGS_PROVIDER=supabase`, `CORS_ORIGINS=*` e `MAINDY_SCHEDULER=off`. O cron fica com o Supabase.

### Landing page (projeto Vercel, Root Directory `apps/web`)
- Framework Next.js; `pnpm` é detectado pelo workspace; build `next build`. Não defina `NEXT_DIST_DIR`.
- Variáveis em Production e Preview:
  - `NEXT_PUBLIC_SITE_URL=https://<LP>`
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (Sensitive, nunca com prefixo `NEXT_PUBLIC_`; só a rota `/api/waitlist` usa)
  - `NEXT_PUBLIC_MAINDY_APP_URL`
  - `MAINDY_POLICY_VERSION=2026-11-12`
- O limitador de requisições da LP é em memória, ou seja, vale por instância da Vercel.

### App
O APK de produção é gerado com `EXPO_PUBLIC_API_URL=https://<api>.vercel.app`, `EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co` e `EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon>`.

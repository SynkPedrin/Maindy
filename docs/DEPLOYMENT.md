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

# MAINDY

Assistente pessoal com IA e segundo cérebro: guarda o que você diz (texto ou voz), lembra dias depois citando a origem, organiza tarefas, lembretes e agenda, e mantém um vault Obsidian por usuário.

- **Mobile:** Expo SDK 58 / React Native 0.88 (iOS, Android e Web).
- **API:** Fastify 5 + Supabase (Postgres 17, pgvector, RLS).
- **IA:** Claude (SDK oficial), com modo offline quando não há chave.
- **Voz:** VoiceStudio local, ElevenLabs ou OpenAI.

## Requisitos
- macOS ou Linux com Node 22+ (testado com 24), pnpm 9 e Docker.
- Opcional: VoiceStudio aberto (voz local), Xcode ou Android Studio (builds nativos).

## Instalar
```bash
pnpm install
pnpm --filter @maindy/core build
pnpm db:start                         # Supabase local (aplica as migrations)
cp .env.example .env.local            # preencha (veja docs/DEPLOYMENT.md); em dev:
#   SUPABASE_* e DATABASE_URL  ← pnpm exec supabase status
#   MAINDY_STORAGE_ROOT=~/MAINDY/development
#   MAINDY_CREDENTIALS_KEY     ← openssl rand -hex 32
#   ANTHROPIC_API_KEY          ← opcional (sem ela: modo offline)
```

## Rodar
```bash
pnpm dev:api                          # API em http://localhost:4000 (docs em /docs)
node scripts/dev-setup.mjs            # usuários demo user-demo-001/002 + vaults (senhas no .env.local)
pnpm master:create                    # usuário master (super@institutoalmada.org; senha no .env.local)
pnpm dev:mobile                       # Metro: QR para o Expo Go no celular (mesmo Wi-Fi)
pnpm --filter @maindy/mobile web      # ou no navegador: http://localhost:8081
```
Builds nativos (módulo do orb flutuante e widget iOS): `cd apps/mobile && npx expo run:ios` ou `npx expo run:android`.

Antes do Android, exporte:
```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME=~/Library/Android/sdk
```

## Testar
```bash
pnpm --filter @maindy/core test       # 54 testes (memória, tempo, permissões, vault, contrato Claude)
pnpm --filter @maindy/api test        # unitários da API
pnpm test:e2e                         # 18 cenários E2E contra a stack real (API + Supabase + vault + VoiceStudio)
pnpm --filter @maindy/mobile typecheck
```

## Obsidian
- Cada usuário tem um vault em `~/MAINDY/development/users/<uuid>/managed-vault`. Os links `user-demo-001` e `user-demo-002` facilitam o acesso.
- No Obsidian: **Abrir pasta como vault** e escolha essa pasta.
- Edições no Obsidian voltam para o app via **Ajustes › Vault › Sincronizar**.
- Para conectar um vault que você já tem, use o plugin em `apps/obsidian-plugin`: `pnpm --filter @maindy/obsidian-plugin build` e copie `manifest.json` + `main.js` para `<vault>/.obsidian/plugins/maindy/`.

## Testar no celular
Veja **`docs/CELULAR.md`**: APK Android via `http://<IP-do-Mac>:4000/download` e iPhone via Expo Go, com o celular no mesmo Wi-Fi do Mac.

## Documentação
| Documento | Assunto |
|---|---|
| `docs/ENVIRONMENT_AUDIT.md` | ambiente desta máquina |
| `docs/VOICESTUDIO_AUDIT.md` | o que o VoiceStudio oferece e como foi integrado |
| `docs/ARCHITECTURE.md` | módulos, fluxo do agente, memória, vault, voz e permissões |
| `docs/DATABASE.md` | schema, RLS e usuário master |
| `docs/API.md` | rotas |
| `docs/SECURITY.md` | segurança e LGPD |
| `docs/TESTING.md` | o que foi testado e o que não foi |
| `docs/DEPLOYMENT.md` | produção, EAS e uso no celular |
| `docs/KNOWN_LIMITATIONS.md` | limites de iOS e Android e integrações pendentes |
| `docs/NATIVE.md` | módulos nativos Android e iOS |
| `tools/asset-gen/README.md` | geração dos PNG da marca |

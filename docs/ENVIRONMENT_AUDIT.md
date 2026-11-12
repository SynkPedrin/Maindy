# Auditoria do ambiente

Data: 12/11/2026. Máquina: MacBook Air (Apple Silicon, arm64), macOS 26.6.2 (build 25G83).

## Ferramentas instaladas (verificadas por comando)

| Ferramenta | Versão | Observação |
|---|---|---|
| Node.js | 24.20.0 | `~/.local/toolchain/node` |
| npm | 11.19.0 | |
| pnpm | 9.9.0 | usado no monorepo (workspaces + Turborepo 2.11) |
| Python | 3.9.6 | Pillow 11.3 disponível |
| Git | 2.54.0 | |
| Xcode | 27.2 (27B52) | Command Line Tools em `/Applications/Xcode.app/Contents/Developer` |
| Android Studio | instalado | SDK em `~/Library/Android/sdk` (platform-tools, build-tools, ndk, emulator, system-images) |
| Docker | 29.6.1 | daemon ativo |
| Supabase CLI | 2.122.1 | instalado como devDependency do repositório (`pnpm exec supabase`) |
| Expo | SDK 58 (`expo@58.0.24`) | instalado no app; não há CLI global |
| Claude Code | 2.1.312 | |
| Obsidian | 1.12.7 | `/Applications/Obsidian.app` |
| VoiceStudio | 0.5.7 | `/Applications/VoiceStudio.app` (ver `VOICESTUDIO_AUDIT.md`) |

## Ausentes

| Item | Impacto | Ação |
|---|---|---|
| Java (JDK) no PATH | `expo run:android` precisa de um JDK | Usar o JBR do Android Studio: `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"` |
| `ANDROID_HOME` | builds Android | `export ANDROID_HOME=~/Library/Android/sdk` |
| Watchman | opcional (Metro usa o watcher do Node) | não instalado |
| Bun | não necessário | não instalado |
| Supabase CLI global | não necessário | usamos `pnpm exec supabase` |
| `ANTHROPIC_API_KEY` | o agente roda em modo offline | ver `KNOWN_LIMITATIONS.md` |

Nada foi instalado com privilégios de administrador nem alterou configuração do sistema.

## Disco

- 460 GB no total, cerca de 17 a 27 GB livres durante o trabalho (uso de 94 a 97%).
- Por isso foram desativados no Supabase local: Studio, Realtime, Storage, Edge Runtime e Analytics.
- Um build nativo iOS (Pods + DerivedData) ou Android (Gradle) consome de 5 a 15 GB. Libere espaço antes de rodá-lo.

## Portas

| Porta | Situação |
|---|---|
| 3001 | ocupada (processo Node de outro projeto) |
| 5432 e 6379 | ocupadas por containers de outro projeto (`orvyn-postgres`, `orvyn-redis`), que não foram tocados |
| 54321, 54322 e 54324 | Supabase local do MAINDY (API, Postgres, Mailpit) |
| 4000 | API do MAINDY |
| 8081 | Metro / Expo Web |
| 3100 | landing page (`apps/web`, outra sessão) |
| 3900 | VoiceStudio (API local) |

## Serviços reaproveitados

- Imagens Docker do Supabase que já existiam em cache.
- VoiceStudio (síntese e transcrição locais em pt-BR, verificadas).
- Obsidian.

Não há Redis dedicado: a fila de lembretes usa o próprio Postgres (`FOR UPDATE SKIP LOCKED`), descrito em `ARCHITECTURE.md`.

## Obsidian

- Vault pessoal existente: `/Users/pedro/Downloads/DESENVOLVIMENTO`. **Não foi lido, alterado nem reorganizado.**
- Raiz de desenvolvimento do MAINDY: `~/MAINDY/development/`, que não é um vault. Estrutura:
  - `users/<uuid>/managed-vault`, um vault por usuário;
  - links legíveis `users/user-demo-001` e `users/user-demo-002` apontando para os vaults dos usuários demo;
  - `system/templates`, `system/schemas` e `backups`.
- Para abrir no Obsidian: *Abrir pasta como vault* → `~/MAINDY/development/users/user-demo-001/managed-vault`. A URI `obsidian://open?path=` não registra vaults novos, e por isso o `obsidian.json` não foi editado.

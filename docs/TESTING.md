# Testes

Todos os números abaixo vêm de execuções reais nesta máquina, em 12/11/2026.

| Suíte | Comando | Resultado |
|---|---|---|
| Core (unitários + contrato Claude) | `pnpm --filter @maindy/core test` | **54/54** |
| API (unitários) | `pnpm --filter @maindy/api test` | **6/6** |
| API (E2E contra a stack real) | `pnpm test:e2e` | **18/18** |
| Mobile (unitários) | `pnpm --filter @maindy/mobile test` | **2/2** |
| Typecheck | `tsc --noEmit` em core, api, mobile e plugin | sem erros |
| Bundles Metro | iOS, Android e Web | compilam (11,2 / 11,2 / 9,6 MB) |
| **Android (build real + emulador)** | `./gradlew :app:assembleDebug` (arm64) e APK no AVD Pixel 9 Pro (Android 37) | BUILD SUCCESSFUL (7m54s), com o módulo `maindy-native` compilado contra o expo-modules-core real. No emulador: login, Home com dados reais, orb flutuante ativado sobre a tela inicial (serviço em primeiro plano ativo; toque abre a Assistente), memória salva e recuperada com origem, sessão mantida após reiniciar o app |
| UI web (Chrome headless, 390×844) | script puppeteer | login, onboarding (6 passos com demonstração real), Home, Assistente, Memórias, Agenda e Ajustes renderizados sem erro de console |

## Unitários (`packages/core/test`)
- **Memória:**
  - intenção em pt-BR (16 frases);
  - extração (pessoa e preferência do exemplo da mãe, compromisso, hábito, fato semântico, nomes próprios);
  - assunto de lembretes e tarefas.
- **Tempo:**
  - fuso de São Paulo e Nova York (horário de verão);
  - expressões ("daqui a 20 minutos", "amanhã às 9h", "sexta às 15h", "às 7 da noite", "dia 25/12");
  - RRULE (diária, semanal com BYDAY, mensal pulando meses sem o dia, COUNT, UNTIL).
- **Permissões:**
  - padrões por nível;
  - auto-salvar desligado;
  - integração ausente;
  - concessão mais recente vence;
  - concessão revogada ou expirada;
  - nível 4 sempre confirma;
  - capacidade desconhecida.
- **Vault:**
  - ida e volta do frontmatter;
  - conteúdo malicioso neutralizado;
  - enums inválidos rejeitados;
  - vaults independentes e não aninhados;
  - path traversal;
  - versionamento;
  - os 5 casos do `planSync`;
  - zip sem o histórico interno.
- **Contrato Claude** (HTTP interceptado; não chama a API real):
  - formato da requisição (modelo, effort, sem `thinking.disabled`, sem `tool_choice` forçado, ferramentas `strict`, cache no system, beta e `fallbacks:"default"`);
  - loop de ferramentas;
  - recusa;
  - 429 com retry e 401 sem retry.

## E2E (`apps/api/test/e2e/scenarios.test.ts`)
Pré-requisitos: `pnpm db:start`, `pnpm dev:api`, `node scripts/dev-setup.mjs` e o VoiceStudio aberto.

- **A. Segundo cérebro:**
  - a frase "Minha mãe prefere…" é salva pelo agente, ligada a "Mãe" e espelhada no vault;
  - um login novo pergunta e recebe a resposta com a origem;
  - a busca semântica funciona com outras palavras;
  - pergunta sobre ação física sem registro recebe resposta honesta;
  - edição feita no arquivo do Obsidian volta para o banco (versão `vault_sync`).
- **B. Isolamento:**
  - B não lê, edita nem apaga a memória de A (404);
  - a busca e o agente de B não vazam dados;
  - token ausente ou forjado recebe 401;
  - RLS direto no Postgres (SELECT/UPDATE vazios, INSERT bloqueado, `provider_credentials` negado);
  - PostgREST não expõe o schema;
  - os exports dos vaults são separados.
- **C. Voz:** pergunta falada em pt-BR (síntese real no VoiceStudio) → transcrição → agente → resposta falada.
- **D. Lembrete:**
  - criar, persistir, ser despachado pelo agendador (entregue) e concluir;
  - lembrete criado por linguagem natural.
- **E. Permissão:**
  - evento pedido ao agente fica aguardando confirmação;
  - B não consegue confirmar a ação de A;
  - a confirmação executa;
  - repetir com a mesma `Idempotency-Key` não duplica;
  - a auditoria registra.
- Ação externa sem integração é rejeitada (não é simulada) e nível 4 não aceita `auto`.
- **Plugin Obsidian:** token, pull, push de nota e 401 com token inválido.

## O que **não** foi testado aqui
- Chamada real à API do Claude (não há `ANTHROPIC_API_KEY`). O caminho com Claude foi validado pelo teste de contrato; o caminho offline, pelo E2E.
- **iOS:** nenhum build com `pod install`/`xcodebuild`, nem simulador, por falta de disco. O Swift do widget, dos intents e do módulo foi verificado só por typecheck (ver `docs/NATIVE.md`).
- **Android em aparelho físico:** não testado; foi usado o emulador. Também não foram testados o filtro de notificações, as estatísticas de uso nem segurar o orb flutuante para falar.
- O cenário C no aparelho (microfone real, interrupção sonora). A interrupção está implementada no app (`useVoiceSession.interrupt`), mas só foi verificada por leitura de código.
- Notificação local e push em aparelho, Google OAuth (sem credenciais), ElevenLabs e OpenAI (sem chaves).

# Arquitetura

```text
maindy/
├── apps/
│   ├── mobile/            Expo SDK 58 + React Native 0.88 + Expo Router (iOS, Android, Web)
│   │   ├── app/           telas (rotas)
│   │   ├── src/           tema, componentes (Orb, VoiceButton, ui), libs (api, voz, notificações, sessão)
│   │   ├── assets/        biblioteca PNG original (tools/asset-gen)
│   │   ├── modules/       módulo nativo maindy-native (Kotlin/Swift) — ver docs/NATIVE.md
│   │   └── targets/       widget iOS / App Intents
│   ├── api/               Fastify 5 (TypeScript) — única porta de entrada para dados e IA
│   ├── obsidian-plugin/   plugin para conectar um vault existente
│   └── web/               landing page + cadastro (outra sessão)
├── packages/core/         lógica de negócio sem UI: contratos, memória, vault, permissões, agente, voz, tempo
├── supabase/              config local + migrations (Postgres 17, pgvector, RLS)
├── tools/asset-gen/       gerador reprodutível dos PNG (SVG → PNG)
└── scripts/               dev-setup, usuário master
```

## Fluxo de uma mensagem

```text
App (texto ou voz)
  └─ POST /v1/agent/chat | /v1/agent/voice  (JWT Supabase)
       └─ API: verifica JWT → transação com SET LOCAL ROLE authenticated + claims (RLS ativo)
            └─ AgentOrchestrator (packages/core)
                 1. Detecção de intenção (pt-BR, determinística)
                 2. Construção de contexto (perfil, persona, fuso, histórico recente)
                 3. Recuperação de memória (busca híbrida)
                 4. Planejador
                    • Claude configurado → loop de ferramentas (Messages API, strict tools)
                    • sem Claude / falha  → planejador offline determinístico
                 5. Validação de permissão (Permission Engine) por ferramenta
                 6. Execução tipada (ToolExecutor → AgentPort; savepoint por ferramenta)
                 7. Validação de resultado (datas no passado, RRULE, intervalos)
                 8. Resposta + referências de memória com origem
                 9. Atualização de memória (save_memory) + auditoria
```

O LLM nunca executa SQL, shell nem acessa arquivos. Ele só chama as 13 ferramentas tipadas de `packages/core/src/agent/tools.ts`, todas validadas com Zod.

## Memória

- Fonte da verdade: `maindy.memories` (Postgres). Cada memória tem tipo, categoria, `source`, `provenance` (`user_confirmed`, `ai_inferred`, `external` ou `unverified`), confiança, frase original, versão e pessoas ligadas (`memory_people`).
- Indexação:
  - `tsvector` em português com `unaccent` (coluna gerada);
  - embedding de 384 dimensões (`paraphrase-multilingual-MiniLM-L12-v2`, roda localmente na API via transformers.js; nenhum dado sai do servidor);
  - índice HNSW (pgvector).
- Busca híbrida (`maindy.search_memories`, `SECURITY INVOKER`, portanto sob RLS). Combina:
  - rank textual com OR de lexemas;
  - similaridade semântica acima de um piso de ruído;
  - relação com pessoas citadas na pergunta;
  - recência (decaimento de 60 dias);
  - confiança;
  - procedência.
- Duplicatas: o mesmo fato com texto idêntico não vira duas memórias.
- Regras de resposta:
  - sempre cita a origem e a data;
  - nunca afirma ação física ("tranquei a porta") sem registro confirmado, e mesmo assim diz "você registrou";
  - conteúdo recuperado é tratado como dado não confiável (escapado e delimitado).

## Vault Obsidian

- Um vault por usuário em `<MAINDY_STORAGE_ROOT>/users/<uuid>/managed-vault`, com as pastas `00-Profile` a `09-Archive`. A raiz de armazenamento não é um vault (sem vaults aninhados).
- Escrita imediata (write-through): cada memória vira Markdown com frontmatter. Pessoas viram notas em `02-People` com backlinks.
- Versões anteriores ficam em `.maindy/history/<id>/`.
- Sincronização bidirecional (`POST /v1/vaults/sync`, planejador puro `planSync`):
  - edição feita no Obsidian é importada;
  - mudança feita no app reescreve o arquivo;
  - conflito: o banco vence e a versão do arquivo é guardada em `09-Archive/Conflitos`;
  - nota nova em `03-Memories` vira memória;
  - arquivo órfão é removido.
- Exportação em `.zip`.
- Vault existente: plugin Obsidian com token por aparelho (`/v1/plugin/*`).

## Agente e IA

- `AIProvider` (interface) com `AnthropicProvider` (SDK oficial `@anthropic-ai/sdk` 1.8):
  - modelo vindo do registro (`MAINDY_MODEL`, padrão `claude-opus-5-5`);
  - pensamento adaptativo (padrão do modelo) e `output_config.effort`;
  - `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) para recusas;
  - cache do prefixo estável do system prompt;
  - erros tipados mapeados para `AIUnavailableError` (com retry ou não);
  - registro de uso e custo em `usage_records`.
- Sem chave, o modo offline continua funcional (salvar, lembrar, lembretes, tarefas, agenda, foco), e cada resposta é marcada `mode: "offline"`.

## Voz

- `VoiceProvider` (interface) com VoiceStudio (local), ElevenLabs e OpenAI Audio.
- Fluxo push-to-talk (`useVoiceSession`):
  - estados: `idle → pressed → listening → processing → speaking → interrupted/error`;
  - medidor de nível alimenta o orb;
  - haptics, cancelamento arrastando o dedo e interrupção com um toque.
- O áudio é enviado uma vez e descartado. Não é armazenado.

## Permissões (autonomia adaptativa)

| Nível | O que cobre |
|---|---|
| 0 | consultar |
| 1 | organizar/salvar |
| 2 | ações reversíveis |
| 3 | comunicação externa |
| 4 | sensível ou irreversível |

- Cada capacidade tem um padrão. O usuário concede ou revoga por capacidade e por integração, com expiração opcional. O nível 4 sempre pede confirmação.
- A permissão só nasce da UI autenticada. Nenhuma ferramenta do agente cria permissões, e o banco força `granted_via = 'user_ui'`.
- Ações que pedem confirmação viram `action_executions` em `awaiting_confirmation` (expiram em 24 h). Confirmar executa pelo mesmo caminho tipado, com idempotência.

## Lembretes

- Ao criar, o app agenda uma notificação local (funciona offline).
- O agendador da API roda a cada 30 s:
  - pega os lembretes vencidos com `FOR UPDATE SKIP LOCKED` (seguro com várias instâncias);
  - envia push Expo para os aparelhos do usuário;
  - marca como entregue;
  - lembretes recorrentes avançam pela RRULE (`DAILY`, `WEEKLY`/`BYDAY`, `MONTHLY`, `YEARLY`, `COUNT`, `UNTIL`), sempre no fuso do lembrete.

## Decisões em relação à especificação

| Especificado | Usado | Motivo |
|---|---|---|
| NativeWind | tokens de design + `StyleSheet` | NativeWind 4 não foi validado com React Native 0.88 / Reanimated 4. Os tokens ficam centralizados em `src/theme.ts` |
| Redis para filas | Postgres | a única fila atual (lembretes) roda bem com `SKIP LOCKED`, e há uma peça a menos para operar |
| Sentry / OpenTelemetry | não integrados | precisam de conta ou DSN. Os logs são estruturados (pino) com redação de segredos |
| Supabase Storage | não usado | o áudio não é guardado e os vaults ficam no disco do servidor |
| Lottie / Rive | não usados | as animações são Reanimated sobre a arte PNG por estado |

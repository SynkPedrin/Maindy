# API (v1)

- Base: `http://<host>:4000`.
- Documentação interativa OpenAPI: **`/docs`**.
- Autenticação: `Authorization: Bearer <access_token do Supabase>`. Rotas públicas: `/v1/health`, o callback OAuth do Google e `/v1/plugin/*`, que usa token próprio.

Convenções:
- JSON nas requisições e respostas; erros no formato `{ "error": "<código>", "message": "<pt-BR>" }`.
- `Idempotency-Key` aceito nas rotas de criação, confirmação e chat. Uma repetição com o mesmo corpo devolve a resposta original com o header `Idempotent-Replayed: true`; com outro corpo, devolve 422.
- Limite de requisições: 240/min por token, 30/min para o agente, 20/min para prévia de voz.

## Agente
| Método | Rota | Descrição |
|---|---|---|
| POST | `/v1/agent/chat` | `{message, conversationId?, inputMode?}`. Devolve `ChatResponse`: `reply`, `memoryRefs` (com procedência), `actions`, `suggestions`, `mode` (`claude`/`offline`) e `intent` |
| POST | `/v1/agent/voice` | multipart: `audio` (m4a/wav/webm), `conversationId?`, `speak?`. Devolve `transcript`, `transcriptionProvider`, o `ChatResponse` e `speech {audioBase64, mimeType}` |
| GET | `/v1/agent/conversations` | lista conversas |
| GET | `/v1/agent/conversations/:id/messages` | mensagens de uma conversa |

## Ações e permissões
| Método | Rota | Descrição |
|---|---|---|
| POST | `/v1/actions/plan` | avalia `{tool, input}` na Permission Engine, sem executar |
| POST | `/v1/actions/execute` | executa pelo mesmo caminho do agente (permissões e auditoria aplicadas) |
| GET | `/v1/actions?status=` | lista ações |
| POST | `/v1/actions/:id/confirm` | `{approve}`: confirma e executa, ou rejeita |
| GET / POST | `/v1/permissions` | catálogo de capacidades e concessões / concede (`auto`, `confirm` ou `deny`; nível 4 nunca aceita `auto`) |
| DELETE | `/v1/permissions/:id` | revoga |
| GET | `/v1/audit` | registro de auditoria do usuário |

## Memórias e vault
| Método | Rota | Descrição |
|---|---|---|
| POST | `/v1/memories` | `{content, title?, type?, category?, tags?, people?, source?}`. Faz extração automática dos campos que não vierem |
| GET | `/v1/memories/search?q=` | busca híbrida |
| GET | `/v1/memories?category&type&personId&before&limit` | lista com filtros |
| GET / PATCH / DELETE | `/v1/memories/:id` | detalhe (com versões) / editar / apagar (inclusive o arquivo no vault) |
| GET | `/v1/people` | pessoas e contagem de memórias |
| POST | `/v1/vaults/provision` | cria o vault gerenciado |
| POST | `/v1/vaults/sync` | sincronização bidirecional |
| GET | `/v1/vaults/export` | `.zip` do vault |
| POST | `/v1/vaults/connect` | token do plugin (mostrado uma vez) |
| GET / POST | `/v1/plugin/memories` / `/v1/plugin/notes` | uso do plugin, com `Authorization: MaindyVault mdy_…` |

## Organização
| Método | Rota | Descrição |
|---|---|---|
| GET / POST | `/v1/tasks` | listar / criar |
| PATCH | `/v1/tasks/:id` | atualizar |
| POST / GET | `/v1/reminders` | criar (`remindAt`, `timezone`, `recurrenceRule` RRULE) / listar |
| POST | `/v1/reminders/:id/complete` | concluir; o recorrente avança para a próxima ocorrência |
| POST | `/v1/reminders/:id/snooze` | adiar |
| DELETE | `/v1/reminders/:id` | cancelar |
| GET / POST | `/v1/calendar/events` | listar / criar |
| DELETE | `/v1/calendar/events/:id` | apagar |
| GET / POST | `/v1/focus` | modo de foco atual / iniciar ou encerrar |
| GET | `/v1/home` | resumo do dia |

## Conta, voz e integrações
| Método | Rota | Descrição |
|---|---|---|
| GET / PATCH | `/v1/me` | perfil, agente e configurações / atualizar perfil |
| POST | `/v1/agents` | cria o agente |
| GET / PATCH | `/v1/agents/me` | ler / atualizar o agente |
| GET / PATCH | `/v1/settings` | configurações |
| GET | `/v1/voice/providers` | provedores e saúde |
| GET | `/v1/voice/voices?provider=` | vozes |
| POST | `/v1/voice/preview` | sintetiza uma prévia; devolve áudio |
| GET | `/v1/integrations` | lista |
| POST | `/v1/integrations/:provider/connect` | devolve a URL OAuth (Google) |
| DELETE | `/v1/integrations/:provider` | desconectar |
| GET | `/v1/weather?lat&lon` | clima real (Open-Meteo) |
| POST / GET | `/v1/devices` | registrar / listar aparelhos |
| DELETE | `/v1/devices/:id` | revogar aparelho |
| GET | `/v1/privacy/export` | exporta todos os dados (JSON) |
| POST | `/v1/consents` | registra consentimento |
| DELETE | `/v1/account` | `{confirm:"APAGAR"}`: apaga a conta e todos os dados |
| GET | `/v1/admin/stats` | só usuário master; métricas agregadas |
| GET | `/v1/health` | estado de banco, IA, voz e embeddings |

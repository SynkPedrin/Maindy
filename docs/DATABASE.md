# Banco de dados

Postgres 17 (Supabase local), com as extensões `vector` (pgvector), `unaccent` e `pgcrypto`. Todos os dados pessoais ficam no schema **`maindy`**, que **não é exposto pelo PostgREST**: só a API acessa.

## Migrations (`supabase/migrations`)

| Arquivo | Conteúdo |
|---|---|
| `20261112000001_core_schema.sql` | tabelas, enums, índices (GIN para full-text, HNSW para vetores), triggers, bootstrap de novo usuário |
| `20261112000002_rls_and_search.sql` | grants mínimos, RLS + `FORCE` em todas as tabelas, políticas, busca híbrida |
| `20261112100000_web_waitlist_consent.sql` | waitlist e RPCs de consentimento da landing page (outra sessão) |
| `20261112200000_profile_name_from_oauth.sql` | nome do perfil a partir de `full_name`/`name` (Google/GitHub) |
| `20261112200100_function_grants.sql` | `EXECUTE` das funções usadas por colunas geradas e triggers |
| `20261112200200_memories_touch_ignores_vault_state.sql` | gravar o estado do vault não altera `updated_at` |

Comandos: `pnpm db:start`, `pnpm db:reset` (recria tudo e é destrutivo para os dados locais) e `pnpm exec supabase migration up`.

## Entidades

Todas têm `user_id → auth.users ON DELETE CASCADE`.

- **Perfil e agente:** `profiles` (role `user`/`master` sincronizado de `app_metadata`), `agents`, `agent_settings` (privacidade: `store_audio=false`, `allow_model_training=false` por padrão), `consents`.
- **Vault:** `vaults`, `vault_connections` (guarda só o hash do token).
- **Memória:**
  - `memories` (tipo, categoria, `source`, `provenance`, confiança, `original_utterance`, versão, `vault_path`/`vault_hash`, `fts` gerado);
  - `memory_versions`, `memory_people`, `people`;
  - `memory_embeddings` (vector(384) + HNSW).
- **Organização:** `tasks`, `reminders` (fuso + RRULE), `calendar_events`, `routines`, `focus_sessions`, `notification_rules`.
- **Integrações e permissões:** `permissions` (`granted_via` só pode ser `user_ui`), `integrations`, `provider_credentials` (AES-256-GCM, **sem nenhuma política para clientes**), `devices`.
- **Execução:** `conversations`, `conversation_messages`, `action_executions`, `idempotency_keys`, `usage_records`, `audit_logs` (só acréscimo, garantido por trigger).

## Como o RLS vale também para a API

Em toda requisição de usuário, `Database.withUser()` abre uma transação e executa:

```sql
select set_config('request.jwt.claims', '<claims do JWT verificado>', true);
set local role authenticated;
```

Assim `auth.uid()` vale para cada consulta e as políticas filtram tudo, mesmo que a API tenha um bug.

O contexto de serviço (sem RLS) fica restrito a três usos:
- o agendador de lembretes;
- as credenciais criptografadas;
- as métricas agregadas do usuário master.

As tabelas com referências cruzadas (`memory_people`, `memory_embeddings`, `tasks.source_memory_id`, `reminders.task_id`, `conversation_messages`, `action_executions`, `vault_connections`) também verificam, no `WITH CHECK`, que a linha referenciada pertence ao usuário.

## Usuário master

- Criado em `auth.users` com `app_metadata.role = "master"` (`pnpm master:create`). O trigger replica o valor para `profiles.role`. O cliente não consegue mudar nenhum dos dois.
- O que ele acessa: **apenas métricas agregadas** (`GET /v1/admin/stats`). Não tem acesso ao conteúdo de outros usuários.

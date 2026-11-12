# Segurança e privacidade

## Isolamento entre usuários
- **RLS + `FORCE ROW LEVEL SECURITY`** em todas as tabelas pessoais. A API executa as consultas de usuário como o papel `authenticated`, com as claims do JWT. A política vale mesmo se houver bug na API.
- O schema `maindy` não fica exposto pelo PostgREST. Não há acesso direto do cliente ao banco.
- `provider_credentials` não tem nenhuma política para clientes: qualquer `SELECT` como usuário dá *permission denied* (teste E2E).
- Vaults: um diretório por usuário (`users/<uuid>/managed-vault`, permissão 0700). As chaves de armazenamento são validadas e qualquer caminho é confinado ao vault, contra path traversal (teste unitário).
- A busca de memória roda sob RLS (`SECURITY INVOKER`). As memórias de um usuário nunca entram no contexto de outro (teste E2E "Scenario B").

## Credenciais e segredos
- As chaves (Anthropic, ElevenLabs, OpenAI, Google, service role) **só existem no servidor**, em `.env.local` (git-ignored, permissão 0600) ou nos secrets do provedor de hospedagem.
- O app recebe apenas valores públicos: URL da API e chave *anon* do Supabase.
- Tokens OAuth são criptografados com AES-256-GCM (`MAINDY_CREDENTIALS_KEY`) antes de chegar ao banco.
- A sessão do usuário no aparelho fica no Keychain/Keystore (`expo-secure-store`).
- Os logs ocultam `Authorization`, cookies e `Idempotency-Key`. Erros 5xx passam por `redact()` e o cliente nunca recebe stack trace.
- Faltando um segredo obrigatório, a API não sobe (`ConfigError`).

## Autonomia e auditoria
- Toda ação passa pela Permission Engine (níveis 0 a 4). Nível 4 sempre pede confirmação; comunicação externa pede confirmação por padrão.
- O agente não concede permissões a si mesmo: não existe ferramenta para isso, e o banco aceita apenas `granted_via = 'user_ui'`.
- `audit_logs` é só de acréscimo (trigger bloqueia `UPDATE`/`DELETE`). A exclusão de conta é a única exceção controlada.
- Idempotência nas confirmações, para que repetir a requisição não execute a ação duas vezes (teste E2E).

## Prompt injection
- Memórias, notas, e-mails e eventos entram no prompt escapados (`‹ ›`) e dentro de blocos `<memory>` e similares, marcados como dados. O system prompt proíbe seguir instruções vindas deles.
- Frases suspeitas geram auditoria `agent.injection_suspected`.
- O modelo só age por 13 ferramentas tipadas, com validação Zod e checagem semântica. Não há shell, SQL nem acesso a arquivos.

## Privacidade (LGPD)
- O áudio não é guardado: é transcrito e descartado (`store_audio=false` por padrão).
- Conteúdo pessoal não é usado para treinar modelos (`allow_model_training=false`).
- Conteúdo de notificações de terceiros nunca vai para a IA sem opt-in explícito (`forward_notification_contents=false`).
- Consentimentos versionados (`consents`), exportação completa (`/v1/privacy/export` e `.zip` do vault) e exclusão total (`DELETE /v1/account`).
- Gerenciamento de aparelhos com revogação.

## Pendências para produção
Ver `KNOWN_LIMITATIONS.md`:
- HTTPS no proxy;
- criptografia em repouso do volume dos vaults;
- rotação de `MAINDY_CREDENTIALS_KEY` (o campo `key_version` já existe);
- pentest externo.

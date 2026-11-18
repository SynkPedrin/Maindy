# Regras comuns para workstreams (agentes) da MAINDY

1. Repo: /Users/pedro/Documents/maindy. Leia antes: docs/ARCHITECTURE.md, packages/contracts/src/index.ts, packages/design-system/src/index.ts, MAINDY_Codex_Kit/PROMPT_MESTRE_MAINDY.md (spec do produto), docs/research/*.md.
2. Edite SOMENTE os diretórios do seu workstream. `packages/contracts` é compartilhado: mudanças só ADITIVAS e mínimas (campo opcional novo, novo schema), rode `pnpm --filter @maindy/contracts build` depois, e liste a mudança no relatório final.
3. Dependências: NUNCA rode `pnpm install`/`pnpm add` diretamente (há outros agentes instalando ao mesmo tempo). Use: `node scripts/pnpm-locked.mjs add <pkg> --filter <seu-pacote>` (serializa com lock).
4. Textos de UI, e-mails e docs comerciais em português do Brasil; código, nomes e contratos em inglês. Marca sempre `maindy.` em lowercase nos textos.
5. Honestidade de dados: nunca invente economia, clientes, depoimentos, cotas ou integrações concluídas. Todo número mostra a origem (`MeasurementSource`). Demonstrações sempre rotuladas "Demonstração — dados simulados" e nunca gravadas em tenant real.
6. Segurança: nunca logar prompts, segredos, cookies ou tokens. Segredos fora do git.
7. NÃO faça commit, NÃO mexa no índice git, NÃO restaure arquivos apagados do projeto antigo, NÃO faça deploy nem publique nada externamente, NÃO use as credenciais de .env.cloud/.env.local (pertencem ao produto antigo).
8. Infra local já rodando: Postgres 127.0.0.1:5433 (user maindy / senha maindy_dev, bancos `maindy` e `maindy_test`), Mailpit SMTP 1025 / UI+API http://127.0.0.1:8025, Ollama http://127.0.0.1:11434 (modelo `qwen3.5:4b`, provedor real local e gratuito para testes). Portas: web 3100, api 4100, gateway 8787.
9. Servidores longos: rode em background, com log no scratchpad, e mate o processo ao final. Arquivos temporários: /private/tmp/claude-501/-Users-pedro-Documents-maindy/a9cbe3f3-e6b1-41da-8b0c-b20d8411bbdc/scratchpad
10. Definição de pronto: código real + persistência + teste + tratamento de erro. Rode typecheck e testes do seu pacote antes de terminar.
11. Relatório final (≤ 600 palavras): o que funciona VERIFICADO (com o comando que provou), o que ficou faltando ou bloqueado e por quê, comandos para rodar, mudanças em pacotes compartilhados.

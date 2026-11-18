# maindy. — instruções para agentes de IA neste repositório

Este repositório é o **case 0** da maindy.: aplicamos o ORBIT Engine ao nosso próprio uso de IA e medimos o resultado ([docs/cases/case-000-maindy](docs/cases/case-000-maindy/README.md)). O baseline mostrou que **99% dos tokens de entrada são contexto reenviado** (média de 377 mil tokens por chamada). Por isso, trabalhe com contexto enxuto.

## Higiene de contexto (intervenção R1)

- **Uma tarefa por sessão.** Ao terminar uma tarefa e começar outra sem relação, sugira `/clear` em vez de continuar na mesma conversa.
- **Compacte cedo.** Quando o contexto passar de ~50% (a status line da maindy. mostra `ctx %`), sugira `/compact` com um resumo do que importa.
- **Leia por trecho.** Use `offset`/`limit` ou busque o símbolo antes de ler arquivos grandes inteiros. Não releia um arquivo que já está no contexto e não mudou.
- **Saídas de comando curtas.** Filtre com `tail`, `head` ou `grep`; não despeje logs inteiros, listagens de `node_modules` ou JSON enorme no contexto.
- **Não repita o que já foi estabelecido.** Resuma decisões em uma linha em vez de reproduzir blocos longos.

## Buscas amplas em subagentes (intervenção B1)

- Varreduras por muitos arquivos, "onde está X", leitura de documentação longa: delegue a um subagente de exploração e traga só a conclusão.
- Trabalho mecânico e repetitivo (renomear em lote, coletar números): subagente, não o contexto principal.

## Qualidade (critério T do case)

Economizar não vale se piorar a entrega. Antes de dar uma tarefa como pronta:

- `pnpm typecheck` sem erros nos pacotes tocados;
- testes do que foi alterado passando (web: `apps/web/e2e/landing.spec.ts` para a landing; API/gateway: `vitest`).

## Ambiente desta máquina

- O repositório está em `~/Documents`, que o iCloud "otimiza": arquivos podem estar fora do disco (`dataless`). Se um comando travar lendo arquivos, `cat arquivo > /dev/null` traz o arquivo de volta.
- Neste shell `grep` é um alias do `ugrep`; em pipes use `/usr/bin/grep`.
- `git diff`/`status` com muitos arquivos: use `--no-renames` (a detecção de renomeações é lenta).

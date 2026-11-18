# Cases maindy.

Cada case documenta a aplicação do **ORBIT Engine™** numa carga real de IA, do baseline ao resultado, com a origem de cada número. O case 0 somos nós: a própria maindy. construída com agentes de IA.

Os cases servem a duas coisas: aprender o que funciona de verdade (e o que não funciona) e, quando houver resultado medido, divulgar com honestidade.

## Estrutura

```
docs/cases/
  README.md                      ← este arquivo (regras do programa)
  case-000-maindy/
    README.md                    ← o case: contexto, etapas ORBIT, intervenções, resultados
    data/
      baseline-AAAA-MM-DD.json   ← agregados do período de observação (sem conteúdo)
      after-AAAA-MM-DD.json      ← agregados do período com intervenção
```

## As etapas, aplicadas a um case

| Etapa | O que se faz | Evidência exigida no case |
|---|---|---|
| **O · Observar** | Medir antes de mudar qualquer coisa. Nenhuma técnica ativa. | Período, nº de sessões/requisições, tokens e custo, com a origem de cada número. |
| **R · Reduzir** | Ativar técnicas que cortam o que não precisa ser enviado. | Qual técnica, desde quando, e a medição de tokens/custo depois. |
| **B · Balancear** | Escolher modelo, modo e execução conforme custo e exigência. | Regra de roteamento adotada e efeito medido. |
| **I · Inteligência adaptativa** | Manter só o que economizou sem piorar; ajustar por projeto. | Política resultante (o que ficou ligado, o que foi revertido e por quê). |
| **T · Testar** | Provar que a entrega não piorou. | Critério de qualidade do case e o resultado (testes, revisão, regressões). |

## Regras de número (iguais às do produto)

Todo número de um case leva a sua origem:

- **Reportado pelo provedor:** tokens que a própria API devolveu (ex.: o campo `usage` da Anthropic).
- **Medido localmente:** contado pelo gateway/SDK na máquina.
- **Estimado vs. baseline:** diferença calculada contra um baseline válido. Sempre rotulado como estimativa.
- **Indisponível:** sem fonte confiável. Mostra-se o traço, nunca um palpite.

Custo "a preço de lista" é tokens × tabela de preços do ORBIT (`packages/orbit-engine/src/pricing.ts`, versão registrada no JSON). **Não é fatura**: planos de assinatura (Claude Max, ChatGPT Pro etc.) são cobrados de outra forma. Os cases dizem isso sempre que mostram custo.

## Regras para divulgar um resultado

Um número só sai do repositório (site, post, apresentação) se:

1. **For medido**, não projetado: baseline e período "depois" existem, com o JSON no repositório.
2. **For comparável**: mesma ferramenta, mesmo modelo (ou a troca de modelo é a própria intervenção) e métrica normalizada (por requisição, por pedido humano ou por tarefa), não total bruto.
3. **Vier com o contexto**: período, tamanho da amostra (sessões, requisições), método, origem e limitações, na mesma peça ou num link direto para o case.
4. **A qualidade não piorou**: o critério de qualidade do case passou.
5. **Houver consentimento por escrito** do dono da carga (para o case 0, nós mesmos; para clientes, contrato ou e-mail).
6. **Não houver extrapolação**: "economizamos X% nesta carga, neste período" é permitido; "você vai economizar X%" não é.

O que nunca entra num case: texto de prompts, respostas, código ou saídas de ferramenta de ninguém. Só agregados.

## Como medir (Claude Code)

```bash
# baseline: tudo até agora
node scripts/cases/claude-code-baseline.mjs --out docs/cases/<case>/data/baseline-AAAA-MM-DD.json

# período com intervenção
node scripts/cases/claude-code-baseline.mjs --since 2026-11-19T00:00:00Z --out docs/cases/<case>/data/after-AAAA-MM-DD.json
```

O script lê as transcrições locais do Claude Code do projeto (`~/.claude/projects/<projeto>/*.jsonl`), deduplica por mensagem, calcula o custo com a tabela do ORBIT e reexecuta offline o compressor real sobre as saídas grandes de Bash. Grava só agregados.

# MAINDY Design System

Fonte da verdade: `packages/design-system/src/index.ts` (TS) e `src/tokens.css` (CSS). O web mapeia os tokens no `@theme` do Tailwind 4 (`apps/web/app/globals.css`); o desktop importa `tokens.css`.

## Marca
- Wordmark `maindy.` sempre em lowercase, branco/off-white, **pingo do "i" dourado**, **ponto final violeta**. Usar os arquivos originais (`brand/original`, derivados em `brand/derived`). Nunca redesenhar, recolorir ou distorcer.
- Ícone: orb navy com `m.` branco, raios dourado/violeta/magenta, anel violeta e halo âmbar. Favicons e ícones de app são derivados do original.
- Área de respiro mínima ao redor do wordmark: a altura do "m".

## Cores (dark, padrão)
| Token | Hex | Uso |
|---|---|---|
| bg / bg-deep | #080623 / #050417 | fundos |
| surface-1/2/3 | #15112E / #1C1636 / #251D45 | cards, painéis |
| violet / neon / purple | #8F20FF / #A424FF / #C724FF | ação primária, foco, destaques |
| gold | #FFD21F | acentos raros (pingo do i, marcos) — nunca texto corrido |
| fg / muted / subtle | #FAF8FF / #BEB7D6 / #8A83A8 | texto |
| success | #4FD1A1 | **somente** métricas de economia e estados OK |
| error / warning | #FF7A6B / #FFC861 | coral discreto / atenção |
Light (dashboard): ver `[data-theme="light"]` em tokens.css.

## Tipografia
Geist Sans (UI e títulos) e Geist Mono (rótulos técnicos, números de especificação), ambas open source (OFL). Títulos grandes com tracking negativo (−0,02 a −0,04 em), poucas quebras. Rótulos `.m-label`: mono 11 px, caixa alta, tracking 0,14 em.

## Espaço, raios, sombras
Escala 4/8 px. Raios: 8 (chips), 12 (inputs/botões), 16–20 (cards), 24 (painéis/modais). Bordas de 1 px `line`; profundidade com sombras longas e suaves e um glow violeta discreto (`--m-glow-violet`) apenas em foco/ativo.

## Motion
150 ms (hover), 220 ms (UI), 350 ms (painéis); easing `cubic-bezier(.16,1,.3,1)`. Animações longas só na campanha (hero). Orb: pulso suave quando o ORBIT está ativo, sóbrio quando inativo. `prefers-reduced-motion` zera durações. Sem CLS; fallback sem WebGL.

## Proveniência de dados (componente obrigatório)
Todo número de custo, token ou economia mostra um `MeasurementBadge`: **Reportado pelo provedor** · **Medido localmente** · **Estimado vs. baseline** · **Indisponível**. Demonstrações ficam dentro de um `DemoFrame` com o rótulo "Demonstração — dados simulados".

## Estados de conector
Não conectado · Conectado — somente leitura · Otimização ativa · Atenção · Indisponível.

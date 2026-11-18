# maindy. — app desktop (macOS e Windows)

App residente da maindy.: launcher compacto no topo (notch no Mac, pílula no Windows), Quick Panel, painel completo com sidebar e o gerenciamento do gateway local (ORBIT Engine). Feito com **Tauri 2** (Rust) + **React 19 / Vite** usando os tokens de `@maindy/design-system`.

## Arquitetura

```
apps/desktop
├─ src/                      frontend (um único bundle; a view é escolhida pelo label da janela)
│  ├─ bridge.ts              invoke → Rust (ou fixtures no navegador, só para QA visual)
│  ├─ data.tsx               contexto do app, carregamento da API, estados derivados
│  ├─ fixtures.ts            dados de demonstração (sempre rotulados "Demonstração — dados simulados")
│  └─ views/                 MainWindow (sidebar + seções), Pairing, QuickPanel (compartilhado),
│                            NotchView (macOS), PillView (Windows), Snapshot (galeria de QA)
└─ src-tauri/src
   ├─ lib.rs                 plugins, janelas, ciclo de vida, supervisor do gateway
   ├─ commands.rs            comandos expostos ao webview (nenhum devolve segredo)
   ├─ api.rs                 cliente da API (reqwest + rustls), allowlists de leitura/escrita, download de relatórios, erros pt-BR
   ├─ ops.rs                 comandos das páginas: chaves BYOK, upstreams/integrações do gateway, relatórios, CRUD, política
   ├─ secrets.rs             chaves de provedores no Keychain (serviço "maindy", conta "provider:<id>")
   ├─ session.rs             Keychain / Credential Manager (crate keyring) + device.json opcional
   ├─ settings.rs            preferências não secretas (settings.json no diretório de config do SO)
   ├─ gateway.rs             sidecar: localizar, iniciar/parar, health-check, backoff
   ├─ geometry.rs            matemática PURA do notch, snap da pílula, painel sob a bandeja (testada)
   ├─ notch.rs               (macOS) janela nativa sobre o notch via objc2-app-kit
   ├─ pill.rs                (Windows) pílula arrastável com snap e posição por monitor
   ├─ launcher.rs            despacho por plataforma + Quick Panel ancorado no ícone da bandeja
   └─ tray.rs                menu da barra de menus / área de notificação
```

Janelas (labels): `main` (Painel), `notch` (macOS), `quick` (Quick Panel sob o ícone da bandeja), `pill` (Windows).

Painel: Overview, Economia, Integrações, Agentes & Projetos, Limites & Sessões, ORBIT Engine, Qualidade, Relatórios, Faturamento e Configurações. Dados de `/v1/me`, `/v1/stats/summary`, `/v1/runs`, `/v1/connectors`, `/v1/orbit/policy`, `/v1/limits`, `/v1/quality/evaluations`, `/v1/projects`, `/v1/agents`, `/v1/reports/savings` (token do dispositivo, sempre via Rust) e `/maindy/*` do gateway local. Todo número traz o selo de origem (`MeasurementSource`) vindo do dado; quando o payload não traz origem por valor, a derivação está centralizada em `src/sources.ts`. Sem dados → "indisponível" e estado vazio, nunca número inventado. Cotas só aparecem quando existe `QuotaSnapshot` (mostra provedor e `collectedVia`).

### O que cada página faz

| Página | Ações reais |
|---|---|
| Integrações | OpenAI/Anthropic: "Conectar" (chave → Keychain → `PUT /maindy/upstreams/:id`), "Testar conexão" (`POST …/test`: latência + modelos; marca o conector `connected_read_only` com `credentialRef` `keychain:maindy/provider:<id>`), "Desconectar" (Keychain + gateway + conector). OpenAI-compatível: URL base editável (persistida e reaplicada), chave opcional, teste. Agentes/SDK: snippets Python/TS/curl com `x-maindy-project`/`x-maindy-agent` e "Enviar requisição de teste" (1 token real pelo gateway, mostra o evento medido). Claude Code/Codex: **"Configurar com o Claude Code"** (prompt pt-BR que pede ao agente do próprio usuário para rodar `maindy-gateway integrations … --dry-run`, instalar só depois do "sim" e conferir com `status`; abre **preenchido, nunca enviado** no VS Code, no Terminal (`claude-cli://`) ou no app Claude, conforme o que for detectado, ou "Copiar prompt"; a checklist se atualiza sozinha a cada 3 s). Alternativa: prévia (dry-run com diff e caminho do backup) → confirmação para instalar/desinstalar. Apps de chat: "Não suportado" com o motivo. |
| Agentes & Projetos | Lista `/v1/projects` e `/v1/agents` com uso do período (até 1.000 operações), criar, renomear, excluir (com confirmação), snippet do header por item, atalho para cadastrar chaves com uso sem cadastro. |
| Qualidade | Tabela de `/v1/quality/evaluations` (técnica, método, resultado, detalhe, quando), taxa de aprovação e "Reativar" técnica revertida (`PUT /v1/orbit/policy` só com essa técnica + `POST /maindy/rollbacks/reset`). |
| Relatórios | Período (presets ou datas), prévia JSON (totais + amostra da trilha de auditoria), "Exportar CSV/PDF" baixado pelo Rust e salvo pelo diálogo nativo (ou direto em Downloads), "Mostrar no Finder". |
| ORBIT Engine | Modo (com simulação), liga/desliga por técnica, "Reverter…" com motivo, reativar, pausar/retomar (gateway + API), estado efetivo: modo da conta × modo que o gateway está aplicando ("sincronizando…" quando diferem). |
| Faturamento | Plano, status, ciclo, renovação/fim do teste reais de `/v1/me`; pagamento sempre no navegador. |

### Chaves de provedores (BYOK)

- A chave é digitada uma única vez num campo de senha e enviada ao Rust pelo comando `provider_key_save`; o estado do campo é limpo antes da chamada. Ela nunca volta para o webview, não vai para logs, `settings.json` nem para a nuvem (a API recebe só a referência `keychain:maindy/provider:<id>`).
- Fica no Keychain (serviço `maindy`, conta `provider:openai` / `provider:anthropic` / `provider:<id>`) e só existe em memória no gateway (`PUT /maindy/upstreams/:id { apiKey }`).
- O supervisor detecta cada novo processo do gateway que o app iniciou (uptime voltou a zero) e reenvia automaticamente URLs base e chaves. Para um gateway "externo" (iniciado fora do app) o envio só acontece por ação explícita ("Reenviar ao gateway").
- `settings.json` guarda apenas os ids que têm chave (`providerKeys`) e as URLs base (`upstreamBaseUrls`).

## Links `maindy://` (abrir o app direto numa tela)

Registrado com `tauri-plugin-deep-link` (`plugins.deep-link.desktop.schemes` → `CFBundleURLTypes` no Info.plist); `single-instance` repassa o link para a instância que já está aberta. Validação estrita em `src-tauri/src/deeplink.rs` (allowlists, sem `..`/`%`/usuário/porta; query e fragmento ignorados; a URL nunca vai para o log):

| Link | Abre |
|---|---|
| `maindy://integrations/<kind>` | Integrações, rolando até o conector e abrindo o formulário/instalação. `kind`: `openai_api`, `anthropic_api`, `openai_compatible`, `local_agent_sdk`, `claude_code`, `codex`, `chat_apps` (apelidos: `openai`, `anthropic`, `ollama`, `sdk`, `claude-code`) |
| `maindy://open/<section>` | página da sidebar (`overview`, `savings`, `integrations`, `projects`, `limits`, `orbit`, `quality`, `reports`, `billing`, `settings`) |
| `maindy://pair` | pareamento (ou Configurações, se já pareado) |

O web (`/app/conexoes` e o passo "Conecte uma fonte" do onboarding) usa "Abrir no app maindy." com esses links.

### "Configurar com o Claude Code" — destinos (todos só preenchem; o usuário revisa e pressiona Enter)

| Botão | URL (montada no Rust, nunca vinda do webview) | Aparece quando |
|---|---|---|
| Abrir no VS Code | `vscode://anthropic.claude-code/open?prompt=…` | VS Code (app ou CLI `code`) **e** `~/.vscode/extensions/anthropic.claude-code-*` |
| Abrir no Terminal | `claude-cli://open?q=…&cwd=<home>` | `~/Applications/Claude Code URL Handler.app` existe (senão mostra `claude '…'` para copiar) |
| Abrir no app Claude | `claude://code/new?q=…` | `/Applications/Claude.app` |
| Copiar prompt | — | sempre (Cursor, JetBrains…) |

O prompt (≤ 1.000 caracteres, só caminhos, nenhum segredo) usa o caminho real do gateway detectado em tempo de execução. `agent_open` só abre URLs da allowlist (`vscode:`, `claude-cli:`, `claude:`, `https:`), com os endpoints exatos documentados.

## Pareamento e modelo de segurança

1. Primeira execução: "Conectar à sua conta" → `POST {API}/v1/devices/pair/start` (API padrão `http://localhost:4100`, editável; http só para loopback). Mostra o `userCode` grande e abre `verificationUrlComplete` no navegador.
2. Faz `POST /v1/devices/pair/poll` a cada `interval` s (respeita `slow_down`/429 aumentando o intervalo; o Rust também impede poll antes do intervalo).
3. Aprovado → o token vai **somente** para o Keychain do macOS / Gerenciador de Credenciais do Windows (serviço `ai.maindy.desktop`, conta `device-session`). É lido uma vez no início e fica só na memória do processo Rust.
4. **Nenhuma chamada autenticada é feita pelo JavaScript**: o webview chama comandos Rust; uma allowlist de rotas GET e de parâmetros de query impede uso do token para outras rotas. O `Debug` da sessão redige o token; nada de token/prompt nos logs.
5. **Compromisso documentado — "Gateway local" (opt-in):** o gateway é outro processo e precisa do token para enviar metadados à nuvem. Só com o toggle ligado gravamos `$MAINDY_HOME/device.json` (`~/.maindy`; arquivo 0600, diretório 0700; escrita atômica) com `{ apiUrl, deviceId, organizationId, deviceToken, token }`. Qualquer processo do mesmo usuário pode ler esse arquivo — por isso é opcional. Desligar o toggle ou desconectar apaga o arquivo.
6. "Desconectar" = remove o item do Keychain/Credential Manager + `device.json`. Para revogar no servidor: painel web → Dispositivos. Se `/v1/me` responder 401, o app mostra "dispositivo desconectado" e oferece parear de novo.
7. CSP restrita (sem rede a partir do webview), capabilities mínimas, sem plugins de shell/fs/dialog expostos ao webview (o diálogo de salvar relatório é aberto pelo Rust); links externos só http(s). Escritas na API passam por outra allowlist (`api::is_allowed_write`): política/pausa/rollback do ORBIT, `PUT /v1/connectors/:kind`, CRUD de projetos/agentes. "Mostrar no Finder" só aceita arquivos exportados pelo próprio app nesta execução.

## Launcher no notch (macOS) — detalhes

- **Geometria real** (`notch.rs` → `geometry::notch_rect`): para cada `NSScreen` lê `safeAreaInsets.top`, `auxiliaryTopLeftArea` e `auxiliaryTopRightArea`. Há notch **somente** se `safeAreaInsets.top > 0` e as duas áreas auxiliares existem. Largura do notch = largura da tela − larguras das áreas auxiliares; altura = inset superior; frames alinhados ao pixel físico (`backingScaleFactor`).
- **Janela nativa**, não HTML em tela cheia: janela Tauri sem bordas e transparente, reconfigurada via `ns_window()`: nível `NSMainMenuWindowLevel + 3` (acima da barra de menus, abaixo dos menus pop-up do sistema), `collectionBehavior = canJoinAllSpaces | stationary | fullScreenAuxiliary | ignoresCycle`, `hidesOnDeactivate = NO`, sem sombra, `orderFrontRegardless` (aparece sem ativar o app). `acceptsFirstMouse` para o primeiro clique funcionar.
- **Não cobre câmera nem menus**: a janela sempre tem o tamanho exato da forma visível (fora dela tudo é clicável). Colapsado: altura do notch e só 30 pt a mais de cada lado (orb à esquerda, indicador à direita). Hover: +10 pt por lado e +4 pt de altura. Expandido: Quick Panel de ~384×568 pt descendo do notch.
- **Estados**: colapsado (orb sóbria), hover (leve expansão), expandido, alerta (gateway caiu / dispositivo revogado / erro de Keychain — indicador coral), otimização ativa (orb respira suavemente só quando o ORBIT está ativo e o gateway saudável), modo silencioso (forma mínima, sem movimento nem notificações).
- **Hover** sem permissões: amostra `NSEvent.mouseLocation` a cada 90 ms e compara com o frame (sem Acessibilidade, sem Gravação de Tela; nenhuma outra janela é capturada ou lida).
- **Re-layout** em `NSApplicationDidChangeScreenParametersNotification` (troca de monitor, resolução "Mais espaço", espelhamento, tampa fechada).
- **Teclado/a11y**: ao expandir a janela vira key (Esc fecha, Tab percorre), perder o foco recolhe; botões com `aria-label`; respeita `accessibilityDisplayShouldReduceMotion` (NSWorkspace) e `prefers-reduced-motion`.
- **Fallbacks**: Mac sem notch, monitor externo como única tela, ou toggle "Mostrar no notch" desligado → ícone na barra de menus; clique esquerdo abre o Quick Panel flutuante ancorado sob o ícone (`geometry::panel_under_tray`), clique direito abre o menu. O ícone da barra de menus existe sempre (menu: Abrir painel, Pausar/Retomar ORBIT, Status do gateway, Iniciar com o sistema, Sair).
- **Política de ativação `Accessory`** (app de barra de menus, sem ícone no Dock nem no Cmd+Tab): verificado neste Mac que, como app `Regular`, a janela do notch fica presa no Space do próprio app e some quando outro app está em tela cheia no display com notch (`isOnActiveSpace = false`); como `Accessory` ela entra em todos os Spaces (`isOnActiveSpace = true`). O painel principal continua sendo uma janela normal, aberta pelo notch ou pela barra de menus.
- **Sem filtros CSS na janela do notch**: em janela transparente o WebKit não desenhou elementos com `filter` (verificado por captura real); a "respiração" da orb usa só transform/opacity.
- Limitação: a janela é um `NSWindow` (não `NSPanel`), então expandir ativa o app. Atalho global ainda não implementado.

## Windows

Ícone na área de notificação + **pílula** (188×44, transparente, sem bordas, fora da barra de tarefas). Arrastar usa `startDragging` nativo; ao soltar, `geometry::snap_to_edges` encaixa nas bordas da **área de trabalho** do monitor (exclui a barra de tarefas em qualquer posição), em pixels físicos × fator de escala (DPI). Posição salva por monitor (`nome@WxH+X+Y`). Clique → expande no mesmo Quick Panel (cresce para baixo ou para cima conforme o espaço); "sempre no topo" opcional. Sem notch falso. Autostart opt-in, notificações, pausa e sair pelo menu. Compilado só em CI (`cfg(windows)`); localmente o módulo é verificado com `cargo clippy --features pill-preview`.

## Gateway local (sidecar)

- `pnpm --filter @maindy/desktop build:sidecar [--target <triple>]`: pega `apps/gateway/dist/maindy-gateway.mjs`, converte para CJS (esbuild), gera o blob SEA (`node --experimental-sea-config`, Node 24), copia o binário do Node do alvo (baixa de nodejs.org e confere o SHA-256 quando o alvo ≠ host), injeta com `postject` e reassina ad hoc no macOS. Saída: `src-tauri/binaries/maindy-gateway-<triple>`. Faz um smoke test (`--version` + `GET /maindy/health`).
- `pnpm --filter @maindy/desktop bundle ...` só inclui o sidecar (`tauri.sidecar.conf.json` → `externalBin`) se o binário existir; sem ele o app mostra "Gateway local não instalado".
- Toggle "Gateway local": inicia o binário com `MAINDY_HOME`, checa `/maindy/health` a cada 3 s (com `x-maindy-key` lido de `$MAINDY_HOME/gateway.key`), reinicia em queda com backoff 1→2→4…60 s (zera após 60 s saudável), notifica e mostra status. Se já houver um gateway respondendo em `127.0.0.1:8787`, é tratado como "externo" e não é iniciado outro. Ao sair do app o processo filho é encerrado.
- **Pausar ORBIT** é imediato: `POST /maindy/pause` no gateway local + `POST /v1/orbit/pause` na API (o que estiver disponível). Mudanças de modo/técnicas vão para a API; o gateway vinculado busca a política a cada 30 s (a UI mostra "sincronizando…" até o modo efetivo bater).
- Rotas do gateway que o app chama com `x-maindy-key` passam por uma allowlist (`gateway::gateway_route_allowed`): `GET /maindy/upstreams`, `PUT /maindy/upstreams/:id`, `POST /maindy/upstreams/:id/test`, `GET /maindy/integrations`, `POST /maindy/integrations/{claude-code|codex}/{install|uninstall}`, `GET /maindy/events`, `POST /maindy/rollbacks/reset`, `POST /maindy/pause|resume`.
- Porta: `MAINDY_GATEWAY_PORT` (padrão 8787) — só para QA, para rodar uma segunda instância sem colidir com o app instalado.

## Desenvolvimento

```bash
pnpm --filter @maindy/contracts build && pnpm --filter @maindy/design-system build
pnpm --filter @maindy/desktop tauri dev          # app com hot reload
pnpm --filter @maindy/desktop typecheck          # tsc --noEmit
cd apps/desktop/src-tauri && cargo test && cargo clippy --all-targets && cargo clippy --all-targets --features pill-preview
pnpm --filter @maindy/desktop build && pnpm --filter @maindy/desktop snapshots   # PNGs em docs/evidence/screens/desktop-*.png
node apps/desktop/scripts/snapshots.mjs --only=v2-integrations                  # só os prints que contêm o filtro
```

A galeria de QA (`/?view=snapshot&shot=...` no `vite preview`) renderiza os componentes reais com fixtures rotuladas; o "menu bar + notch" desenhado ali é só fundo do print — no app o launcher é a janela nativa.

## Build, assinatura e notarização

```bash
pnpm --filter @maindy/desktop build:sidecar                          # opcional (gateway)
pnpm --filter @maindy/desktop bundle --bundles app,dmg               # host (aarch64-apple-darwin)
pnpm --filter @maindy/desktop build:sidecar --target x86_64-apple-darwin
pnpm --filter @maindy/desktop bundle --target x86_64-apple-darwin --bundles app,dmg
```

- **Hoje: assinatura ad hoc** (`signingIdentity: "-"`), **sem notarização**. O Gatekeeper bloqueia na primeira abertura: clique com o botão direito → Abrir (ou `xattr -dr com.apple.quarantine /Applications/maindy.app`). Releases devem ser registradas com `signing = "adhoc"`.
- Com Developer ID: exporte `APPLE_SIGNING_IDENTITY="Developer ID Application: …"`; para notarizar, `APPLE_ID`, `APPLE_PASSWORD` (senha de app) e `APPLE_TEAM_ID` — o `tauri build` assina, envia ao notary service e grampeia o ticket.
- Windows: sem certificado os instaladores (NSIS/MSI) saem sem assinatura (SmartScreen avisa). Com certificado, `bundle.windows.certificateThumbprint` (o workflow gera isso a partir dos secrets).
- Registrar release na API: `pnpm --filter @maindy/api exec tsx src/scripts/register-release.ts macos-arm64 <dmg> <versão> adhoc`.
- **Atualizações**: `tauri-plugin-updater` está configurado (endpoint placeholder `releases.maindy.invalid`, chave pública a definir) mas **desligado** — só entra com `--features updater` depois que existirem chaves de assinatura de update (`tauri signer generate`).
- CI: `.github/workflows/desktop.yml` (macos-14 arm64/x64, windows-latest x64/arm64; artefatos com `.sha256` e `SIGNING.txt`; passos de assinatura só rodam com os secrets `APPLE_CERTIFICATE…`, `WINDOWS_CERTIFICATE…`).

## Limitações conhecidas

- Sem Developer ID/notarização; o Keychain pode pedir confirmação de acesso após cada novo build ad hoc (a assinatura muda).
- Expandir o notch ativa o app (NSWindow, não NSPanel); sem atalho global de teclado ainda.
- Windows só é compilado/empacotado no CI; a pílula não foi exercitada em hardware Windows real.
- `/v1/runs` é rota "web" na arquitetura; se a API recusar o token de dispositivo, Overview/Sessões mostram "indisponível" e um link para o painel web.
- O uso por projeto/agente é agregado de até 1.000 operações do período (a API ainda não tem agregado por projeto).
- Tokens de entrada/saída do resumo não trazem origem única (ela varia por evento); a página Economia diz isso e aponta para a trilha de auditoria.
- ROI da assinatura aparece como "indisponível" no app (depende de preço/taxas; calculado nos relatórios).
- Rotas do web usadas pelos links (`/app/faturamento`, `/app/configuracoes/dispositivos`, …) dependem do apps/web.

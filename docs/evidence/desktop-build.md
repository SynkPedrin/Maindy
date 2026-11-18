# Evidência — build do app desktop (apps/desktop)

Data: 2026-11-18 · Máquina: MacBook (Apple M5, `Mac17,3`), macOS 26.6.2 · Rust 1.98 · Node 24.20 · Tauri CLI 2.12.5

## Artefatos

| Arquivo | Alvo | Tamanho (bytes) | SHA-256 | Assinatura |
|---|---|---|---|---|
| `apps/desktop/src-tauri/target/release/bundle/dmg/maindy_0.1.0_aarch64.dmg` | aarch64-apple-darwin | 46 864 490 | `c38b3b9c8919ce67309c791669e477eba76a3bb428277c524476a3a1990bc391` | **adhoc**, sem notarização |
| `apps/desktop/src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/maindy_0.1.0_x64.dmg` | x86_64-apple-darwin | 49 060 102 | `039ee33eec9219983bd20e127f87b009eea6f9d64a96f077b18c7cf44236a100` | **adhoc**, sem notarização |
| `…/target/release/bundle/macos/maindy.app` (130,6 MiB, inclui sidecar) | aarch64 | — | binário principal `5ac4a63e…1b24` | adhoc |
| `…/target/x86_64-apple-darwin/release/bundle/macos/maindy.app` (134,1 MiB) | x86_64 | — | binário principal `660715d6…bbd9` | adhoc |
| `apps/desktop/src-tauri/binaries/maindy-gateway-aarch64-apple-darwin` (Node 24 SEA) | aarch64 | 128 286 240 | `177f53968f80380cd21c17501c3ae53a55ac5c6d591dbb0a9051773784bc0c74` | adhoc |
| `apps/desktop/src-tauri/binaries/maindy-gateway-x86_64-apple-darwin` (Node 24 SEA, Node x64 oficial com SHA conferido) | x86_64 | 131 414 368 | `706d338bca381fbba89ca146f1f3212f61c01e3024232c5b83c9b509d664911c` | adhoc |

Assinatura: `codesign -dv` → `Signature=adhoc`, `TeamIdentifier=not set`; `codesign --verify --deep --strict` OK; `spctl -a` → **rejected** (esperado: sem Developer ID / notarização). Não há Developer ID nesta máquina.

`hdiutil verify` → checksum VALID nos dois DMGs; o DMG arm64 montado contém `maindy.app` + atalho `Applications`, e `Contents/MacOS/` tem `maindy-desktop` e `maindy-gateway`.

## Registro na API (local)

```
pnpm --filter @maindy/api exec tsx src/scripts/register-release.ts macos-arm64 <dmg arm64> 0.1.0 adhoc --min-os "macOS 12" --changelog "…"
pnpm --filter @maindy/api exec tsx src/scripts/register-release.ts macos-x64   <dmg x64>   0.1.0 adhoc --min-os "macOS 12" --changelog "…"
```
`GET http://localhost:4100/v1/releases` → `macos-arm64 available=true signing=adhoc sha256=c38b3b9c…`, `macos-x64 available=true signing=adhoc sha256=039ee33e…` (arquivos copiados para `apps/api/.data/releases/`). Windows: não construído aqui (CI).

## Comandos

```
pnpm --filter @maindy/desktop build:sidecar                                  # smoke: --version=0.1.0, GET /maindy/health 200
pnpm --filter @maindy/desktop build:sidecar --target x86_64-apple-darwin     # baixa node-v24.20.0-darwin-x64, confere SHASUMS256; roda via Rosetta (--version=0.1.0)
pnpm --filter @maindy/desktop bundle --bundles app,dmg
pnpm --filter @maindy/desktop bundle --target x86_64-apple-darwin --bundles app,dmg
```

## Verificação em execução (hardware real)

- Telas lidas via `NSScreen` (Swift) e pelo app: built-in `safeAreaInsets.top = 32`, `auxiliaryTopLeftArea.w = 646`, `auxiliaryTopRightArea.w = 645` → notch 179×32 pt. **Este Mac tem notch.** O app logou `notch=Rect { x: 2566, y: 924, w: 179, h: 32 }` com o monitor externo à esquerda como principal e, horas depois, com outra configuração (3 telas, built-in principal) `screens=3 notch=Rect { x: 646, y: 924, w: 179, h: 32 }` — mesmo notch, coordenadas globais recalculadas.
- Janela do notch (`CGWindowListCopyWindowInfo`): `layer 27` (= `NSMainMenuWindowLevel + 3`), colapsada `239×32` exatamente sobre o notch; expandida `384×600`; WKWebView redimensionado junto (`subviews=[384×600]`).
- Capturas reais (`screencapture`): `docs/evidence/screens/desktop-notch-real-collapsed.png`, `desktop-notch-real-hover.png` (cursor posicionado com `CGWarpMouseCursorPosition` → hover detectado sem permissões), `desktop-notch-real-expanded.png` (estado forçado pelo hook de debug `MAINDY_DIAG_NOTCH_STATE`, porque clique sintético exige permissão de Acessibilidade).
- Problemas encontrados e corrigidos nesta verificação: (1) com política `Regular` a janela ficava fora do Space em tela cheia (`isOnActiveSpace=false`) → app passa a ser `Accessory`; (2) elementos com CSS `filter` não eram desenhados na janela transparente → removidos; (3) `SIGTERM` deixava o gateway órfão → handler encerra o filho.
- Gateway: com `gatewayLocal=true` o app iniciou o sidecar, `/maindy/health` e `/maindy/status` (com `x-maindy-key` de `gateway.key`) responderam; após `kill -9` no gateway o app registrou `gateway exited: signal: 9; retry in 1s` e o reiniciou; `SIGTERM` no app encerra app e gateway.
- `.app` arm64 e x64 (Rosetta) iniciados em background: processo vivo, sem `ERROR`/panic no log, janela principal "Conectar à sua conta" e janela do notch na tela; encerrados limpos.

## Rebuild 2026-11-18: correção do gateway embutido (hardened runtime)
Problema encontrado ao validar o `.dmg` baixado pela página de download: o sidecar `maindy-gateway` (Node SEA) abortava ao iniciar com `Fatal process out of memory: Failed to reserve virtual memory for CodeRange`. O bundle assina com hardened runtime, que proíbe JIT sem entitlement; o smoke test anterior assinava sem hardened runtime e por isso não pegou o caso.
Correção: `src-tauri/Entitlements.plist` (`com.apple.security.cs.allow-jit`, `allow-unsigned-executable-memory`) em `tauri.conf.json → bundle.macOS.entitlements`; `scripts/build-sidecar.mjs` passou a assinar com `--options runtime --entitlements` (smoke test igual ao app final).

| Artefato | SHA-256 | Verificação |
|---|---|---|
| `maindy_0.1.0_aarch64.dmg` | `9aa406f55d8d7b7119c933aa914de394c91987501810d66bf1dada743a45a7bb` | `hdiutil verify` VALID; `codesign --verify --deep --strict` ok; gateway de dentro do dmg: `--version` 0.1.0 e `/maindy/health` 200 |
| `maindy_0.1.0_x64.dmg` | `52452a63bd4a06b807030a106e2ef303517264a65ceada424916b1ccd4a4d6d6` | assinatura ok; gateway x86_64 `--version` 0.1.0 (Rosetta) |

Ambos re-registrados (`release:register … adhoc`). Os hashes das tabelas anteriores estão obsoletos.

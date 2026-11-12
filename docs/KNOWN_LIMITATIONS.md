# Limitações conhecidas e integrações pendentes

## Depende de credenciais suas
| Item | Estado | Para ativar |
|---|---|---|
| Claude (Anthropic) | integrado e testado por contrato; **sem chave nesta máquina**, então o agente responde em modo offline (`mode: "offline"`) | definir `ANTHROPIC_API_KEY` em `.env.local` e reiniciar a API |
| Google (Gmail + Agenda) | OAuth, rascunho, envio e busca implementados contra as APIs do Google; nunca executados | `GOOGLE_CLIENT_ID`/`SECRET` + tela de consentimento OAuth |
| ElevenLabs e OpenAI Audio | adaptadores implementados | `ELEVENLABS_API_KEY` / `OPENAI_API_KEY` |
| Push remoto (Expo) | o agendador envia; o app registra o token | `eas init` (projectId) e aparelho físico |
| Sentry / OpenTelemetry | não integrados | DSN ou coletor |

## Plataforma
- **iOS não permite sobreposição global (orb flutuante)**, interceptação de notificações de outros apps nem bloqueio universal de apps. O equivalente possível é widget, widget de tela bloqueada, App Intents, Atalhos e Live Activity (ver `docs/NATIVE.md`).
- O bloqueio de apps no iOS exige o entitlement FamilyControls aprovado pela Apple. Não foi implementado.
- O orb flutuante e o filtro de notificações são **somente Android**, com permissão explícita do usuário.
- O plugin do Obsidian no iOS só enxerga o próprio vault. Não há acesso livre a pastas de outros apps.
- Geofencing ("me lembre quando sair do trabalho") não foi implementado. A localização é usada em primeiro plano, para o clima.
- A agenda nativa do aparelho (`expo-calendar`) não foi integrada. A agenda do app e a do Google estão.

## Verificação
- **Android:** o build de debug foi compilado de verdade e rodou num emulador (Pixel 9 Pro, Android 37), incluindo o orb flutuante. Não foi testado num aparelho físico.
- **iOS:** não houve build com Xcode nem simulador nesta sessão (o disco tinha cerca de 17 GB livres). O Swift foi verificado só por typecheck, e o widget e o App Group exigem `APPLE_TEAM_ID` e uma conta Apple Developer. No iPhone, o caminho imediato é o **Expo Go**: todas as bibliotecas usadas estão incluídas no Expo Go SDK 58, mas isso **não foi testado** num iPhone. O módulo nativo responde `supported: false` (widget, Live Activity e App Intents ficam indisponíveis).
- No Android 16+ em debug, o sistema pede a permissão de "dispositivos próximos" (rede local) para baixar o JavaScript do Metro. Builds de produção não precisam dela.
- A interrupção de voz e a gravação real no microfone do aparelho não foram testadas fisicamente.

## Produto
- O modo offline entende frases comuns em pt-BR. A extração rica (várias informações numa frase, inferências) depende do Claude.
- Voz:
  - Padrão: reconhecimento de fala no aparelho (app instalado) e voz do aparelho. As duas respondem na hora.
  - No Expo Go e na web: a transcrição é feita no VoiceStudio do Mac, cerca de 12 s por frase.
  - A voz do VoiceStudio é mais natural, mas leva cerca de 9 s por resposta neste MacBook Air.
  - Não há streaming de áudio.
- Acesso de fora da rede local: um túnel público foi bloqueado por política nesta sessão. Para testar fora do Wi-Fi, é preciso hospedar a API (ver `DEPLOYMENT.md`).
- Rotinas (`routines`) e regras de notificação (`notification_rules`) existem no banco, mas ainda não têm telas.
- Assinaturas: a tela existe, sem cobrança.
- O VoiceStudio é AGPL-3.0. Revise o licenciamento antes de oferecê-lo como serviço comercial.
- A busca semântica usa um modelo local de 384 dimensões. Trocar para Voyage ou outro provedor exige migrar a coluna `vector(384)`.
- Fonte: SF Pro (iOS) e Roboto (Android), as fontes do sistema. O wordmark gerado usa Poppins Bold contornado, próximo do logo original mas não idêntico (ver `tools/asset-gen/README.md`).

# Testar no celular

O backend (API, banco e voz) roda no Mac. O celular precisa estar **no mesmo Wi-Fi** que o Mac.

## 1. No Mac, deixe rodando

```bash
pnpm db:start                                      # Supabase local
MAINDY_DOWNLOADS_DIR=~/MAINDY/downloads CORS_ORIGINS='*' pnpm --filter @maindy/api serve
pnpm dev:mobile                                    # Metro (para o Expo Go)
```

Descubra o IP do Mac com `ipconfig getifaddr en0` (exemplo: `192.168.0.86`). Se o macOS perguntar se o Node pode aceitar conexões, permita.

## 2a. Android: instalar o APK

1. No navegador do celular, abra `http://<IP-do-Mac>:4000/download` e toque em **Baixar APK**.
2. Permita "instalar apps desconhecidos" para o navegador e instale.
3. No login, confira em **Servidor** que o endereço é `http://<IP-do-Mac>:4000`. Se o IP do Mac mudar, toque em "Servidor" e troque. Não precisa reinstalar.

O APK de release tem tudo:
- reconhecimento de fala no próprio aparelho (instantâneo);
- voz do aparelho;
- orb flutuante (Ajustes › Orb flutuante);
- notificações.

## 2b. iPhone: Expo Go

1. Instale o **Expo Go** pela App Store.
2. Abra a câmera, aponte para o QR que o `pnpm dev:mobile` mostra no terminal (ou digite `exp://<IP-do-Mac>:8081` no Expo Go) e abra no Expo Go.

No Expo Go funcionam todas as telas, a voz do aparelho e as notificações. O que muda:
- o reconhecimento de fala é feito no Mac (VoiceStudio), cerca de 12 s por frase;
- widget, Live Activity e Atalhos da Siri exigem um build próprio, com conta Apple Developer (ver `docs/NATIVE.md`).

## 3. Contas

- Usuário master: e-mail e senha em `.env.local` (`MASTER_EMAIL` / `MASTER_PASSWORD`).
- Usuários demo: `DEMO_USER_DEMO_00X_*` no mesmo arquivo. Também dá para criar uma conta nova pelo app.

## 4. O que experimentar

- Segurar o orb na aba central e falar: "Nico, guarda que o código do portão é 4721" e depois "Qual o código do portão?".
- "Nico, me lembra de ligar para minha mãe às 18h" cria um lembrete e uma notificação no horário.
- Ajustes › Sobre você: trabalho, atividades e rotina. A assistente usa isso nas respostas.
- Ajustes › Personalidade: nome e vários traços de personalidade.
- Android: Ajustes › Orb flutuante, depois sair do app. O orb fica sobre os outros apps; tocar nele abre a assistente.

Sem `ANTHROPIC_API_KEY` no `.env.local`, as respostas vêm do motor local ("modo local"). Com a chave, o Claude assume a conversa.

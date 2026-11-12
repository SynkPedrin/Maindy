# Auditoria do VoiceStudio

## O que está instalado

- `/Applications/VoiceStudio.app`, versão 0.5.7, bundle `com.voicestudio.desktop`. É um app Electron com backend Python.
- Licença: AGPL-3.0. Os pesos dos modelos têm licenças próprias.
- Projeto open source: <https://github.com/debpalash/VoiceStudio>.
- Motores presentes: OmniVoice (TTS), KittenTTS, mlx-audio e faster-whisper (STT). Rodam em Metal (MPS) no Apple Silicon.
- Configuração (`Resources/config/app.json`): backend na porta 3900, web na 3901.

## Interfaces encontradas e testadas

O backend expõe uma API local compatível com OpenAI Audio (`backend/api/routers/openai_compat.py`). Com o app aberto:

| Endpoint | Teste | Resultado |
|---|---|---|
| `GET /v1/models` | `curl` | 200. TTS: `tts-1`, `omnivoice`, `kittentts`, `mlx-audio`. STT: `whisper-1`, `faster-whisper` |
| `GET /v1/audio/voices` | `curl` | 200. Aliases OpenAI mais perfis locais (`demo0001`, `4f4dac81 lucy`) |
| `POST /v1/audio/speech` | frase em pt-BR, `language: "pt"` | 200, WAV PCM 16 bit mono 24 kHz, cerca de 17 s |
| `POST /v1/audio/transcriptions` | o WAV acima, `language: "pt"` | 200, `"Eu sou a Maíndia e sua mãe prefere que você ligue depois das 18 horas."`, cerca de 12 s |

A API local não pediu autenticação (sessão local, `127.0.0.1`). Também existem MCP e WebSocket de ditado, que o MAINDY não usa.

## Integração no MAINDY

- `VoiceStudioProvider` (`packages/core/src/voice/providers.ts`) implementa `VoiceProvider`: `synthesize`, `transcribe`, `getVoices` e `health`.
- É o provedor padrão. Se estiver indisponível, a API usa o próximo provedor saudável (ElevenLabs, depois OpenAI) quando houver chave configurada.
- Teste E2E "Scenario C" (`apps/api/test/e2e/scenarios.test.ts`), que passou: gera uma pergunta falada em pt-BR, envia a `/v1/agent/voice`, o agente responde com a memória certa e a resposta é sintetizada.

## Limites reais

- O VoiceStudio roda **no Mac (ou servidor) onde está instalado**, não no celular. O app envia o áudio à API do MAINDY, que fala com o VoiceStudio. Em produção é preciso hospedá-lo num servidor com GPU/Metal (tem Docker: `docs/install/docker.md` do projeto) ou usar ElevenLabs/OpenAI.
- Latência local: de 12 a 20 s por síntese ou transcrição neste MacBook Air, o que é lento para conversa. Para conversa fluida, use GPU dedicada ou um provedor em nuvem.
- **Nenhuma voz foi clonada.** A voz padrão é a do motor ativo. A clonagem está disponível na interface do VoiceStudio, mas exige gravação e consentimento do dono da voz.
- Uso comercial: a AGPL exige publicar o código de quem o modifica e oferece como serviço. O VoiceStudio também vende licença comercial. Revise antes de lançar.

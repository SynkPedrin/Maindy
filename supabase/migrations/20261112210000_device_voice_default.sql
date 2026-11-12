-- The phone's own TTS answers instantly; server voices (VoiceStudio/ElevenLabs/OpenAI) stay selectable.
alter table maindy.agents alter column voice_provider set default 'device';

import type { VoiceOption } from '../contracts/index.js';

/**
 * Voice provider abstraction. Every provider is a real HTTP integration; a provider
 * that is not configured or not reachable reports `available: false` — never a fake voice.
 */

export interface SynthesisInput {
  text: string;
  voiceId: string;
  language: string;
  style?: string;
  speed?: number;
  signal?: AbortSignal;
}

export interface AudioResult {
  audio: Uint8Array;
  mimeType: string;
}

export interface TranscriptionInput {
  audio: Uint8Array;
  mimeType: string;
  fileName?: string;
  language?: string;
  signal?: AbortSignal;
}

export interface Transcript {
  text: string;
  language: string | null;
}

export interface VoiceProvider {
  readonly id: string;
  readonly label: string;
  synthesize(input: SynthesisInput): Promise<AudioResult>;
  transcribe(input: TranscriptionInput): Promise<Transcript>;
  getVoices(): Promise<VoiceOption[]>;
  health(): Promise<{ available: boolean; detail?: string }>;
}

export class VoiceProviderError extends Error {
  constructor(readonly provider: string, message: string, readonly status?: number) {
    super(`[${provider}] ${message}`);
    this.name = 'VoiceProviderError';
  }
}

async function fetchJson(url: string, init: RequestInit, provider: string, timeoutMs = 10_000): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new VoiceProviderError(provider, `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status);
  return res.json();
}

function audioBlob(input: TranscriptionInput): Blob {
  const copy = new Uint8Array(input.audio.byteLength);
  copy.set(input.audio);
  return new Blob([copy.buffer], { type: input.mimeType });
}

/**
 * VoiceStudio (local, open-source; com.voicestudio.desktop 0.5.7). Exposes an
 * OpenAI-compatible audio API on 127.0.0.1:3900 (/v1/audio/speech, /v1/audio/transcriptions,
 * /v1/audio/voices, /v1/models) — verified on this machine, see docs/VOICESTUDIO_AUDIT.md.
 * Runs only where the desktop app runs (development Mac / self-hosted server).
 */
export class VoiceStudioProvider implements VoiceProvider {
  readonly id = 'voicestudio';
  readonly label = 'VoiceStudio (local)';
  constructor(private readonly baseUrl: string) {}

  async health() {
    try {
      await fetchJson(`${this.baseUrl}/v1/models`, {}, this.id, 3_000);
      return { available: true };
    } catch (err) {
      return { available: false, detail: (err as Error).message };
    }
  }

  async getVoices(): Promise<VoiceOption[]> {
    const data = (await fetchJson(`${this.baseUrl}/v1/audio/voices`, {}, this.id)) as {
      voices?: Array<{ voice_id: string; name?: string; type?: string; language?: string | null; description?: string }>;
    };
    return (data.voices ?? [])
      .filter((v) => v.type !== 'openai_alias' || v.voice_id === 'alloy')
      .map((v) => ({
        id: v.voice_id,
        name: v.type === 'openai_alias' ? 'Voz padrão do motor ativo' : (v.name ?? v.voice_id),
        provider: this.id,
        language: v.language ?? null,
        ...(v.description ? { description: v.description } : {}),
      }));
  }

  async synthesize(input: SynthesisInput): Promise<AudioResult> {
    const res = await fetch(`${this.baseUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'tts-1',
        input: input.text,
        voice: input.voiceId || 'alloy',
        language: input.language.slice(0, 2),
        speed: input.speed ?? 1,
        response_format: 'wav',
        ...(input.style ? { instructions: input.style } : {}),
      }),
      signal: input.signal ?? AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new VoiceProviderError(this.id, `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status);
    return { audio: new Uint8Array(await res.arrayBuffer()), mimeType: 'audio/wav' };
  }

  async transcribe(input: TranscriptionInput): Promise<Transcript> {
    const form = new FormData();
    form.append('file', audioBlob(input), input.fileName ?? 'audio.m4a');
    form.append('model', 'whisper-1');
    if (input.language) form.append('language', input.language.slice(0, 2));
    const data = (await fetchJson(`${this.baseUrl}/v1/audio/transcriptions`, { method: 'POST', body: form, signal: input.signal ?? AbortSignal.timeout(120_000) }, this.id)) as { text?: string };
    return { text: (data.text ?? '').trim(), language: input.language ?? null };
  }
}

/** ElevenLabs (cloud). Requires ELEVENLABS_API_KEY. */
export class ElevenLabsProvider implements VoiceProvider {
  readonly id = 'elevenlabs';
  readonly label = 'ElevenLabs';
  private readonly base = 'https://api.elevenlabs.io';
  constructor(private readonly apiKey: string | undefined, private readonly modelId = 'eleven_multilingual_v2') {}

  private headers(): Record<string, string> {
    if (!this.apiKey) throw new VoiceProviderError(this.id, 'ELEVENLABS_API_KEY is not configured');
    return { 'xi-api-key': this.apiKey };
  }

  async health() {
    if (!this.apiKey) return { available: false, detail: 'not configured' };
    try {
      await fetchJson(`${this.base}/v1/voices`, { headers: this.headers() }, this.id, 5_000);
      return { available: true };
    } catch (err) {
      return { available: false, detail: (err as Error).message };
    }
  }

  async getVoices(): Promise<VoiceOption[]> {
    const data = (await fetchJson(`${this.base}/v1/voices`, { headers: this.headers() }, this.id)) as {
      voices?: Array<{ voice_id: string; name: string; labels?: Record<string, string>; description?: string }>;
    };
    return (data.voices ?? []).map((v) => ({ id: v.voice_id, name: v.name, provider: this.id, language: v.labels?.language ?? null, ...(v.description ? { description: v.description } : {}) }));
  }

  async synthesize(input: SynthesisInput): Promise<AudioResult> {
    const res = await fetch(`${this.base}/v1/text-to-speech/${encodeURIComponent(input.voiceId)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: input.text, model_id: this.modelId, language_code: input.language.slice(0, 2), voice_settings: { speed: input.speed ?? 1 } }),
      signal: input.signal ?? AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new VoiceProviderError(this.id, `HTTP ${res.status}`, res.status);
    return { audio: new Uint8Array(await res.arrayBuffer()), mimeType: 'audio/mpeg' };
  }

  async transcribe(input: TranscriptionInput): Promise<Transcript> {
    const form = new FormData();
    form.append('file', audioBlob(input), input.fileName ?? 'audio.m4a');
    form.append('model_id', 'scribe_v1');
    if (input.language) form.append('language_code', input.language.slice(0, 2));
    const data = (await fetchJson(`${this.base}/v1/speech-to-text`, { method: 'POST', headers: this.headers(), body: form, signal: input.signal ?? AbortSignal.timeout(60_000) }, this.id)) as { text?: string; language_code?: string };
    return { text: (data.text ?? '').trim(), language: data.language_code ?? null };
  }
}

/** OpenAI Audio (cloud). Requires OPENAI_API_KEY. */
export class OpenAIAudioProvider implements VoiceProvider {
  readonly id = 'openai';
  readonly label = 'OpenAI Audio';
  private readonly base = 'https://api.openai.com';
  private static readonly VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];
  constructor(private readonly apiKey: string | undefined) {}

  private headers(): Record<string, string> {
    if (!this.apiKey) throw new VoiceProviderError(this.id, 'OPENAI_API_KEY is not configured');
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  async health() {
    if (!this.apiKey) return { available: false, detail: 'not configured' };
    try {
      await fetchJson(`${this.base}/v1/models`, { headers: this.headers() }, this.id, 5_000);
      return { available: true };
    } catch (err) {
      return { available: false, detail: (err as Error).message };
    }
  }

  async getVoices(): Promise<VoiceOption[]> {
    if (!this.apiKey) throw new VoiceProviderError(this.id, 'OPENAI_API_KEY is not configured');
    return OpenAIAudioProvider.VOICES.map((v) => ({ id: v, name: v.charAt(0).toUpperCase() + v.slice(1), provider: this.id, language: null }));
  }

  async synthesize(input: SynthesisInput): Promise<AudioResult> {
    const res = await fetch(`${this.base}/v1/audio/speech`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        input: input.text,
        voice: input.voiceId,
        speed: input.speed ?? 1,
        response_format: 'mp3',
        instructions: input.style ?? 'Fale em português do Brasil, com tom caloroso, natural e conversacional.',
      }),
      signal: input.signal ?? AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new VoiceProviderError(this.id, `HTTP ${res.status}`, res.status);
    return { audio: new Uint8Array(await res.arrayBuffer()), mimeType: 'audio/mpeg' };
  }

  async transcribe(input: TranscriptionInput): Promise<Transcript> {
    const form = new FormData();
    form.append('file', audioBlob(input), input.fileName ?? 'audio.m4a');
    form.append('model', 'gpt-4o-transcribe');
    if (input.language) form.append('language', input.language.slice(0, 2));
    const data = (await fetchJson(`${this.base}/v1/audio/transcriptions`, { method: 'POST', headers: this.headers(), body: form, signal: input.signal ?? AbortSignal.timeout(60_000) }, this.id)) as { text?: string };
    return { text: (data.text ?? '').trim(), language: input.language ?? null };
  }
}

export class VoiceRegistry {
  private readonly providers = new Map<string, VoiceProvider>();
  register(p: VoiceProvider): this {
    this.providers.set(p.id, p);
    return this;
  }
  get(id: string): VoiceProvider {
    const p = this.providers.get(id);
    if (!p) throw new VoiceProviderError(id, 'unknown voice provider');
    return p;
  }
  list(): VoiceProvider[] {
    return [...this.providers.values()];
  }
  /** first provider (in registration order) that is healthy */
  async firstAvailable(preferred?: string): Promise<VoiceProvider | null> {
    const order = preferred ? [preferred, ...[...this.providers.keys()].filter((k) => k !== preferred)] : [...this.providers.keys()];
    for (const id of order) {
      const p = this.providers.get(id);
      if (p && (await p.health()).available) return p;
    }
    return null;
  }
}

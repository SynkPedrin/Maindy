import { requireOptionalNativeModule } from 'expo';
import {
  RecordingPresets,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type AudioPlayer,
} from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { create } from 'zustand';
import type { ChatResponse } from '@maindy/core/contracts';
import { api, ApiError, type VoiceChatResponse } from './api';
import { haptic } from './haptics';

/** Voice interaction state machine (spec §13). */
export type VoiceState = 'idle' | 'pressed' | 'listening' | 'processing' | 'speaking' | 'interrupted' | 'error';

interface VoiceStore {
  state: VoiceState;
  error: string | null;
  lastTranscript: string | null;
  partial: string | null;
  level: number; // 0..1 input level while listening (drives the orb)
  set: (p: Partial<Omit<VoiceStore, 'set'>>) => void;
}

export const useVoiceStore = create<VoiceStore>((set) => ({ state: 'idle', error: null, lastTranscript: null, partial: null, level: 0, set: (p) => set(p) }));

const MIN_RECORDING_MS = 450;

/** On-device speech recognition (expo-speech-recognition). Absent in Expo Go and on the web. */
interface SpeechRecognitionNative {
  start(options: Record<string, unknown>): void;
  stop(): void;
  abort(): void;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  isRecognitionAvailable(): boolean;
  addListener(event: string, cb: (e: any) => void): { remove(): void };
}
const recognizer = Platform.OS === 'web' ? null : requireOptionalNativeModule<SpeechRecognitionNative>('ExpoSpeechRecognition');

/** Set when the phone's recognizer can't serve pt-BR (no language pack / service); we then use the server. */
let deviceBroken = false;
const FATAL_RECOGNIZER_ERRORS = ['language-not-supported', 'service-not-allowed', 'not-allowed', 'audio-capture', 'busy'];

export function deviceRecognitionAvailable(): boolean {
  if (deviceBroken) return false;
  try {
    return Boolean(recognizer?.isRecognitionAvailable());
  } catch {
    return false;
  }
}

/** Speaks text with the phone's own voice (instant). Resolves when finished or stopped. */
export function speakOnDevice(text: string, rate = 1): Promise<void> {
  return new Promise((resolve) => {
    Speech.stop();
    Speech.speak(text, { language: 'pt-BR', rate, pitch: 1.0, onDone: () => resolve(), onStopped: () => resolve(), onError: () => resolve() });
  });
}

async function toFormFile(uri: string): Promise<{ part: Blob | { uri: string; name: string; type: string }; name: string }> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    return { part: blob, name: blob.type.includes('webm') ? 'fala.webm' : 'fala.m4a' };
  }
  const name = uri.endsWith('.wav') ? 'fala.wav' : 'fala.m4a';
  return { part: { uri, name, type: name.endsWith('.wav') ? 'audio/wav' : 'audio/m4a' }, name };
}

export type VoiceResult = ChatResponse & { transcript: string; speech?: VoiceChatResponse['speech'] };

/**
 * Push-to-talk session: press & hold → listen; release → understand + agent + speak.
 * - With on-device recognition (installed app): the phone transcribes in real time (pt-BR).
 * - Without it (Expo Go / web): the audio is sent once to the API for transcription and discarded.
 * - The reply is spoken by the phone (voiceProvider "device", instant) or by the server voice.
 */
export function useVoiceSession(opts: { conversationId: string | null; voiceProvider?: string; speechRate?: number; speak?: boolean; onResult: (r: VoiceResult) => void }) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }, (status) => {
    const db = (status as { metering?: number }).metering;
    if (typeof db === 'number') useVoiceStore.getState().set({ level: Math.max(0, Math.min(1, (db + 60) / 60)) });
  });
  const player = useRef<AudioPlayer | null>(null);
  const startedAt = useRef(0);
  const cancelled = useRef(false);
  const usingDevice = useRef(false);
  const transcript = useRef('');
  const finalResolve = useRef<((t: string) => void) | null>(null);
  const set = useVoiceStore((s) => s.set);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // on-device recognition events
  useEffect(() => {
    if (!recognizer) return;
    const subs = [
      recognizer.addListener('result', (e: { isFinal: boolean; results: Array<{ transcript: string }> }) => {
        const t = e.results?.[0]?.transcript ?? '';
        if (t) transcript.current = t;
        useVoiceStore.getState().set({ partial: t || null });
        if (e.isFinal && finalResolve.current) finalResolve.current(transcript.current);
      }),
      recognizer.addListener('volumechange', (e: { value: number }) => {
        useVoiceStore.getState().set({ level: Math.max(0, Math.min(1, (e.value + 2) / 12)) });
      }),
      recognizer.addListener('end', () => finalResolve.current?.(transcript.current)),
      recognizer.addListener('error', (e: { error?: string; message?: string }) => {
        const code = e?.error ?? '';
        const lang = /language|locale|pack/i.test(e?.message ?? '');
        if (FATAL_RECOGNIZER_ERRORS.includes(code) || lang) {
          deviceBroken = true;
          if (useVoiceStore.getState().state === 'listening') {
            useVoiceStore.getState().set({ state: 'error', error: 'O reconhecimento de voz do aparelho não está disponível. Segure de novo: vou transcrever pelo servidor.', level: 0 });
            setTimeout(() => useVoiceStore.getState().state === 'error' && useVoiceStore.getState().set({ state: 'idle' }), 3200);
          }
        }
        finalResolve.current?.(transcript.current);
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);

  const stopPlayback = useCallback(() => {
    Speech.stop();
    if (player.current) {
      player.current.pause();
      player.current.remove();
      player.current = null;
    }
  }, []);

  const fail = useCallback(
    (msg: string) => {
      set({ state: 'error', error: msg, level: 0, partial: null });
      haptic('error');
      setTimeout(() => useVoiceStore.getState().state === 'error' && set({ state: 'idle' }), 2600);
    },
    [set],
  );

  const start = useCallback(async () => {
    stopPlayback();
    cancelled.current = false;
    transcript.current = '';
    set({ state: 'pressed', error: null, partial: null });
    haptic('press');
    usingDevice.current = deviceRecognitionAvailable();
    if (usingDevice.current) {
      const perm = await recognizer!.requestPermissionsAsync();
      if (!perm.granted) return fail('Permita o microfone e o reconhecimento de fala para falar com a assistente.');
      recognizer!.start({ lang: 'pt-BR', interimResults: true, continuous: true, addsPunctuation: true, volumeChangeEventOptions: { enabled: true, intervalMillis: 120 } });
    } else {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) return fail('Permita o microfone nas configurações para falar com a assistente.');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    }
    startedAt.current = Date.now();
    set({ state: 'listening' });
    haptic('start');
  }, [fail, recorder, set, stopPlayback]);

  const speakReply = useCallback(
    async (r: VoiceResult) => {
      const o = optsRef.current;
      if (o.speak === false || cancelled.current) return set({ state: 'idle' });
      if (r.speech && o.voiceProvider !== 'device') {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        let source: string;
        if (Platform.OS === 'web') source = `data:${r.speech.mimeType};base64,${r.speech.audioBase64}`;
        else {
          const file = new File(Paths.cache, `maindy-reply-${Date.now()}.${r.speech.mimeType.includes('wav') ? 'wav' : 'mp3'}`);
          await file.write(r.speech.audioBase64, { encoding: 'base64' });
          source = file.uri;
        }
        const p = createAudioPlayer(source);
        player.current = p;
        set({ state: 'speaking' });
        p.addListener('playbackStatusUpdate', (st) => {
          if (st.didJustFinish && player.current === p) {
            stopPlayback();
            set({ state: 'idle' });
          }
        });
        p.play();
        return;
      }
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
      set({ state: 'speaking' });
      await speakOnDevice(r.reply, o.speechRate ?? 1);
      if (useVoiceStore.getState().state === 'speaking') set({ state: 'idle' });
    },
    [set, stopPlayback],
  );

  const stop = useCallback(
    async (o2: { cancel?: boolean } = {}) => {
      const state = useVoiceStore.getState().state;
      if (state !== 'listening' && state !== 'pressed') return;
      const duration = Date.now() - startedAt.current;
      const cancel = o2.cancel || cancelled.current || duration < MIN_RECORDING_MS;
      set({ level: 0 });
      try {
        if (usingDevice.current) {
          if (cancel) {
            recognizer!.abort();
            set({ state: 'idle', partial: null });
            return haptic('cancel');
          }
          set({ state: 'processing' });
          haptic('commit');
          const text = await new Promise<string>((resolve) => {
            finalResolve.current = resolve;
            recognizer!.stop();
            setTimeout(() => resolve(transcript.current), 2500);
          });
          finalResolve.current = null;
          set({ partial: null });
          if (!text.trim()) return fail(deviceBroken ? 'O reconhecimento do aparelho falhou. Segure de novo: vou usar o servidor.' : 'Não ouvi nada. Segure o orb enquanto fala.');
          set({ lastTranscript: text });
          const chat = await api.chat(text.trim(), optsRef.current.conversationId);
          const r: VoiceResult = { ...chat, transcript: text.trim() };
          optsRef.current.onResult(r);
          await speakReply(r);
          return;
        }
        try {
          await recorder.stop();
        } catch {
          /* not started */
        }
        if (cancel || !recorder.uri) {
          set({ state: 'idle' });
          return haptic('cancel');
        }
        set({ state: 'processing' });
        haptic('commit');
        const { part, name } = await toFormFile(recorder.uri);
        const form = new FormData();
        form.append('audio', part as Blob, name);
        if (optsRef.current.conversationId) form.append('conversationId', optsRef.current.conversationId);
        if (optsRef.current.voiceProvider === 'device') form.append('speak', 'false');
        const res = await api.voiceChat(form);
        set({ lastTranscript: res.transcript });
        optsRef.current.onResult(res);
        await speakReply(res);
      } catch (err) {
        fail(err instanceof ApiError ? err.message : 'Não consegui processar o áudio.');
      }
    },
    [fail, recorder, set, speakReply],
  );

  /** Interrupts the spoken reply (or an in-flight request). */
  const interrupt = useCallback(() => {
    cancelled.current = true;
    stopPlayback();
    set({ state: 'interrupted' });
    haptic('cancel');
    setTimeout(() => useVoiceStore.getState().state === 'interrupted' && set({ state: 'idle' }), 500);
  }, [set, stopPlayback]);

  return { start, stop, interrupt };
}

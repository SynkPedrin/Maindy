import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { useRef, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { Header } from '@/components/Header';
import { Orb } from '@/components/Orb';
import { Button, Chip, Field, Screen, Section, T, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/theme';

const SAMPLE = 'Oi! Eu sou a sua assistente. Sua mãe prefere que você ligue depois das seis da tarde.';

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return globalThis.btoa(bin);
}

export default function VoiceStudio() {
  const qc = useQueryClient();
  const agent = useQuery({ queryKey: ['agent'], queryFn: api.agent });
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const providers = useQuery({ queryKey: ['voice-providers'], queryFn: api.voiceProviders });
  const provider = agent.data?.voiceProvider ?? 'device';
  const voices = useQuery({
    queryKey: ['voices', provider],
    queryFn: async () => {
      if (provider !== 'device') return api.voices(provider);
      const all = await Speech.getAvailableVoicesAsync().catch(() => []);
      const pt = all.filter((v) => v.language?.toLowerCase().startsWith('pt'));
      return (pt.length ? pt : all.slice(0, 8)).map((v) => ({ id: v.identifier, name: v.name, provider: 'device', language: v.language ?? null }));
    },
    retry: false,
  });
  const [sample, setSample] = useState(SAMPLE);
  const [playing, setPlaying] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const player = useRef<AudioPlayer | null>(null);
  const speed = settings.data?.speechRate ?? 1;

  const preview = async (voiceId: string) => {
    setErr(null);
    setPlaying(voiceId);
    if (provider === 'device') {
      Speech.stop();
      Speech.speak(sample, { language: 'pt-BR', voice: voiceId || undefined, rate: speed, onDone: () => setPlaying(null), onStopped: () => setPlaying(null), onError: () => setPlaying(null) });
      return;
    }
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch(api.voicePreviewUrl(), {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, voiceId, text: sample, language: agent.data?.language ?? 'pt-BR', speed }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ message: `Erro ${res.status}` }))).message);
      const mime = res.headers.get('content-type') ?? 'audio/wav';
      const b64 = toBase64(await res.arrayBuffer());
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      let src = `data:${mime};base64,${b64}`;
      if (Platform.OS !== 'web') {
        const f = new File(Paths.cache, `preview-${Date.now()}.${mime.includes('wav') ? 'wav' : 'mp3'}`);
        await f.write(b64, { encoding: 'base64' });
        src = f.uri;
      }
      player.current?.remove();
      const p = createAudioPlayer(src);
      player.current = p;
      p.addListener('playbackStatusUpdate', (s) => s.didJustFinish && setPlaying(null));
      p.play();
    } catch (e) {
      setErr((e as Error).message);
      setPlaying(null);
    }
  };

  const select = async (patch: { voiceProvider?: 'device' | 'voicestudio' | 'elevenlabs' | 'openai'; voiceId?: string }) => {
    await api.updateAgent(patch);
    void qc.invalidateQueries({ queryKey: ['agent'] });
    void qc.invalidateQueries({ queryKey: ['me'] });
  };

  return (
    <Screen>
      <Header title="Voice Studio" subtitle="Escolha como a sua assistente fala." />
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl, paddingBottom: 80 }}>
        <View style={{ alignItems: 'center' }}>
          <Orb state={playing ? 'speaking' : 'idle'} size={130} />
        </View>
        <Section title="Provedor">
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            <Chip label="Voz do aparelho (instantânea)" active={provider === 'device'} onPress={() => select({ voiceProvider: 'device' })} />
            {(providers.data ?? []).map((p) => (
              <Chip key={p.id} label={`${p.label}${p.available ? '' : ' (indisponível)'}`} active={provider === p.id} onPress={() => select({ voiceProvider: p.id as 'voicestudio' })} />
            ))}
          </View>
          <T variant="caption" color={colors.textSecondary}>
            A voz do aparelho responde na hora. VoiceStudio roda no servidor (mais natural, porém mais lento neste Mac). ElevenLabs e OpenAI exigem chave no servidor.
          </T>
        </Section>
        <Section title="Frase de teste">
          <Field value={sample} onChangeText={setSample} multiline maxLength={400} />
        </Section>
        <Section title="Vozes">
          {voices.isError ? <T variant="caption" color={colors.danger}>{(voices.error as Error).message}</T> : null}
          {(voices.data ?? []).map((v) => (
            <View key={v.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm }}>
              <View style={{ flex: 1 }}>
                <T variant="bodyStrong">{v.name}</T>
                <T variant="caption" color={colors.textSecondary}>{v.language ?? 'multilíngue'}{agent.data?.voiceId === v.id ? ' · selecionada' : ''}</T>
              </View>
              <Chip label={playing === v.id ? 'Tocando…' : 'Ouvir'} onPress={() => preview(v.id)} />
              <Chip label="Usar" active={agent.data?.voiceId === v.id} onPress={() => select({ voiceId: v.id })} />
            </View>
          ))}
          {err ? <T variant="caption" color={colors.danger}>{err}</T> : null}
        </Section>
        <Section title="Comportamento">
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            {[0.85, 1, 1.15, 1.3].map((r) => <Chip key={r} label={`${r}×`} active={Math.abs(speed - r) < 0.01} onPress={async () => { await api.updateSettings({ speechRate: r }); void qc.invalidateQueries({ queryKey: ['settings'] }); }} />)}
          </View>
          {settings.data ? <Toggle label="Responder em voz alta" value={settings.data.speakResponses} onChange={async (v) => { await api.updateSettings({ speakResponses: v }); void qc.invalidateQueries({ queryKey: ['settings'] }); }} /> : null}
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            {(['curto', 'equilibrado', 'detalhado'] as const).map((s) => <Chip key={s} label={{ curto: 'Respostas curtas', equilibrado: 'Respostas equilibradas', detalhado: 'Respostas detalhadas' }[s]} active={agent.data?.responseStyle === s} onPress={async () => { await api.updateAgent({ responseStyle: s }); void qc.invalidateQueries({ queryKey: ['agent'] }); }} />)}
          </View>
          <T variant="caption" color={colors.textSecondary}>Nenhuma voz foi clonada. As vozes listadas vêm do provedor selecionado.</T>
        </Section>
        <Button kind="secondary" label="Concluído" onPress={() => { void qc.invalidateQueries(); router.back(); }} />
      </ScrollView>
    </Screen>
  );
}

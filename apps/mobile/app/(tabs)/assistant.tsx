import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import type { ActionSummary, ChatResponse } from '@maindy/core/contracts';
import { VoiceButton } from '@/components/VoiceButton';
import { Chip, Field, Screen, T, Tap } from '@/components/ui';
import { api } from '@/lib/api';
import { PROVENANCE_LABEL, relativeDay } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useVoiceSession, useVoiceStore } from '@/lib/voice';
import { colors, radius, space } from '@/theme';

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  refs?: ChatResponse['memoryRefs'];
  actions?: ActionSummary[];
  mode?: ChatResponse['mode'];
  viaVoice?: boolean;
}

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

function ActionCard({ a, onDecide }: { a: ActionSummary; onDecide: (id: string, approve: boolean) => void }) {
  const pending = a.status === 'awaiting_confirmation';
  const color = a.status === 'succeeded' ? colors.success : a.status === 'rejected' || a.status === 'failed' ? colors.danger : colors.yellow;
  const label: Record<string, string> = { succeeded: 'Feito', awaiting_confirmation: 'Precisa da sua confirmação', rejected: 'Não autorizado', failed: 'Falhou', expired: 'Expirou', executing: 'Executando', planned: 'Planejado' };
  return (
    <View style={{ backgroundColor: 'rgba(255,196,0,0.06)', borderRadius: radius.md, padding: space.md, gap: space.sm, marginTop: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <T variant="caption" color={color}>{label[a.status] ?? a.status}</T>
      </View>
      <T variant="body">{a.summary}</T>
      {pending ? (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Chip label="Confirmar" active onPress={() => onDecide(a.id, true)} />
          <Chip label="Cancelar" onPress={() => onDecide(a.id, false)} />
        </View>
      ) : null}
    </View>
  );
}

export default function Assistant() {
  const params = useLocalSearchParams<{ voice?: string; q?: string }>();
  const qc = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState(params.q ?? '');
  const list = useRef<FlatList<Msg>>(null);
  const voiceState = useVoiceStore((s) => s.state);
  const partial = useVoiceStore((s) => s.partial);

  const push = (m: Msg) => setMessages((prev) => [...prev, m]);
  const absorb = (r: ChatResponse, viaVoice = false) => {
    setConversationId(r.conversationId);
    push({ id: r.messageId, role: 'assistant', text: r.reply, refs: r.memoryRefs, actions: r.actions.filter((a) => a.tool !== 'search_memories'), mode: r.mode, viaVoice });
    void qc.invalidateQueries({ queryKey: ['home'] });
  };

  const chat = useMutation({
    mutationFn: (msg: string) => api.chat(msg, conversationId),
    onMutate: (msg) => push({ id: `u-${Date.now()}`, role: 'user', text: msg }),
    onSuccess: (r) => absorb(r),
    onError: (e: Error) => push({ id: `e-${Date.now()}`, role: 'assistant', text: e.message }),
  });

  const me = useQuery({ queryKey: ['me'], queryFn: api.me });
  const voice = useVoiceSession({
    conversationId,
    voiceProvider: me.data?.agent.voiceProvider,
    speechRate: me.data?.settings.speechRate,
    speak: me.data?.settings.speakResponses,
    onResult: (r) => {
      push({ id: `v-${Date.now()}`, role: 'user', text: r.transcript, viaVoice: true });
      absorb(r, true);
    },
  });

  const decide = async (id: string, approve: boolean) => {
    try {
      const updated = await api.confirmAction(id, approve);
      haptic(updated.status === 'succeeded' ? 'success' : 'cancel');
      setMessages((prev) => prev.map((m) => ({ ...m, actions: m.actions?.map((a) => (a.id === id ? updated : a)) })));
      void qc.invalidateQueries();
    } catch (e) {
      push({ id: `e-${Date.now()}`, role: 'assistant', text: (e as Error).message });
    }
  };

  useEffect(() => {
    if (messages.length) setTimeout(() => list.current?.scrollToEnd({ animated: true }), 60);
  }, [messages.length]);

  const send = () => {
    const m = text.trim();
    if (!m || chat.isPending) return;
    setText('');
    chat.mutate(m);
  };

  const compact = messages.length > 0;

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <View style={{ alignItems: 'center', paddingTop: compact ? space.sm : space.xxxl }}>
          <VoiceButton size={compact ? 120 : 220} onStart={voice.start} onStop={voice.stop} onInterrupt={voice.interrupt} />
          {params.voice && !compact && voiceState === 'idle' ? <T variant="caption" color={colors.yellow} style={{ marginTop: space.xs }}>Segure o orb e fale</T> : null}
          {partial ? <T variant="body" color={colors.textPrimary} style={{ marginTop: space.xs, paddingHorizontal: space.xl, textAlign: 'center' }} numberOfLines={3}>“{partial}”</T> : null}
        </View>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md, flexGrow: 1, justifyContent: compact ? 'flex-start' : 'center' }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', gap: space.md }}>
              <T variant="body" color={colors.textSecondary} style={{ textAlign: 'center' }}>Conte algo para lembrar, pergunte, ou peça um lembrete.</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' }}>
                {['O que eu tenho para hoje?', 'Me lembra de beber água em 30 minutos', 'Estacionei no piso G2, vaga 41'].map((s) => (
                  <Chip key={s} label={s} onPress={() => chat.mutate(s)} />
                ))}
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <Animated.View entering={FadeInUp.duration(280)} style={{ alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
              <View style={{ backgroundColor: item.role === 'user' ? colors.purple : colors.surface, borderRadius: radius.lg, borderBottomRightRadius: item.role === 'user' ? 6 : radius.lg, borderBottomLeftRadius: item.role === 'user' ? radius.lg : 6, padding: space.md }}>
                <T variant="body">{item.text}</T>
                {item.refs && item.refs.length > 0 ? (
                  <View style={{ marginTop: space.sm, gap: 4 }}>
                    {item.refs.slice(0, 3).map((r) => (
                      <Tap key={r.id} onPress={() => router.push(`/memory/${r.id}`)} accessibilityRole="link" scaleTo={0.98}>
                        <T variant="caption" color={colors.purpleLight}>↳ {r.title} · {PROVENANCE_LABEL[r.provenance]} · {relativeDay(r.createdAt, TZ)}</T>
                      </Tap>
                    ))}
                  </View>
                ) : null}
                {item.actions?.map((a) => <ActionCard key={a.id} a={a} onDecide={decide} />)}
              </View>
              {item.mode === 'offline' ? <T variant="caption" color={colors.textSecondary} style={{ marginTop: 4 }}>modo local (sem IA na nuvem)</T> : null}
            </Animated.View>
          )}
        />
        <View style={{ flexDirection: 'row', gap: space.sm, padding: space.lg, paddingBottom: 112, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Field placeholder="Escreva para a assistente…" value={text} onChangeText={setText} onSubmitEditing={send} returnKeyType="send" accessibilityLabel="Mensagem" />
          </View>
          <Tap onPress={send} disabled={!text.trim() || chat.isPending} accessibilityRole="button" accessibilityLabel="Enviar" style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: text.trim() ? colors.purple : colors.surfaceLight, alignItems: 'center', justifyContent: 'center' }}>
            <T variant="heading">↑</T>
          </Tap>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import { Orb } from '@/components/Orb';
import { Empty, Field, Screen, Section, Surface, T, Tap } from '@/components/ui';
import { api } from '@/lib/api';
import { FOCUS_LABEL, greeting, longDate, time, whenLabel } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { CATEGORY_ICON } from '@/lib/icons';
import { Widgets } from '@/lib/native';
import { colors, radius, space } from '@/theme';

export default function Home() {
  const qc = useQueryClient();
  const home = useQuery({ queryKey: ['home'], queryFn: api.home });
  const [text, setText] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: (msg: string) => api.chat(msg, null),
    onSuccess: (r) => {
      setText('');
      setToast(r.reply);
      haptic('success');
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
    onError: (e: Error) => setToast(e.message),
  });

  const complete = useMutation({
    mutationFn: (id: string) => api.updateTask(id, { status: 'done' }),
    onMutate: () => haptic('success'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['home'] }),
  });

  const d = home.data;

  useEffect(() => {
    if (!d) return;
    const next = d.upcomingReminders[0];
    Widgets.setSnapshot({
      greeting: `${greeting(new Date(d.now), d.timezone)}${d.profile?.displayName ? `, ${d.profile.displayName}` : ''}`,
      nextReminder: next ? { title: next.title, dueAt: next.remindAt } : null,
      focusMode: d.focus?.mode ?? 'off',
      pendingTasks: d.pendingTasks,
      updatedAt: new Date().toISOString(),
    });
  }, [d]);
  const tz = d?.timezone ?? 'America/Sao_Paulo';
  const now = d ? new Date(d.now) : new Date();
  const name = d?.profile?.displayName;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingBottom: 120, gap: space.xxl }} refreshControl={<RefreshControl refreshing={home.isRefetching} onRefresh={() => { void home.refetch(); }} tintColor={colors.purpleLight} />}>
        <Animated.View entering={FadeInDown.duration(420)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, gap: 4 }}>
            <T variant="caption" color={colors.textSecondary}>{longDate(now, tz)}</T>
            <T variant="title">{greeting(now, tz)}{name ? `, ${name}` : ''}.</T>
          </View>
          <Tap onPress={() => router.push('/(tabs)/assistant')} accessibilityLabel="Abrir a assistente" accessibilityRole="button">
            <Orb state={d?.focus ? 'focus' : home.isError ? 'offline' : 'idle'} size={84} />
          </Tap>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(420)} style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Field placeholder="Anote ou pergunte algo…" value={text} onChangeText={setText} onSubmitEditing={() => text.trim() && send.mutate(text.trim())} returnKeyType="send" accessibilityLabel="Entrada rápida" />
            </View>
            <Tap onPress={() => router.push({ pathname: '/(tabs)/assistant', params: { voice: '1' } })} accessibilityRole="button" accessibilityLabel="Falar por voz" style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' }}>
              <Image source={require('../../assets/onboarding/voice.png')} style={{ width: 40, height: 40 }} contentFit="contain" />
            </Tap>
          </View>
          {toast ? (
            <Animated.View entering={FadeInDown} layout={Layout}>
              <Surface style={{ flexDirection: 'row', gap: space.md }}>
                <T variant="body" style={{ flex: 1 }}>{toast}</T>
                <Tap onPress={() => setToast(null)} accessibilityLabel="Fechar" hitSlop={10}><T color={colors.textSecondary}>×</T></Tap>
              </Surface>
            </Animated.View>
          ) : null}
        </Animated.View>

        {home.isError ? (
          <Empty title="Sem conexão com a MAINDY" hint="Confira se o servidor está rodando e se o celular está na mesma rede." image={require('../../assets/assistant/orb-offline.png')} />
        ) : null}

        {d?.focus ? (
          <Tap onPress={() => router.push('/focus')} accessibilityRole="button">
            <Surface style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Image source={require('../../assets/navigation/focus.png')} style={{ width: 24, height: 24 }} tintColor={colors.yellow} />
              <T variant="bodyStrong" style={{ flex: 1 }}>Modo {FOCUS_LABEL[d.focus.mode]}</T>
              {d.focus.endsAt ? <T variant="caption" color={colors.textSecondary}>até {time(d.focus.endsAt, tz)}</T> : null}
            </Surface>
          </Tap>
        ) : null}

        <Section title="Prioridades de hoje" action={{ label: 'Tarefas', onPress: () => router.push('/tasks') }}>
          {d && d.priorities.length === 0 ? <T variant="body" color={colors.textSecondary}>Nada pendente. Aproveite.</T> : null}
          {d?.priorities.slice(0, 4).map((t) => (
            <Animated.View key={t.id} layout={Layout} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Tap onPress={() => complete.mutate(t.id)} accessibilityRole="checkbox" accessibilityState={{ checked: false }} accessibilityLabel={`Concluir ${t.title}`} style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: t.priority === 1 ? colors.yellow : colors.purpleLight }} scaleTo={0.8}>
                <View />
              </Tap>
              <View style={{ flex: 1 }}>
                <T variant="body">{t.title}</T>
                {t.dueAt ? <T variant="caption" color={colors.textSecondary}>{whenLabel(t.dueAt, tz)}</T> : null}
              </View>
            </Animated.View>
          ))}
        </Section>

        <Section title="Próximos lembretes" action={{ label: 'Agenda', onPress: () => router.push('/(tabs)/calendar') }}>
          {d && d.upcomingReminders.length === 0 ? <T variant="body" color={colors.textSecondary}>Nenhum lembrete agendado.</T> : null}
          {d?.upcomingReminders.slice(0, 3).map((r) => (
            <View key={r.id} style={{ flexDirection: 'row', gap: space.md, alignItems: 'baseline' }}>
              <T variant="bodyStrong" color={colors.yellow} style={{ width: 92 }}>{whenLabel(r.remindAt, tz)}</T>
              <T variant="body" style={{ flex: 1 }}>{r.title}</T>
            </View>
          ))}
        </Section>

        {d && d.todayEvents.length > 0 ? (
          <Section title="Agenda de hoje">
            {d.todayEvents.map((e) => (
              <View key={e.id} style={{ flexDirection: 'row', gap: space.md }}>
                <T variant="bodyStrong" color={colors.purpleLight} style={{ width: 56 }}>{time(e.startsAt, tz)}</T>
                <T variant="body" style={{ flex: 1 }}>{e.title}</T>
              </View>
            ))}
          </Section>
        ) : null}

        <Section title="Memórias recentes" action={{ label: 'Ver todas', onPress: () => router.push('/(tabs)/memories') }}>
          {d && d.recentMemories.length === 0 ? <T variant="body" color={colors.textSecondary}>Conte algo para a MAINDY guardar.</T> : null}
          {d?.recentMemories.slice(0, 3).map((m) => (
            <Tap key={m.id} onPress={() => router.push(`/memory/${m.id}`)} accessibilityRole="button" style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }} scaleTo={0.99}>
              <Image source={CATEGORY_ICON[m.category] ?? CATEGORY_ICON.personal} style={{ width: 40, height: 40 }} />
              <View style={{ flex: 1 }}>
                <T variant="body" numberOfLines={1}>{m.title}</T>
                <T variant="caption" color={colors.textSecondary}>{whenLabel(m.createdAt, tz)}</T>
              </View>
            </Tap>
          ))}
        </Section>
      </ScrollView>
    </Screen>
  );
}

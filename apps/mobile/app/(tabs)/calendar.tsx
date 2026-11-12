import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { describeRRulePtBr } from '@maindy/core/time';
import { Button, Chip, Field, Screen, Section, Surface, T, Tap } from '@/components/ui';
import { api } from '@/lib/api';
import { time } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { cancelLocalReminder, scheduleLocalReminder } from '@/lib/notifications';
import { colors, radius, space } from '@/theme';

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
type View3 = 'day' | 'week' | 'month';

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function confirmDialog(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : false);
  return new Promise((resolve) => Alert.alert(title, message, [{ text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) }, { text: 'Apagar', style: 'destructive', onPress: () => resolve(true) }]));
}

export default function Calendar() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<View3>('week');
  const [selected, setSelected] = useState(startOfDay(new Date()));
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('09:00');
  const [kind, setKind] = useState<'reminder' | 'event'>('reminder');
  const [repeat, setRepeat] = useState<string | null>(null);

  const range = useMemo(() => {
    if (mode === 'day') return { from: selected, to: addDays(selected, 1) };
    if (mode === 'week') {
      const s = addDays(selected, -selected.getDay());
      return { from: s, to: addDays(s, 7) };
    }
    const s = new Date(selected.getFullYear(), selected.getMonth(), 1);
    return { from: addDays(s, -s.getDay()), to: addDays(new Date(selected.getFullYear(), selected.getMonth() + 1, 1), 7) };
  }, [mode, selected]);

  const events = useQuery({ queryKey: ['events', range.from.toISOString(), range.to.toISOString()], queryFn: () => api.events(range.from.toISOString(), range.to.toISOString()) });
  const reminders = useQuery({ queryKey: ['reminders', range.from.toISOString(), range.to.toISOString()], queryFn: () => api.reminders(range.from.toISOString(), range.to.toISOString()) });

  const days = useMemo(() => {
    const out: Date[] = [];
    for (let d = new Date(range.from); d < range.to; d = addDays(d, 1)) out.push(d);
    return out;
  }, [range]);

  const has = (d: Date) => (events.data ?? []).some((e) => sameDay(new Date(e.startsAt), d)) || (reminders.data ?? []).some((r) => sameDay(new Date(r.remindAt), d));
  const dayEvents = (events.data ?? []).filter((e) => sameDay(new Date(e.startsAt), selected));
  const dayReminders = (reminders.data ?? []).filter((r) => sameDay(new Date(r.remindAt), selected));

  const create = useMutation({
    mutationFn: async () => {
      const [h, m] = newTime.split(':').map(Number);
      const at = new Date(selected);
      at.setHours(h ?? 9, m ?? 0, 0, 0);
      if (kind === 'reminder') {
        const r = await api.createReminder({ title: newTitle.trim(), remindAt: at.toISOString(), recurrenceRule: repeat });
        await scheduleLocalReminder(r);
        return r;
      }
      return api.createEvent({ title: newTitle.trim(), startsAt: at.toISOString(), endsAt: new Date(at.getTime() + 3_600_000).toISOString(), recurrenceRule: repeat });
    },
    onSuccess: () => {
      haptic('success');
      setNewTitle('');
      void qc.invalidateQueries();
    },
  });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingBottom: 120, gap: space.xl }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T variant="title">Agenda</T>
          <View style={{ flexDirection: 'row', gap: space.xs }}>
            {(['day', 'week', 'month'] as const).map((m) => <Chip key={m} label={{ day: 'Dia', week: 'Semana', month: 'Mês' }[m]} active={mode === m} onPress={() => setMode(m)} />)}
          </View>
        </View>
        <T variant="caption" color={colors.textSecondary}>
          {new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: TZ }).format(selected)} · fuso {TZ}
        </T>

        {mode !== 'day' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {WD.map((w, i) => <T key={i} variant="caption" color={colors.textSecondary} style={{ width: `${100 / 7}%`, textAlign: 'center' }}>{w}</T>)}
            {days.map((d) => {
              const isSel = sameDay(d, selected);
              const out = mode === 'month' && d.getMonth() !== selected.getMonth();
              return (
                <Tap key={d.toISOString()} onPress={() => setSelected(startOfDay(d))} accessibilityRole="button" accessibilityLabel={d.toDateString()} style={{ width: `${100 / 7}%`, alignItems: 'center', paddingVertical: space.sm }} scaleTo={0.9}>
                  <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: isSel ? colors.purple : sameDay(d, new Date()) ? colors.surfaceLight : 'transparent' }}>
                    <T variant="bodyStrong" color={out ? '#4A4E7A' : colors.textPrimary}>{d.getDate()}</T>
                  </View>
                  <View style={{ width: 4, height: 4, borderRadius: 2, marginTop: 3, backgroundColor: has(d) ? colors.yellow : 'transparent' }} />
                </Tap>
              );
            })}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <Chip label="‹ Anterior" onPress={() => setSelected(addDays(selected, -1))} />
            <T variant="bodyStrong" style={{ flex: 1, textAlign: 'center' }}>{new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' }).format(selected)}</T>
            <Chip label="Próximo ›" onPress={() => setSelected(addDays(selected, 1))} />
          </View>
        )}

        <Section title={new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(selected)}>
          {dayEvents.length === 0 && dayReminders.length === 0 ? <T variant="body" color={colors.textSecondary}>Dia livre.</T> : null}
          {dayEvents.map((e) => (
            <Animated.View key={e.id} entering={FadeIn} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
              <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colors.purple }} />
              <View style={{ flex: 1 }}>
                <T variant="bodyStrong">{e.title}</T>
                <T variant="caption" color={colors.textSecondary}>{time(e.startsAt, TZ)}–{time(e.endsAt, TZ)}{e.location ? ` · ${e.location}` : ''}{e.recurrenceRule ? ` · ${describeRRulePtBr(e.recurrenceRule)}` : ''}</T>
              </View>
              <Tap onPress={async () => { if (await confirmDialog('Apagar evento?', e.title)) { await api.deleteEvent(e.id); void qc.invalidateQueries(); } }} accessibilityLabel={`Apagar ${e.title}`} hitSlop={10}><T color={colors.textSecondary}>×</T></Tap>
            </Animated.View>
          ))}
          {dayReminders.map((r) => (
            <Animated.View key={r.id} entering={FadeIn} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
              <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colors.yellow }} />
              <View style={{ flex: 1 }}>
                <T variant="bodyStrong">{r.title}</T>
                <T variant="caption" color={colors.textSecondary}>{time(r.remindAt, TZ)} · lembrete{r.recurrenceRule ? ` · ${describeRRulePtBr(r.recurrenceRule)}` : ''}</T>
              </View>
              <Chip label="Concluir" onPress={async () => { await api.completeReminder(r.id); await cancelLocalReminder(r.id); haptic('success'); void qc.invalidateQueries(); }} />
            </Animated.View>
          ))}
        </Section>

        <Surface style={{ gap: space.md }}>
          <T variant="heading">Novo</T>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Chip label="Lembrete" active={kind === 'reminder'} onPress={() => setKind('reminder')} />
            <Chip label="Evento" active={kind === 'event'} onPress={() => setKind('event')} />
          </View>
          <Field placeholder={kind === 'reminder' ? 'Do que devo te lembrar?' : 'Título do evento'} value={newTitle} onChangeText={setNewTitle} />
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <View style={{ width: 110 }}><Field value={newTime} onChangeText={setNewTime} placeholder="09:00" keyboardType="numbers-and-punctuation" accessibilityLabel="Horário" /></View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }}>
              {[{ l: 'Não repete', v: null }, { l: 'Todo dia', v: 'FREQ=DAILY' }, { l: 'Toda semana', v: 'FREQ=WEEKLY' }, { l: 'Todo mês', v: 'FREQ=MONTHLY' }].map((o) => (
                <Chip key={o.l} label={o.l} active={repeat === o.v} onPress={() => setRepeat(o.v)} />
              ))}
            </ScrollView>
          </View>
          {create.error ? <T variant="caption" color={colors.danger}>{(create.error as Error).message}</T> : null}
          <Button label="Adicionar" onPress={() => create.mutate()} disabled={!newTitle.trim() || !/^\d{1,2}:\d{2}$/.test(newTime)} loading={create.isPending} />
        </Surface>
        <View style={{ height: 1, backgroundColor: colors.hairline, borderRadius: radius.pill }} />
        <T variant="caption" color={colors.textSecondary}>Google Agenda pode ser conectada em Ajustes › Integrações.</T>
      </ScrollView>
    </Screen>
  );
}

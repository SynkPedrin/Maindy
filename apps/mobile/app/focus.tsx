import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import type { FocusMode } from '@maindy/core/contracts';
import { Header } from '@/components/Header';
import { Orb } from '@/components/Orb';
import { Button, Chip, Screen, Surface, T } from '@/components/ui';
import { api } from '@/lib/api';
import { FOCUS_LABEL, time } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { LiveActivity, NativeNotifications } from '@/lib/native';
import { colors, space } from '@/theme';

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const MODES: Array<{ id: Exclude<FocusMode, 'off'>; hint: string }> = [
  { id: 'work', hint: 'Só o essencial do trabalho' },
  { id: 'study', hint: 'Sem distrações, lembretes de pausa' },
  { id: 'rest', hint: 'Silêncio, exceto pessoas próximas' },
  { id: 'sleep', hint: 'Nada até de manhã, exceto emergências' },
  { id: 'driving', hint: 'Respostas curtas, só por voz' },
];

export default function Focus() {
  const qc = useQueryClient();
  const focus = useQuery({ queryKey: ['focus'], queryFn: api.focus });
  const [mode, setMode] = useState<Exclude<FocusMode, 'off'>>('work');
  const [minutes, setMinutes] = useState(50);
  const active = focus.data;

  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const [listener, setListener] = useState(NativeNotifications.hasListenerAccess());
  const nativeFilter = NativeNotifications.availability.supported;

  const start = async () => {
    const f = await api.setFocus(mode, minutes);
    // Android: silence non-allowed apps while focused (only with the user's notification access)
    if (nativeFilter && NativeNotifications.hasListenerAccess()) {
      NativeNotifications.setFilterRules({ focusMode: mode, allowPackages: NativeNotifications.getFilterRules()?.allowPackages ?? [], muteContents: !settings.data?.forwardNotificationContents });
    }
    // iOS: Lock Screen / Dynamic Island Live Activity
    if (f?.endsAt && LiveActivity.availability.supported) await LiveActivity.startFocus({ mode, endsAt: f.endsAt }).catch(() => undefined);
    haptic('success');
    void qc.invalidateQueries();
  };
  const stop = async () => {
    await api.setFocus('off', null);
    if (nativeFilter) NativeNotifications.setFilterRules({ focusMode: 'off', allowPackages: NativeNotifications.getFilterRules()?.allowPackages ?? [], muteContents: true });
    if (LiveActivity.availability.supported) await LiveActivity.end().catch(() => undefined);
    haptic('cancel');
    void qc.invalidateQueries();
  };

  return (
    <Screen>
      <Header title="Foco" subtitle="A MAINDY segura o que pode esperar." />
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl, paddingBottom: 80 }}>
        <View style={{ alignItems: 'center' }}>
          <Orb state={active ? 'focus' : 'idle'} size={170} />
          {active ? <T variant="heading" style={{ marginTop: space.md }}>Modo {FOCUS_LABEL[active.mode]}{active.endsAt ? ` até ${time(active.endsAt, TZ)}` : ''}</T> : null}
        </View>
        {active ? (
          <Button kind="secondary" label="Encerrar foco" onPress={stop} />
        ) : (
          <>
            {MODES.map((m) => (
              <Chip key={m.id} label={`${FOCUS_LABEL[m.id]} — ${m.hint}`} active={mode === m.id} onPress={() => setMode(m.id)} />
            ))}
            <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
              {[25, 50, 90, 120].map((n) => <Chip key={n} label={`${n} min`} active={minutes === n} onPress={() => setMinutes(n)} />)}
            </View>
            <Button label="Começar" onPress={start} />
          </>
        )}
        <Surface style={{ gap: space.sm }}>
          <T variant="bodyStrong">O que o foco faz neste aparelho</T>
          {Platform.OS === 'android' && nativeFilter && !listener ? (
            <Chip label="Permitir acesso a notificações" active onPress={() => { NativeNotifications.openListenerSettings(); setListener(NativeNotifications.hasListenerAccess()); }} />
          ) : null}
          {Platform.OS === 'android' ? (
            <T variant="caption" color={colors.textSecondary}>No Android, com sua permissão de “Acesso a notificações”, a MAINDY pode silenciar notificações de apps fora da lista permitida durante o foco. O conteúdo das notificações não é enviado à IA.</T>
          ) : (
            <T variant="caption" color={colors.textSecondary}>No iPhone, o sistema não permite que apps interceptem notificações de outros apps. A MAINDY registra o período de foco e mostra uma Live Activity na tela bloqueada; combine com o Foco do iOS (Ajustes › Foco) para silenciar outros apps.</T>
          )}
        </Surface>
      </ScrollView>
    </Screen>
  );
}

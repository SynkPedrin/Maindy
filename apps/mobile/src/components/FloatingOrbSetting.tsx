import { useEffect, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import { FloatingAgent } from '@/lib/native';
import { notificationPermission } from '@/lib/notifications';
import { colors, space } from '@/theme';
import { T, Toggle } from './ui';

/** Android-only floating assistant (system overlay, user-authorized, removable at any time). */
export function FloatingOrbSetting() {
  const [showing, setShowing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const supported = FloatingAgent.availability.supported;

  useEffect(() => {
    if (!supported) return;
    const refresh = () => setShowing(FloatingAgent.isShowing());
    refresh();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && refresh());
    const dismissed = FloatingAgent.addListener('onFloatingAgentDismissed', () => setShowing(false));
    return () => {
      sub.remove();
      dismissed.remove();
    };
  }, [supported]);

  if (Platform.OS !== 'android') return null;
  if (!supported) {
    return <T variant="caption" color={colors.textSecondary}>Orb flutuante: disponível no app instalado (development build), não no Expo Go.</T>;
  }

  const toggle = async (on: boolean) => {
    setMsg(null);
    if (!on) {
      FloatingAgent.hide();
      setShowing(false);
      return;
    }
    if (!FloatingAgent.hasOverlayPermission()) {
      FloatingAgent.requestOverlayPermission();
      setMsg('Ative “Sobrepor a outros apps” para a MAINDY e volte aqui.');
      return;
    }
    await notificationPermission(true); // the persistent notification has the "Remover" action
    try {
      await FloatingAgent.show({ sizeDp: 64 });
      setShowing(true);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <View style={{ gap: space.xs }}>
      <Toggle label="Orb flutuante" hint="Toque abre a assistente; segure para falar; arraste até o X para remover." value={showing} onChange={toggle} />
      {msg ? <T variant="caption" color={colors.yellow}>{msg}</T> : null}
    </View>
  );
}

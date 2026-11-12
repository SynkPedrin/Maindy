import { useRef } from 'react';
import { Pressable, View, type GestureResponderEvent } from 'react-native';
import { useVoiceStore, type VoiceState } from '@/lib/voice';
import { colors, space } from '@/theme';
import { Orb, type OrbVisual } from './Orb';
import { T } from './ui';

export function orbFor(state: VoiceState, extra: { focus?: boolean; offline?: boolean } = {}): OrbVisual {
  if (extra.offline) return 'offline';
  switch (state) {
    case 'pressed':
    case 'listening':
      return 'listening';
    case 'processing':
      return 'thinking';
    case 'speaking':
      return 'speaking';
    case 'error':
      return 'error';
    default:
      return extra.focus ? 'focus' : 'idle';
  }
}

const HINT: Record<VoiceState, string> = {
  idle: 'Segure para falar',
  pressed: 'Pode falar…',
  listening: 'Ouvindo — solte para enviar, arraste para cancelar',
  processing: 'Pensando…',
  speaking: 'Toque para interromper',
  interrupted: 'Interrompido',
  error: '',
};

/**
 * The orb as a push-to-talk control: long-press to record, release to send, slide away to
 * cancel, tap while speaking to interrupt.
 */
export function VoiceButton({ size = 200, onStart, onStop, onInterrupt, focus, offline }: { size?: number; onStart: () => void; onStop: (o?: { cancel?: boolean }) => void; onInterrupt: () => void; focus?: boolean; offline?: boolean }) {
  const { state, level, error } = useVoiceStore();
  const origin = useRef<{ x: number; y: number } | null>(null);
  const cancelled = useRef(false);

  const onMove = (e: GestureResponderEvent) => {
    if (!origin.current) return;
    const dx = e.nativeEvent.pageX - origin.current.x;
    const dy = e.nativeEvent.pageY - origin.current.y;
    cancelled.current = Math.hypot(dx, dy) > 90;
  };

  return (
    <View style={{ alignItems: 'center', gap: space.md }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={state === 'speaking' ? 'Interromper a resposta' : 'Segure para falar com a assistente'}
        accessibilityHint="Mantenha pressionado enquanto fala"
        delayLongPress={220}
        onPressIn={(e) => {
          origin.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
          cancelled.current = false;
        }}
        onPress={() => {
          if (state === 'speaking' || state === 'processing') onInterrupt();
        }}
        onLongPress={() => {
          if (state === 'idle' || state === 'interrupted' || state === 'error') onStart();
        }}
        onPressOut={() => {
          origin.current = null;
          if (state === 'listening' || state === 'pressed' || useVoiceStore.getState().state === 'listening') onStop({ cancel: cancelled.current });
        }}
        onTouchMove={onMove}
        hitSlop={16}
      >
        <Orb state={orbFor(state, { focus, offline })} size={size} level={level} />
      </Pressable>
      <T variant="caption" color={state === 'error' ? colors.danger : colors.textSecondary} accessibilityLiveRegion="polite" style={{ textAlign: 'center', minHeight: 18 }}>
        {state === 'error' ? (error ?? 'Algo deu errado') : HINT[state]}
      </T>
    </View>
  );
}

import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useReducedMotion } from '@/lib/motion';
import { colors } from '@/theme';

export type OrbVisual = 'idle' | 'listening' | 'thinking' | 'speaking' | 'focus' | 'error' | 'offline';

const IMAGES: Record<Exclude<OrbVisual, 'error'>, number> = {
  idle: require('../../assets/assistant/orb-idle.png'),
  listening: require('../../assets/assistant/orb-listening.png'),
  thinking: require('../../assets/assistant/orb-thinking.png'),
  speaking: require('../../assets/assistant/orb-speaking.png'),
  focus: require('../../assets/assistant/orb-focus.png'),
  offline: require('../../assets/assistant/orb-offline.png'),
};

const GLOW: Record<OrbVisual, string> = {
  idle: colors.purple,
  listening: colors.magenta,
  thinking: colors.purpleLight,
  speaking: colors.yellow,
  focus: '#5B6CFF',
  error: colors.danger,
  offline: '#3A3F6B',
};

/**
 * The MAINDY glass orb. Each state has its own artwork (PNG) plus motion:
 * idle breathes, listening emits rings reacting to the mic level, thinking pulses its
 * inner light, speaking moves smoothly, focus holds a stable glow, error shakes briefly,
 * offline dims. All loops are UI-thread worklets; reduced motion keeps it static.
 */
export function Orb({ state, size = 180, level = 0, style }: { state: OrbVisual; size?: number; level?: number; style?: ViewStyle }) {
  const reduced = useReducedMotion();
  const breathe = useSharedValue(0);
  const pulse = useSharedValue(0);
  const shake = useSharedValue(0);
  const ring = useSharedValue(0);
  const mic = useSharedValue(0);
  const enter = useSharedValue(0);

  useEffect(() => {
    enter.value = withSpring(1, { damping: 14, stiffness: 120 });
  }, [enter]);

  useEffect(() => {
    mic.value = withTiming(level, { duration: 90 });
  }, [level, mic]);

  useEffect(() => {
    cancelAnimation(breathe);
    cancelAnimation(pulse);
    cancelAnimation(ring);
    if (reduced) {
      breathe.value = 0;
      pulse.value = 0;
      ring.value = 0;
      return;
    }
    const ease = Easing.inOut(Easing.sin);
    switch (state) {
      case 'idle':
        breathe.value = withRepeat(withTiming(1, { duration: 3200, easing: ease }), -1, true);
        break;
      case 'listening':
        breathe.value = withTiming(0.6, { duration: 200 });
        ring.value = 0;
        ring.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false);
        break;
      case 'thinking':
        pulse.value = withRepeat(withTiming(1, { duration: 700, easing: ease }), -1, true);
        breathe.value = withTiming(0.3, { duration: 300 });
        break;
      case 'speaking':
        breathe.value = withRepeat(withSequence(withTiming(1, { duration: 260, easing: ease }), withTiming(0.35, { duration: 320, easing: ease })), -1, true);
        break;
      case 'focus':
        breathe.value = withTiming(0.2, { duration: 600 });
        pulse.value = withTiming(0.4, { duration: 600 });
        break;
      case 'error':
        shake.value = withSequence(withTiming(-1, { duration: 50 }), withRepeat(withTiming(1, { duration: 80 }), 4, true), withTiming(0, { duration: 50 }));
        break;
      case 'offline':
        breathe.value = withTiming(0, { duration: 400 });
        break;
    }
  }, [state, reduced, breathe, pulse, ring, shake]);

  const orbStyle = useAnimatedStyle(() => {
    const s = 1 + breathe.value * 0.035 + mic.value * 0.06;
    return {
      opacity: interpolate(enter.value, [0, 1], [0, state === 'offline' ? 0.55 : 1]),
      transform: [{ translateX: shake.value * 6 }, { scale: s * interpolate(enter.value, [0, 1], [0.86, 1]) }],
    };
  });

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.28 + pulse.value * 0.35 + breathe.value * 0.12 + mic.value * 0.3,
    transform: [{ scale: 0.92 + pulse.value * 0.1 + mic.value * 0.18 }],
  }));

  const ringA = useAnimatedStyle(() => ({
    opacity: state === 'listening' ? (1 - ring.value) * (0.45 + mic.value * 0.5) : 0,
    transform: [{ scale: 0.9 + ring.value * (0.55 + mic.value * 0.4) }],
  }));
  const ringPhase = useDerivedValue(() => (ring.value + 0.5) % 1);
  const ringB = useAnimatedStyle(() => ({
    opacity: state === 'listening' ? (1 - ringPhase.value) * 0.35 : 0,
    transform: [{ scale: 0.9 + ringPhase.value * 0.55 }],
  }));

  const image = IMAGES[state === 'error' ? 'idle' : state];
  const ringSize = size * 0.82;

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]} accessibilityRole="image" accessibilityLabel={`Assistente: ${LABELS[state]}`}>
      <Animated.View pointerEvents="none" style={[styles.glow, { width: size * 0.78, height: size * 0.78, borderRadius: size * 0.39, backgroundColor: GLOW[state], shadowColor: GLOW[state], shadowRadius: size * 0.28 }, glowStyle]} />
      <Animated.View pointerEvents="none" style={[styles.ring, { width: ringSize, height: ringSize, borderRadius: ringSize / 2, borderColor: colors.magenta }, ringA]} />
      <Animated.View pointerEvents="none" style={[styles.ring, { width: ringSize, height: ringSize, borderRadius: ringSize / 2, borderColor: colors.purpleLight }, ringB]} />
      <Animated.View style={[{ width: size, height: size }, orbStyle]}>
        <Image source={image} style={{ width: size, height: size }} contentFit="contain" transition={220} cachePolicy="memory" />
      </Animated.View>
    </View>
  );
}

const LABELS: Record<OrbVisual, string> = {
  idle: 'pronta',
  listening: 'ouvindo',
  thinking: 'pensando',
  speaking: 'falando',
  focus: 'modo foco',
  error: 'erro',
  offline: 'sem conexão',
};

const styles = StyleSheet.create({
  glow: { position: 'absolute', shadowOpacity: 0.9, shadowOffset: { width: 0, height: 0 }, opacity: 0.3 },
  ring: { position: 'absolute', borderWidth: 2 },
});

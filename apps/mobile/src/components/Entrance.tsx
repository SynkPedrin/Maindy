import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '@/lib/motion';
import { colors } from '@/theme';

const KEY = 'maindy.entrance.seen';

/**
 * Entrance animation (spec §7.1): navy → symbol fades in → purple glow → orb settles → wordmark
 * reveals → hand-off. Full sequence (~1.9 s) only on the first launch; afterwards a 350 ms fade.
 */
export function Entrance({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion();
  const [full, setFull] = useState<boolean | null>(null);
  const symbol = useSharedValue(0);
  const glow = useSharedValue(0);
  const rise = useSharedValue(0);
  const word = useSharedValue(0);
  const out = useSharedValue(1);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => setFull(!v))
      .catch(() => setFull(false));
  }, []);

  useEffect(() => {
    if (full === null) return;
    const finish = () => onDone();
    if (!full || reduced) {
      symbol.value = 1;
      glow.value = 0.6;
      rise.value = 1;
      word.value = 1;
      out.value = withDelay(reduced ? 300 : 250, withTiming(0, { duration: 350 }, (f) => f && runOnJS(finish)()));
      return;
    }
    void AsyncStorage.setItem(KEY, '1').catch(() => undefined);
    const ease = Easing.out(Easing.cubic);
    symbol.value = withTiming(1, { duration: 520, easing: ease });
    glow.value = withDelay(320, withSequence(withTiming(1, { duration: 520 }), withTiming(0.6, { duration: 400 })));
    rise.value = withDelay(620, withSpring(1, { damping: 13, stiffness: 110 }));
    word.value = withDelay(1050, withTiming(1, { duration: 480, easing: ease }));
    out.value = withDelay(1900, withTiming(0, { duration: 420 }, (f) => f && runOnJS(finish)()));
  }, [full, reduced, onDone, symbol, glow, rise, word, out]);

  const container = useAnimatedStyle(() => ({ opacity: out.value }));
  const orb = useAnimatedStyle(() => ({ opacity: symbol.value, transform: [{ translateY: (1 - rise.value) * 40 }, { scale: 0.82 + symbol.value * 0.18 }] }));
  const glowS = useAnimatedStyle(() => ({ opacity: glow.value * 0.55, transform: [{ scale: 0.8 + glow.value * 0.5 }] }));
  const wordS = useAnimatedStyle(() => ({ opacity: word.value, transform: [{ translateY: (1 - word.value) * 12 }] }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, container]} pointerEvents="none">
      <View style={styles.center}>
        <Animated.View style={[styles.glow, glowS]} />
        <Animated.View style={orb}>
          <Image source={require('../../assets/brand/maindy-symbol.png')} style={{ width: 168, height: 168 }} contentFit="contain" />
        </Animated.View>
        <Animated.View style={[{ marginTop: 18 }, wordS]}>
          <Image source={require('../../assets/brand/maindy-wordmark.png')} style={{ width: 176, height: 56 }} contentFit="contain" accessibilityLabel="maindy" />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.navy, zIndex: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: colors.purple, shadowColor: colors.purple, shadowOpacity: 1, shadowRadius: 80, top: '50%', marginTop: -190 },
});

import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, Tabs } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tap, T } from '@/components/ui';
import { useReducedMotion } from '@/lib/motion';
import { useSession } from '@/lib/session';
import { colors } from '@/theme';

const ICONS: Record<string, { icon: number; label: string }> = {
  index: { icon: require('../../assets/navigation/home.png'), label: 'Início' },
  memories: { icon: require('../../assets/navigation/memories.png'), label: 'Memórias' },
  assistant: { icon: require('../../assets/brand/maindy-symbol.png'), label: 'Assistente' },
  calendar: { icon: require('../../assets/navigation/calendar.png'), label: 'Agenda' },
  settings: { icon: require('../../assets/navigation/settings.png'), label: 'Ajustes' },
};

const BAR_HEIGHT = 70;
const SPRING = { damping: 18, stiffness: 220, mass: 0.8 };

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const meta = ICONS[name]!;
  const f = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    f.value = withSpring(focused ? 1 : 0, SPRING);
  }, [focused, f]);
  const icon = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(f.value, [0, 1], [3, -2]) }, { scale: interpolate(f.value, [0, 1], [0.92, 1.12]) }] }));
  const label = useAnimatedStyle(() => ({ opacity: interpolate(f.value, [0, 1], [0.55, 1]), transform: [{ translateY: interpolate(f.value, [0, 1], [2, 0]) }] }));
  return (
    <View style={styles.iconBox}>
      <Animated.View style={icon}>
        <Image source={meta.icon} style={{ width: 24, height: 24 }} tintColor={focused ? colors.white : '#8B8EB8'} contentFit="contain" />
      </Animated.View>
      <Animated.View style={label}>
        <T variant="caption" color={focused ? colors.white : '#8B8EB8'} style={{ fontSize: 10.5, marginTop: 3, fontWeight: focused ? '700' : '500' }} numberOfLines={1}>
          {meta.label}
        </T>
      </Animated.View>
    </View>
  );
}

/** Raised center orb: a slowly rotating brand ring that lifts and glows when selected. */
function OrbTab({ focused }: { focused: boolean }) {
  const reduced = useReducedMotion();
  const spin = useSharedValue(0);
  const f = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    spin.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.linear }), -1, false);
  }, [reduced, spin]);
  useEffect(() => {
    f.value = withSpring(focused ? 1 : 0, SPRING);
  }, [focused, f]);
  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }], opacity: 0.55 + f.value * 0.45 }));
  const orb = useAnimatedStyle(() => ({ transform: [{ scale: 1 + f.value * 0.08 }, { translateY: -f.value * 3 }] }));
  return (
    <Animated.View style={[styles.orbWrap, orb]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.ring, ring]}>
        <LinearGradient colors={[colors.purple, colors.magenta, colors.yellow, colors.purple]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: 37 }} />
      </Animated.View>
      <View style={styles.orbInner}>
        <Image source={ICONS.assistant!.icon} style={{ width: 62, height: 62 }} contentFit="contain" />
      </View>
    </Animated.View>
  );
}

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

function TabBar({ state, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const count = state.routes.length;
  const tabW = width / Math.max(count, 1);
  const x = useSharedValue(0);
  const hide = useSharedValue(0);
  const isOrb = state.routes[state.index]?.name === 'assistant';
  useEffect(() => {
    x.value = withSpring(state.index * tabW, SPRING);
    hide.value = withTiming(isOrb ? 1 : 0, { duration: 160 });
  }, [state.index, tabW, isOrb, x, hide]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { scale: 1 - hide.value * 0.3 }], opacity: 1 - hide.value }));

  return (
    <View pointerEvents="box-none" style={[styles.outer, { paddingBottom: Math.max(insets.bottom - 6, 10) }]}>
      <View style={styles.bar} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        {Platform.OS === 'ios' ? <BlurView tint="dark" intensity={45} style={[StyleSheet.absoluteFill, { borderRadius: 34, overflow: 'hidden' }]} /> : null}
        <View style={[StyleSheet.absoluteFill, styles.barBg]} />
        {width > 0 ? (
          <Animated.View pointerEvents="none" style={[styles.pill, { width: tabW - 14 }, pill]}>
            <LinearGradient colors={['rgba(118,0,255,0.6)', 'rgba(208,0,232,0.32)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} />
          </Animated.View>
        ) : null}
        {state.routes.map((route: { key: string; name: string }, index: number) => {
          const focused = state.index === index;
          return (
            <Tap
              key={route.key}
              onPress={() => {
                if (!focused) navigateToTab(route.key);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={ICONS[route.name]?.label}
              containerStyle={{ flex: 1, height: '100%' }}
              style={styles.item}
              scaleTo={0.88}
            >
              {route.name === 'assistant' ? <OrbTab focused={focused} /> : <TabIcon name={route.name} focused={focused} />}
            </Tap>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { ready, session } = useSession();
  if (ready && !session) return <Redirect href="/auth/login" />;
  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.navy }, animation: 'shift' }} tabBar={(p) => <TabBar {...p} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="memories" />
      <Tabs.Screen name="assistant" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  outer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14 },
  bar: {
    height: BAR_HEIGHT,
    borderRadius: 34,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(160,32,240,0.38)',
    shadowColor: colors.purple,
    shadowOpacity: 0.45,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  barBg: { borderRadius: 34, backgroundColor: Platform.OS === 'ios' ? 'rgba(11,16,64,0.72)' : 'rgba(11,16,64,0.97)' },
  pill: { position: 'absolute', left: 7, top: 8, bottom: 8, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
  iconBox: { alignItems: 'center', justifyContent: 'center' },
  orbWrap: { width: 74, height: 74, marginTop: -30, borderRadius: 37, alignItems: 'center', justifyContent: 'center' },
  ring: { borderRadius: 37, overflow: 'hidden' },
  orbInner: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type PressableProps, type StyleProp, type TextInputProps, type TextProps, type ViewStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { haptic } from '@/lib/haptics';
import { colors, radius, space, type } from '@/theme';

type Variant = keyof typeof type;

export function T({ variant = 'body', color, style, ...rest }: TextProps & { variant?: Variant; color?: string }) {
  return <Text {...rest} style={[type[variant], { color: color ?? colors.textPrimary }, style]} />;
}

/** Deep-navy screen with a subtle top glow (no heavy gradients). */
export function Screen({ children, scroll = false, edges = ['top'] }: { children: ReactNode; scroll?: boolean; edges?: Array<'top' | 'bottom'> }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.navy }}>
      <LinearGradient colors={['rgba(118,0,255,0.18)', 'rgba(5,8,43,0)']} style={StyleSheet.absoluteFill} start={{ x: 0.2, y: 0 }} end={{ x: 0.5, y: 0.45 }} pointerEvents="none" />
      <SafeAreaView style={{ flex: 1 }} edges={edges}>
        {scroll ? children : <View style={{ flex: 1 }}>{children}</View>}
      </SafeAreaView>
    </View>
  );
}

/** Pressable with spring press feedback + haptics. `glow` animates the border/shadow on press. */
export function Tap({ children, style, containerStyle, onPress, haptics = true, scaleTo = 0.97, glow, ...rest }: PressableProps & { style?: StyleProp<ViewStyle>; containerStyle?: StyleProp<ViewStyle>; haptics?: boolean; scaleTo?: number; glow?: { from: string; to: string }; children: ReactNode }) {
  const s = useSharedValue(1);
  const p = useSharedValue(0);
  const a = useAnimatedStyle(() => {
    const base = { transform: [{ scale: s.value }] };
    if (!glow) return base;
    return { ...base, borderColor: interpolateColor(p.value, [0, 1], [glow.from, glow.to]), shadowOpacity: 0.25 + p.value * 0.45, shadowRadius: 10 + p.value * 12 };
  });
  return (
    <Pressable
      {...rest}
      style={containerStyle}
      onPressIn={(e) => {
        s.value = withSpring(scaleTo, { damping: 18, stiffness: 400 });
        p.value = withTiming(1, { duration: 120 });
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.value = withSpring(1, { damping: 14, stiffness: 300 });
        p.value = withTiming(0, { duration: 260 });
        rest.onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptics) haptic('press');
        onPress?.(e);
      }}
    >
      <Animated.View style={[style, a]}>{children}</Animated.View>
    </Pressable>
  );
}

export function Button({ label, onPress, kind = 'primary', loading, disabled, icon }: { label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean; disabled?: boolean; icon?: ReactNode }) {
  const bg = kind === 'primary' ? colors.purple : kind === 'danger' ? 'rgba(255,92,122,0.14)' : kind === 'secondary' ? colors.surfaceLight : 'transparent';
  const fg = kind === 'danger' ? colors.danger : kind === 'ghost' ? colors.textSecondary : colors.white;
  const border = kind === 'primary' ? { from: 'rgba(208,0,232,0.55)', to: colors.yellowSoft } : kind === 'danger' ? { from: 'rgba(255,92,122,0.45)', to: colors.danger } : { from: 'rgba(160,32,240,0.45)', to: colors.purpleLight };
  return (
    <Tap
      glow={border}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      style={[styles.button, { backgroundColor: bg, opacity: disabled ? 0.45 : 1, borderColor: border.from }, kind === 'primary' ? styles.primaryShadow : styles.softShadow]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          {icon}
          <T variant="bodyStrong" color={fg}>
            {label}
          </T>
        </View>
      )}
    </Tap>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space.xs }}>
      {props.label ? <T variant="caption" color={focused ? colors.purpleLight : colors.textSecondary}>{props.label}</T> : null}
      <TextInput
        placeholderTextColor="#6E7199"
        selectionColor={colors.purpleLight}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[styles.field, { borderColor: focused ? colors.purpleLight : 'rgba(168,170,198,0.18)' }, props.style]}
      />
    </View>
  );
}

export function Section({ title, action, children }: { title: string; action?: { label: string; onPress: () => void }; children: ReactNode }) {
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T variant="overline" color={colors.textSecondary}>
          {title.toUpperCase()}
        </T>
        {action ? (
          <Tap onPress={action.onPress} accessibilityRole="link" hitSlop={10}>
            <T variant="caption" color={colors.purpleLight}>
              {action.label}
            </T>
          </Tap>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Quiet surface; used sparingly (the brand asks for few cards and no heavy borders). */
export function Surface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.surface, style]}>{children}</View>;
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: number }) {
  return (
    <Tap glow={{ from: active ? colors.purpleLight : 'rgba(168,170,198,0.22)', to: colors.magenta }} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: Boolean(active) }} style={[styles.chip, active ? { backgroundColor: 'rgba(118,0,255,0.32)', borderColor: colors.purpleLight } : null]} scaleTo={0.94}>
      {icon ? <Image source={icon} style={{ width: 20, height: 20 }} /> : null}
      <T variant="caption" color={active ? colors.white : colors.textSecondary}>
        {label}
      </T>
    </Tap>
  );
}

export function Empty({ title, hint, image }: { title: string; hint?: string; image?: number }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xxl, gap: space.sm }}>
      {image ? <Image source={image} style={{ width: 120, height: 120, opacity: 0.9 }} contentFit="contain" /> : null}
      <T variant="bodyStrong">{title}</T>
      {hint ? (
        <T variant="caption" color={colors.textSecondary} style={{ textAlign: 'center', maxWidth: 280 }}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

export function Toggle({ value, onChange, label, hint }: { value: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const x = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    x.value = withTiming(value ? 1 : 0, { duration: 180 });
  }, [value, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * 20 }] }));
  return (
    <Tap onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label} style={styles.toggleRow} scaleTo={0.99}>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="body">{label}</T>
        {hint ? <T variant="caption" color={colors.textSecondary}>{hint}</T> : null}
      </View>
      <View style={[styles.track, { backgroundColor: value ? colors.purple : colors.surfaceLight }]}>
        <Animated.View style={[styles.knob, knob]} />
      </View>
    </Tap>
  );
}

export function Row({ title, subtitle, onPress, right, icon }: { title: string; subtitle?: string; onPress?: () => void; right?: ReactNode; icon?: number }) {
  const content = (
    <View style={styles.row}>
      {icon ? <Image source={icon} style={{ width: 36, height: 36 }} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="body">{title}</T>
        {subtitle ? <T variant="caption" color={colors.textSecondary} numberOfLines={2}>{subtitle}</T> : null}
      </View>
      {right ?? (onPress ? <T variant="heading" color={colors.textSecondary}>›</T> : null)}
    </View>
  );
  return onPress ? (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={title} scaleTo={0.98} glow={{ from: 'rgba(160,32,240,0)', to: 'rgba(160,32,240,0.6)' }} style={styles.rowTap}>
      {content}
    </Tap>
  ) : (
    content
  );
}

const styles = StyleSheet.create({
  button: { height: 54, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl, borderWidth: 1.5 },
  primaryShadow: { shadowColor: colors.purple, shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  softShadow: { shadowColor: colors.purple, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  field: { ...type.body, color: colors.textPrimary, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: 14, minHeight: 52, borderWidth: 1.5 },
  surface: { backgroundColor: 'rgba(16,20,56,0.72)', borderRadius: radius.lg, padding: space.lg },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(168,170,198,0.22)', shadowColor: colors.magenta, shadowOpacity: 0, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingVertical: space.md },
  track: { width: 48, height: 28, borderRadius: 14, padding: 4 },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, minHeight: 52 },
  rowTap: { borderWidth: 1, borderRadius: radius.md, marginHorizontal: -space.sm, paddingHorizontal: space.sm },
});

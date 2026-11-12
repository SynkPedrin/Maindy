import { router } from 'expo-router';
import { View } from 'react-native';
import { colors, space } from '@/theme';
import { T, Tap } from './ui';

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.lg, gap: space.sm }}>
      <Tap onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} accessibilityRole="button" accessibilityLabel="Voltar" hitSlop={12} style={{ alignSelf: 'flex-start' }}>
        <T variant="body" color={colors.purpleLight}>‹ Voltar</T>
      </Tap>
      <T variant="title">{title}</T>
      {subtitle ? <T variant="body" color={colors.textSecondary}>{subtitle}</T> : null}
    </View>
  );
}

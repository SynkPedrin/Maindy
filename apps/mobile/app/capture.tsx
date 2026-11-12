import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Header } from '@/components/Header';
import { Button, Field, Screen, T } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { colors, space } from '@/theme';

/** Deep-link target for the iOS "Salvar memória" App Intent / widgets: maindy://capture?text=… */
export default function Capture() {
  const params = useLocalSearchParams<{ text?: string }>();
  const [text, setText] = useState(params.text ?? '');
  const save = useMutation({
    mutationFn: () => api.chat(text.trim(), null),
    onSuccess: () => haptic('success'),
  });

  return (
    <Screen>
      <Header title="Guardar" subtitle="Revise antes de salvar." />
      <View style={{ padding: space.xl, gap: space.lg }}>
        <Field value={text} onChangeText={setText} multiline style={{ minHeight: 110, textAlignVertical: 'top' }} autoFocus />
        {save.data ? <T variant="body">{save.data.reply}</T> : null}
        {save.error ? <T variant="caption" color={colors.danger}>{(save.error as Error).message}</T> : null}
        {save.data ? <Button label="Pronto" onPress={() => router.replace('/(tabs)')} /> : <Button label="Salvar" onPress={() => save.mutate()} loading={save.isPending} disabled={!text.trim()} />}
      </View>
    </Screen>
  );
}

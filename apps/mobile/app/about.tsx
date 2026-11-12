import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { AboutForm, type About } from '@/components/AboutForm';
import { Header } from '@/components/Header';
import { Button, Screen, T } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { colors, space } from '@/theme';

export default function AboutScreen() {
  const qc = useQueryClient();
  const about = useQuery({ queryKey: ['about'], queryFn: api.about });
  const [v, setV] = useState<About>({ work: '', activities: '', routine: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (about.data) setV(about.data);
  }, [about.data]);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.saveAbout(v);
      haptic('success');
      void qc.invalidateQueries();
      router.back();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Header title="Sobre você" subtitle="A assistente usa isso para entender seu contexto. Fica guardado como memória sua, que você pode editar ou apagar." />
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
          <AboutForm value={v} onChange={setV} />
          {err ? <T variant="caption" color={colors.danger}>{err}</T> : null}
          <Button label="Salvar" onPress={save} loading={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

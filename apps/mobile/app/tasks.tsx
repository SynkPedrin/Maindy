import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import Animated, { FadeOutRight, Layout, ZoomIn } from 'react-native-reanimated';
import { Header } from '@/components/Header';
import { Chip, Empty, Field, Screen, T, Tap } from '@/components/ui';
import { api } from '@/lib/api';
import { whenLabel } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { colors, space } from '@/theme';

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const P = { 1: 'Alta', 2: 'Média', 3: 'Baixa' } as const;

export default function Tasks() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'pending' | 'done'>('pending');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<1 | 2 | 3>(2);
  const tasks = useQuery({ queryKey: ['tasks', status], queryFn: () => api.tasks(status) });
  const add = useMutation({ mutationFn: () => api.createTask({ title: title.trim(), priority }), onSuccess: () => { setTitle(''); haptic('success'); void qc.invalidateQueries(); } });
  const toggle = useMutation({
    mutationFn: (t: { id: string; done: boolean }) => api.updateTask(t.id, { status: t.done ? 'pending' : 'done' }),
    onMutate: (t) => haptic(t.done ? 'cancel' : 'success'),
    onSettled: () => qc.invalidateQueries(),
  });

  return (
    <Screen>
      <Header title="Tarefas" />
      <View style={{ paddingHorizontal: space.xl, gap: space.md }}>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Chip label="Pendentes" active={status === 'pending'} onPress={() => setStatus('pending')} />
          <Chip label="Concluídas" active={status === 'done'} onPress={() => setStatus('done')} />
        </View>
        <Field placeholder="Nova tarefa" value={title} onChangeText={setTitle} onSubmitEditing={() => title.trim() && add.mutate()} returnKeyType="done" />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {([1, 2, 3] as const).map((p) => <Chip key={p} label={`Prioridade ${P[p].toLowerCase()}`} active={priority === p} onPress={() => setPriority(p)} />)}
        </View>
      </View>
      <FlatList
        data={tasks.data ?? []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: space.xl, gap: space.sm, paddingBottom: 80 }}
        ListEmptyComponent={tasks.isLoading ? undefined : <Empty title={status === 'pending' ? 'Tudo em dia' : 'Nada concluído ainda'} />}
        renderItem={({ item }) => {
          const done = item.status === 'done';
          return (
            <Animated.View layout={Layout} exiting={FadeOutRight} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center', paddingVertical: space.sm }}>
              <Tap onPress={() => toggle.mutate({ id: item.id, done })} accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={item.title} scaleTo={0.8}
                style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: item.priority === 1 ? colors.yellow : colors.purpleLight, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? colors.purple : 'transparent' }}>
                {done ? <Animated.View entering={ZoomIn.springify()}><T variant="caption">✓</T></Animated.View> : <View />}
              </Tap>
              <View style={{ flex: 1 }}>
                <T variant="body" color={done ? colors.textSecondary : colors.textPrimary} style={done ? { textDecorationLine: 'line-through' } : undefined}>{item.title}</T>
                <T variant="caption" color="#6E7199">{P[item.priority]}{item.dueAt ? ` · ${whenLabel(item.dueAt, TZ)}` : ''}</T>
              </View>
            </Animated.View>
          );
        }}
      />
    </Screen>
  );
}

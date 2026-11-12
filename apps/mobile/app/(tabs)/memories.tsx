import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, SectionList, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { Memory } from '@maindy/core/contracts';
import { Chip, Empty, Field, Screen, T, Tap } from '@/components/ui';
import { api } from '@/lib/api';
import { CATEGORY_LABEL, PROVENANCE_LABEL, SOURCE_LABEL, relativeDay } from '@/lib/format';
import { CATEGORY_ICON } from '@/lib/icons';
import { colors, space } from '@/theme';

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

function useDebounced<T>(v: T, ms: number): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

function MemoryRow({ m }: { m: Memory }) {
  return (
    <Tap onPress={() => router.push(`/memory/${m.id}`)} accessibilityRole="button" accessibilityLabel={m.title} scaleTo={0.99} style={{ flexDirection: 'row', gap: space.md, paddingVertical: space.md }}>
      <Image source={CATEGORY_ICON[m.category] ?? CATEGORY_ICON.personal} style={{ width: 44, height: 44 }} />
      <View style={{ flex: 1, gap: 3 }}>
        <T variant="bodyStrong" numberOfLines={1}>{m.title}</T>
        <T variant="body" color={colors.textSecondary} numberOfLines={2}>{m.content}</T>
        <T variant="caption" color="#6E7199">
          {PROVENANCE_LABEL[m.provenance]} · {SOURCE_LABEL[m.source] ?? m.source}
          {m.people.length ? ` · ${m.people.map((p) => p.name).join(', ')}` : ''}
        </T>
      </View>
    </Tap>
  );
}

export default function Memories() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string | undefined>();
  const [personId, setPersonId] = useState<string | undefined>();
  const dq = useDebounced(q.trim(), 300);
  const list = useQuery({ queryKey: ['memories', category, personId], queryFn: () => api.memories({ category, personId }), enabled: !dq });
  const search = useQuery({ queryKey: ['memory-search', dq], queryFn: () => api.searchMemories(dq), enabled: Boolean(dq) });
  const people = useQuery({ queryKey: ['people'], queryFn: api.people });

  const items = dq ? (search.data ?? []).map((h) => h.memory) : (list.data ?? []);
  const sections = useMemo(() => {
    if (dq) return items.length ? [{ title: 'Resultados', data: items }] : [];
    const groups = new Map<string, Memory[]>();
    for (const m of items) {
      const k = relativeDay(m.createdAt, TZ);
      groups.set(k, [...(groups.get(k) ?? []), m]);
    }
    return [...groups.entries()].map(([title, data]) => ({ title, data }));
  }, [items, dq]);

  return (
    <Screen>
      <View style={{ padding: space.xl, paddingBottom: space.md, gap: space.md }}>
        <T variant="title">Memórias</T>
        <Field placeholder="Buscar: “quando ligar pra minha mãe”" value={q} onChangeText={setQ} returnKeyType="search" accessibilityLabel="Buscar memórias" />
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.xl, gap: space.sm }}>
          <Chip label="Todas" active={!category && !personId} onPress={() => { setCategory(undefined); setPersonId(undefined); }} />
          {Object.entries(CATEGORY_LABEL).map(([k, label]) => (
            <Chip key={k} label={label} icon={CATEGORY_ICON[k]} active={category === k} onPress={() => { setCategory(category === k ? undefined : k); setPersonId(undefined); }} />
          ))}
        </ScrollView>
        {people.data && people.data.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.xl, gap: space.sm, paddingTop: space.sm }}>
            {people.data.slice(0, 12).map((p) => (
              <Chip key={p.id} label={`${p.name}${p.memoryCount ? ` · ${p.memoryCount}` : ''}`} active={personId === p.id} onPress={() => { setPersonId(personId === p.id ? undefined : p.id); setCategory(undefined); }} />
            ))}
          </ScrollView>
        ) : null}
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: 120 }}
        renderSectionHeader={({ section }) => (
          <Animated.View entering={FadeIn} style={{ paddingTop: space.lg, paddingBottom: space.xs, backgroundColor: colors.navy }}>
            <T variant="overline" color={colors.textSecondary}>{section.title.toUpperCase()}</T>
          </Animated.View>
        )}
        renderItem={({ item }) => <MemoryRow m={item} />}
        ListEmptyComponent={
          list.isLoading || search.isLoading ? undefined : (
            <Empty title={dq ? 'Nada encontrado' : 'Nenhuma memória ainda'} hint={dq ? 'Tente outras palavras — a busca entende o sentido, não só o texto.' : 'Diga à assistente algo que você quer lembrar.'} image={require('../../assets/onboarding/memory.png')} />
          )
        }
      />
    </Screen>
  );
}

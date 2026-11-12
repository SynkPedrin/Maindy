import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, ScrollView, View } from 'react-native';
import { Header } from '@/components/Header';
import { Button, Field, Screen, Section, T } from '@/components/ui';
import { api } from '@/lib/api';
import { CATEGORY_LABEL, PROVENANCE_LABEL, SOURCE_LABEL, whenLabel } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { colors, space } from '@/theme';

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

function confirm(msg: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' && window.confirm(msg));
  return new Promise((r) => Alert.alert('Apagar memória?', msg, [{ text: 'Cancelar', style: 'cancel', onPress: () => r(false) }, { text: 'Apagar', style: 'destructive', onPress: () => r(true) }]));
}

export default function MemoryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const m = useQuery({ queryKey: ['memory', id], queryFn: () => api.memory(id!), enabled: Boolean(id) });
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);

  if (!m.data) {
    return (
      <Screen>
        <Header title={m.isError ? 'Memória não encontrada' : 'Carregando…'} />
      </Screen>
    );
  }
  const d = m.data;

  const save = async () => {
    setBusy(true);
    await api.updateMemory(d.id, { content: content.trim() });
    setBusy(false);
    setEditing(false);
    haptic('success');
    void qc.invalidateQueries();
  };
  const remove = async () => {
    if (!(await confirm('Ela será removida do app, da busca e do seu vault do Obsidian. Não dá para desfazer.'))) return;
    await api.deleteMemory(d.id);
    haptic('success');
    void qc.invalidateQueries();
    router.back();
  };

  return (
    <Screen>
      <Header title={d.title} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: 80, gap: space.xl }}>
        {editing ? (
          <Field value={content} onChangeText={setContent} multiline style={{ minHeight: 120, textAlignVertical: 'top' }} autoFocus />
        ) : (
          <T variant="body" style={{ fontSize: 18, lineHeight: 27 }}>{d.content}</T>
        )}
        <Section title="Origem">
          <T variant="body" color={colors.textSecondary}>
            {PROVENANCE_LABEL[d.provenance]} · registrado {SOURCE_LABEL[d.source] ?? d.source} · {whenLabel(d.createdAt, TZ)}
          </T>
          {d.originalUtterance && d.originalUtterance !== d.content ? <T variant="caption" color="#6E7199">Você disse: “{d.originalUtterance}”</T> : null}
          <T variant="caption" color="#6E7199">Categoria: {CATEGORY_LABEL[d.category] ?? d.category} · tipo {d.type} · confiança {Math.round(d.confidence * 100)}%</T>
          {d.vaultPath ? <T variant="caption" color="#6E7199">Obsidian: {d.vaultPath}</T> : null}
        </Section>
        {d.people.length ? (
          <Section title="Pessoas">
            {d.people.map((p) => <T key={p.id} variant="body">{p.name}{p.relation ? ` · ${p.relation}` : ''}</T>)}
          </Section>
        ) : null}
        {d.versions.length > 1 ? (
          <Section title={`Histórico (${d.versions.length} versões)`}>
            {d.versions.slice(0, 5).map((v) => (
              <View key={v.version} style={{ gap: 2 }}>
                <T variant="caption" color={colors.textSecondary}>v{v.version} · {v.changedBy === 'vault_sync' ? 'editado no Obsidian' : v.changedBy === 'agent' ? 'pela assistente' : 'por você'} · {whenLabel(v.createdAt, TZ)}</T>
                <T variant="caption" color="#6E7199" numberOfLines={2}>{v.content}</T>
              </View>
            ))}
          </Section>
        ) : null}
        {editing ? (
          <Button label="Salvar" onPress={save} loading={busy} disabled={!content.trim()} />
        ) : (
          <Button kind="secondary" label="Editar" onPress={() => { setContent(d.content); setEditing(true); }} />
        )}
        <Button kind="danger" label="Apagar memória" onPress={remove} />
      </ScrollView>
    </Screen>
  );
}

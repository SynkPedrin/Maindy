import { useQuery, useQueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, Platform, ScrollView } from 'react-native';
import { Header } from '@/components/Header';
import { Button, Chip, Field, Row, Screen, Section, T, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { whenLabel } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/theme';

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function Privacy() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const devices = useQuery({ queryKey: ['devices'], queryFn: api.devices });
  const [confirmText, setConfirmText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const exportAll = async () => {
    const data = await api.exportData();
    const json = JSON.stringify(data, null, 2);
    if (Platform.OS === 'web') {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'maindy-dados.json';
      a.click();
      return;
    }
    const f = new File(Paths.cache, 'maindy-dados.json');
    await f.write(json);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(f.uri, { mimeType: 'application/json' });
    else setMsg(`Arquivo salvo em ${f.uri}`);
  };

  const del = async () => {
    try {
      await api.deleteAccount();
      await supabase.auth.signOut().catch(() => undefined);
      qc.clear();
      router.replace('/auth/login');
    } catch (e) {
      if (Platform.OS === 'web') setMsg((e as Error).message);
      else Alert.alert('Não foi possível apagar', (e as Error).message);
    }
  };

  const s = settings.data;
  const set = async (patch: Parameters<typeof api.updateSettings>[0]) => {
    await api.updateSettings(patch);
    void qc.invalidateQueries({ queryKey: ['settings'] });
  };

  return (
    <Screen>
      <Header title="Privacidade" subtitle="Seus dados são seus. Nada é usado para treinar modelos." />
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl, paddingBottom: 80 }}>
        {s ? (
          <Section title="Controles">
            <Toggle label="Guardar gravações de áudio" hint="Desligado (padrão): o áudio é usado só para transcrever e descartado." value={s.storeAudio} onChange={(v) => set({ storeAudio: v })} />
            <Toggle label="Permitir uso para treinar modelos" hint="Desligado por padrão." value={s.allowModelTraining} onChange={(v) => set({ allowModelTraining: v })} />
            <Toggle label="Enviar conteúdo de notificações à IA" hint="Só no Android, e só se você ativar. Desligado por padrão." value={s.forwardNotificationContents} onChange={(v) => set({ forwardNotificationContents: v })} />
          </Section>
        ) : null}
        <Section title="Aparelhos conectados">
          {(devices.data ?? []).filter((d) => !d.revokedAt).map((d) => (
            <Row key={d.id} title={d.name ?? d.platform} subtitle={`${d.platform} · visto ${whenLabel(d.lastSeenAt, TZ)}`} right={<Chip label="Remover" onPress={async () => { await api.revokeDevice(d.id); void qc.invalidateQueries({ queryKey: ['devices'] }); }} />} />
          ))}
        </Section>
        <Section title="Seus dados">
          <Button kind="secondary" label="Exportar todos os dados (JSON)" onPress={exportAll} />
          <T variant="caption" color={colors.textSecondary}>O vault do Obsidian pode ser exportado em Ajustes › Vault.</T>
        </Section>
        <Section title="Apagar conta">
          <T variant="body" color={colors.textSecondary}>Apaga sua conta, memórias, tarefas, conversas, vault e registros. É irreversível.</T>
          <Field placeholder='Digite "APAGAR" para confirmar' value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" />
          <Button kind="danger" label="Apagar minha conta" onPress={del} disabled={confirmText !== 'APAGAR'} />
          {msg ? <T variant="caption" color={colors.danger}>{msg}</T> : null}
        </Section>
      </ScrollView>
    </Screen>
  );
}

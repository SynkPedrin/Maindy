import { useMutation, useQuery } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform, ScrollView } from 'react-native';
import { Header } from '@/components/Header';
import { Button, Screen, Section, Surface, T } from '@/components/ui';
import { api } from '@/lib/api';
import { apiUrl } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/theme';

export default function Vault() {
  const vault = useQuery({ queryKey: ['vault'], queryFn: api.provisionVault });
  const sync = useMutation({ mutationFn: api.syncVault });
  const connect = useMutation({ mutationFn: api.connectVault });
  const exportZip = useMutation({
    mutationFn: async () => {
      const { data } = await supabase.auth.getSession();
      const res = await fetch(`${apiUrl()}/v1/vaults/export`, { headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` } });
      if (!res.ok) throw new Error(`Falha ao exportar (${res.status})`);
      const buf = await res.arrayBuffer();
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([buf], { type: 'application/zip' }));
        a.download = 'maindy-vault.zip';
        a.click();
        return 'Download iniciado.';
      }
      const f = new File(Paths.cache, 'maindy-vault.zip');
      await f.write(new Uint8Array(buf));
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(f.uri, { mimeType: 'application/zip' });
      return 'Pronto.';
    },
  });

  return (
    <Screen>
      <Header title="Vault Obsidian" subtitle="Cada memória vira uma nota Markdown no seu vault pessoal. O banco de dados continua sendo a fonte da verdade." />
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl, paddingBottom: 80 }}>
        <Section title="Estrutura">
          <T variant="caption" color={colors.textSecondary}>{(vault.data?.folders ?? []).join('  ·  ')}</T>
          {vault.data?.lastSyncedAt ? <T variant="caption" color={colors.textSecondary}>Última sincronização: {new Date(vault.data.lastSyncedAt).toLocaleString('pt-BR')}</T> : null}
        </Section>
        <Section title="Sincronizar">
          <Button kind="secondary" label="Sincronizar agora" onPress={() => sync.mutate()} loading={sync.isPending} />
          {sync.data ? (
            <T variant="caption" color={colors.textSecondary}>
              {sync.data.imported} edições importadas · {sync.data.created} notas novas · {sync.data.written} arquivos atualizados · {sync.data.conflicts} conflitos (versão do arquivo guardada em 09-Archive/Conflitos)
            </T>
          ) : null}
        </Section>
        <Section title="Exportar">
          <Button kind="secondary" label="Exportar vault (.zip)" onPress={() => exportZip.mutate()} loading={exportZip.isPending} />
          {exportZip.data ? <T variant="caption" color={colors.success}>{exportZip.data}</T> : null}
          {exportZip.error ? <T variant="caption" color={colors.danger}>{(exportZip.error as Error).message}</T> : null}
        </Section>
        <Section title="Conectar um vault que você já tem">
          <T variant="caption" color={colors.textSecondary}>Instale o plugin MAINDY no Obsidian (desktop) e cole o token abaixo. No iPhone o Obsidian não permite acesso livre a pastas de outros apps; a sincronização acontece pelo plugin.</T>
          <Button kind="secondary" label="Gerar token do plugin" onPress={() => connect.mutate()} loading={connect.isPending} />
          {connect.data ? (
            <Surface style={{ gap: space.xs }}>
              <T variant="bodyStrong" selectable>{connect.data.token}</T>
              <T variant="caption" color={colors.yellow}>{connect.data.note}</T>
            </Surface>
          ) : null}
        </Section>
      </ScrollView>
    </Screen>
  );
}

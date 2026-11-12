import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { FloatingOrbSetting } from '@/components/FloatingOrbSetting';
import { Button, Row, Screen, Section, T, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { NAV_ICON } from '@/lib/icons';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/theme';

export default function Settings() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });

  const set = async (patch: Parameters<typeof api.updateSettings>[0]) => {
    qc.setQueryData(['settings'], { ...settings.data, ...patch });
    await api.updateSettings(patch);
    void qc.invalidateQueries({ queryKey: ['settings'] });
  };

  const a = me.data?.agent;
  const s = settings.data;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingBottom: 140, gap: space.xxl }}>
        <View style={{ gap: 4 }}>
          <T variant="title">Ajustes</T>
          <T variant="caption" color={colors.textSecondary}>{me.data?.email}{me.data?.profile?.role === 'master' ? ' · master' : ''}</T>
        </View>

        <Section title="Assistente">
          <Row title="Personalidade" subtitle={a ? `${a.name} · ${a.personality} · tom ${a.tone} · respostas ${a.responseStyle}` : '…'} onPress={() => router.push('/agent')} />
          <Row title="Sobre você" subtitle="Trabalho, o que você faz, sua rotina" onPress={() => router.push('/about')} />
          <Row title="Voice Studio" subtitle={a ? `Voz: ${a.voiceProvider === 'device' ? 'do aparelho' : a.voiceProvider}${a.voiceId && a.voiceProvider !== 'device' ? ` · ${a.voiceId}` : ''}` : '…'} onPress={() => router.push('/voice-studio')} />
          {s ? (
            <>
              <Toggle label="Responder em voz alta" value={s.speakResponses} onChange={(v) => set({ speakResponses: v })} />
              <Toggle label="Salvar memórias automaticamente" hint="Desligado: a MAINDY pede confirmação antes de guardar." value={s.autoSaveMemories} onChange={(v) => set({ autoSaveMemories: v })} />
            </>
          ) : null}
          <FloatingOrbSetting />
        </Section>

        <Section title="Organização">
          <Row icon={NAV_ICON.tasks} title="Tarefas" onPress={() => router.push('/tasks')} />
          <Row icon={NAV_ICON.focus} title="Foco" subtitle="Trabalho, estudo, descanso, sono e direção" onPress={() => router.push('/focus')} />
        </Section>

        <Section title="Dados e conexões">
          <Row title="Vault Obsidian" subtitle="Seu segundo cérebro em Markdown" onPress={() => router.push('/vault')} />
          <Row title="Integrações" subtitle="Google (Gmail + Agenda), clima" onPress={() => router.push('/integrations')} />
          <Row title="Permissões da assistente" subtitle="O que ela pode fazer sozinha" onPress={() => router.push('/permissions')} />
          <Row title="Privacidade" subtitle="Exportar, apagar, consentimentos, aparelhos" onPress={() => router.push('/privacy')} />
        </Section>

        <Section title="Plano">
          <T variant="body" color={colors.textSecondary}>Plano: Beta gratuito. Assinaturas ainda não estão disponíveis.</T>
        </Section>

        <Section title="Status do sistema">
          {health.data ? (
            <View style={{ gap: 6 }}>
              <T variant="caption" color={health.data.database ? colors.success : colors.danger}>● Banco de dados</T>
              <T variant="caption" color={health.data.ai.configured ? colors.success : colors.yellow}>● IA: {health.data.ai.configured ? health.data.ai.model : 'modo local (Claude não configurado no servidor)'}</T>
              <T variant="caption" color={health.data.embeddings.ready ? colors.success : colors.yellow}>● Busca semântica: {health.data.embeddings.ready ? 'pronta' : 'carregando'}</T>
              {health.data.voice.map((v) => (
                <T key={v.provider} variant="caption" color={v.available ? colors.success : colors.textSecondary}>● Voz {v.provider}: {v.available ? 'disponível' : 'indisponível'}</T>
              ))}
            </View>
          ) : (
            <T variant="caption" color={colors.danger}>Servidor inacessível</T>
          )}
        </Section>

        <Button kind="secondary" label="Sair" onPress={async () => { await supabase.auth.signOut(); qc.clear(); router.replace('/auth/login'); }} />
      </ScrollView>
    </Screen>
  );
}

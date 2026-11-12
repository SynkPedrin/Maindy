import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScrollView, View } from 'react-native';
import { Header } from '@/components/Header';
import { Chip, Screen, Section, T } from '@/components/ui';
import { api } from '@/lib/api';
import { whenLabel } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { colors, space } from '@/theme';

const LEVEL = ['Consultar', 'Organizar', 'Ações reversíveis', 'Comunicação externa', 'Sensível / irreversível'];
const MODE = { auto: 'Automático', confirm: 'Pedir confirmação', deny: 'Não permitir' } as const;
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function Permissions() {
  const qc = useQueryClient();
  const data = useQuery({ queryKey: ['permissions'], queryFn: api.permissions });
  const audit = useQuery({ queryKey: ['audit'], queryFn: api.audit });

  const current = (cap: string) => data.data?.grants.find((g) => g.capability === cap && !g.revokedAt && (!g.expiresAt || Date.parse(g.expiresAt) > Date.now()));
  const set = async (cap: string, mode: keyof typeof MODE) => {
    const g = current(cap);
    if (g) await api.revoke(g.id);
    await api.grant(cap, mode);
    haptic('select');
    void qc.invalidateQueries({ queryKey: ['permissions'] });
    void qc.invalidateQueries({ queryKey: ['audit'] });
  };

  return (
    <Screen>
      <Header title="Permissões" subtitle="Você decide o que a assistente faz sozinha. Ela nunca concede permissões a si mesma." />
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl, paddingBottom: 80 }}>
        {[0, 1, 2, 3, 4].map((lvl) => (
          <Section key={lvl} title={`Nível ${lvl} · ${LEVEL[lvl]}`}>
            {(data.data?.capabilities ?? []).filter((c) => c.level === lvl).map((c) => {
              const g = current(c.capability);
              const mode = (g?.mode ?? c.defaultMode) as keyof typeof MODE;
              return (
                <View key={c.capability} style={{ gap: space.sm, paddingVertical: space.sm }}>
                  <T variant="body">{c.description}{c.integration ? ` (${c.integration})` : ''}</T>
                  <View style={{ flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' }}>
                    {(Object.keys(MODE) as Array<keyof typeof MODE>)
                      .filter((m) => !(lvl === 4 && m === 'auto'))
                      .map((m) => <Chip key={m} label={MODE[m]} active={mode === m} onPress={() => set(c.capability, m)} />)}
                  </View>
                  {lvl === 4 ? <T variant="caption" color={colors.textSecondary}>Ações sensíveis sempre pedem confirmação.</T> : null}
                </View>
              );
            })}
          </Section>
        ))}
        <Section title="Registro de auditoria">
          {(audit.data ?? []).slice(0, 25).map((l) => (
            <T key={l.id} variant="caption" color={colors.textSecondary}>{whenLabel(l.createdAt, TZ)} · {l.actor === 'agent' ? 'assistente' : l.actor === 'user' ? 'você' : 'sistema'} · {l.action}</T>
          ))}
        </Section>
      </ScrollView>
    </Screen>
  );
}

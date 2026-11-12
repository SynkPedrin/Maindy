import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { Header } from '@/components/Header';
import { PERSONALITIES, TONES, TraitPicker, joinTraits, parseTraits } from '@/components/PersonalityPicker';
import { Button, Field, Screen, Section, T } from '@/components/ui';
import { api } from '@/lib/api';
import { colors, space } from '@/theme';

export default function AgentSettings() {
  const qc = useQueryClient();
  const agent = useQuery({ queryKey: ['agent'], queryFn: api.agent });
  const [name, setName] = useState('');
  const [personality, setPersonality] = useState<string[]>([]);
  const [tone, setTone] = useState<string[]>([]);
  useEffect(() => {
    if (agent.data) {
      setName(agent.data.name);
      setPersonality(parseTraits(agent.data.personality));
      setTone(parseTraits(agent.data.tone));
    }
  }, [agent.data]);

  const save = async () => {
    await api.updateAgent({ name: name.trim(), personality: joinTraits(personality), tone: joinTraits(tone) });
    void qc.invalidateQueries();
    router.back();
  };

  return (
    <Screen>
      <Header title="Personalidade" />
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl, paddingBottom: 80 }}>
        <Field label="Nome" value={name} onChangeText={setName} maxLength={40} />
        <T variant="caption" color={colors.textSecondary}>Você pode chamar a assistente pelo nome: “{name.trim() || 'MAINDY'}, guarda isso…”.</T>
        <Section title="Personalidade (combine várias)">
          <TraitPicker options={PERSONALITIES} value={personality} onChange={setPersonality} />
        </Section>
        <Section title="Tom">
          <TraitPicker options={TONES} value={tone} onChange={setTone} max={2} />
        </Section>
        <Button label="Salvar" onPress={save} disabled={!name.trim() || !personality.length || !tone.length} />
      </ScrollView>
    </Screen>
  );
}

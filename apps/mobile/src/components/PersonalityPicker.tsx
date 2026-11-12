import { View } from 'react-native';
import { space } from '@/theme';
import { Chip, T } from './ui';

export const PERSONALITIES = ['acolhedora', 'objetiva', 'animada', 'serena', 'divertida', 'paciente', 'motivadora', 'direta'];
export const TONES = ['calmo', 'próximo', 'profissional', 'bem-humorado'];

export const parseTraits = (s: string | null | undefined) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
export const joinTraits = (t: string[]) => t.join(', ');

/** Multi-select chips (personality and tone can combine several traits). */
export function TraitPicker({ options, value, onChange, max = 4 }: { options: string[]; value: string[]; onChange: (v: string[]) => void; max?: number }) {
  const toggle = (o: string) => {
    if (value.includes(o)) onChange(value.filter((x) => x !== o));
    else if (value.length < max) onChange([...value, o]);
  };
  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {options.map((o) => (
          <Chip key={o} label={value.includes(o) ? `✓ ${o}` : o} active={value.includes(o)} onPress={() => toggle(o)} />
        ))}
      </View>
      <T variant="caption" color="#6E7199">Escolha até {max}.</T>
    </View>
  );
}

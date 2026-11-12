import { View } from 'react-native';
import { space } from '@/theme';
import { Field } from './ui';

export interface About {
  work: string;
  activities: string;
  routine: string;
}

/** "Sobre você": what the user does — saved as confirmed memories the assistant always knows. */
export function AboutForm({ value, onChange }: { value: About; onChange: (v: About) => void }) {
  return (
    <View style={{ gap: space.lg }}>
      <Field label="Com o que você trabalha?" placeholder="Ex.: sou designer numa agência, cuido de clientes de varejo" value={value.work} onChangeText={(t) => onChange({ ...value, work: t })} multiline maxLength={2000} style={{ minHeight: 84, textAlignVertical: 'top' }} />
      <Field label="O que você faz no dia a dia?" placeholder="Ex.: faculdade à noite, academia, cuido da minha filha" value={value.activities} onChangeText={(t) => onChange({ ...value, activities: t })} multiline maxLength={2000} style={{ minHeight: 84, textAlignVertical: 'top' }} />
      <Field label="Como é sua rotina?" placeholder="Ex.: acordo 6h30, trabalho das 9h às 18h, durmo por volta da meia-noite" value={value.routine} onChangeText={(t) => onChange({ ...value, routine: t })} multiline maxLength={2000} style={{ minHeight: 84, textAlignVertical: 'top' }} />
    </View>
  );
}

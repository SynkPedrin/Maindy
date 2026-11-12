import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { AboutForm, type About } from '@/components/AboutForm';
import { Orb } from '@/components/Orb';
import { PERSONALITIES, TONES, TraitPicker, joinTraits } from '@/components/PersonalityPicker';
import { Button, Chip, Field, Screen, Surface, T, Tap } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { CONSENT_POLICY_VERSION } from '@/lib/config';
import { haptic } from '@/lib/haptics';
import { notificationPermission, registerDevice } from '@/lib/notifications';
import { colors, radius, space } from '@/theme';

const STEPS = 7;
const STYLES: Array<{ id: 'curto' | 'equilibrado' | 'detalhado'; label: string }> = [
  { id: 'curto', label: 'Curto' },
  { id: 'equilibrado', label: 'Equilibrado' },
  { id: 'detalhado', label: 'Detalhado' },
];
const DEMO = 'Minha mãe prefere que eu ligue depois das 18h.';
const DEMO_Q = 'Qual o melhor horário para ligar para minha mãe?';

function Dots({ step }: { step: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }} accessibilityLabel={`Passo ${step + 1} de ${STEPS}`}>
      {Array.from({ length: STEPS }).map((_, i) => (
        <View key={i} style={{ width: i === step ? 22 : 6, height: 6, borderRadius: 3, backgroundColor: i === step ? colors.yellow : colors.surfaceLight }} />
      ))}
    </View>
  );
}

export default function Onboarding() {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [agentName, setAgentName] = useState('MAINDY');
  const [personality, setPersonality] = useState<string[]>(['acolhedora']);
  const [tone, setTone] = useState<string[]>(['calmo']);
  const [about, setAbout] = useState<About>({ work: '', activities: '', routine: '' });
  const [style, setStyle] = useState<'curto' | 'equilibrado' | 'detalhado'>('curto');
  const [perms, setPerms] = useState<Record<string, 'granted' | 'denied' | 'skipped' | undefined>>({});
  const [demo, setDemo] = useState<{ saved?: string; answer?: string; busy?: boolean; error?: string }>({});
  const [consent, setConsent] = useState(false);

  const next = () => {
    haptic('select');
    setStep((s) => Math.min(STEPS - 1, s + 1));
  };

  const savePersona = async () => {
    await api.updateAgent({ name: agentName.trim() || 'MAINDY', personality: joinTraits(personality.length ? personality : ['acolhedora']), tone: joinTraits(tone.length ? tone : ['calmo']), responseStyle: style, language: 'pt-BR', voiceProvider: 'device' }).catch(() => undefined);
    next();
  };

  const saveAbout = async () => {
    if (about.work.trim() || about.activities.trim() || about.routine.trim()) await api.saveAbout(about).catch(() => undefined);
    next();
  };

  const ask = async (kind: 'mic' | 'notifications' | 'location') => {
    let ok = false;
    if (kind === 'mic') ok = (await requestRecordingPermissionsAsync()).granted;
    if (kind === 'notifications') ok = await notificationPermission(true);
    if (kind === 'location') ok = Platform.OS === 'web' ? false : (await Location.requestForegroundPermissionsAsync()).granted;
    setPerms((p) => ({ ...p, [kind]: ok ? 'granted' : 'denied' }));
    haptic(ok ? 'success' : 'cancel');
  };

  const runDemo = async () => {
    setDemo({ busy: true });
    try {
      const saved = await api.chat(DEMO, null);
      const answer = await api.chat(DEMO_Q, saved.conversationId);
      setDemo({ saved: saved.reply, answer: answer.reply });
      haptic('success');
    } catch (e) {
      setDemo({ error: e instanceof ApiError ? e.message : 'Não consegui falar com o servidor.' });
    }
  };

  const finish = async () => {
    try {
      for (const kind of ['terms', 'privacy', 'ai_processing'] as const) await api.recordConsent(kind, true, CONSENT_POLICY_VERSION);
      await api.provisionVault();
      await registerDevice();
      await api.updateMe({ onboardingCompleted: true, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      await qc.invalidateQueries();
      router.replace('/(tabs)');
    } catch (e) {
      setDemo((d) => ({ ...d, error: e instanceof ApiError ? e.message : 'Não consegui concluir. Tente de novo.' }));
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ paddingTop: space.lg }}>
        <Dots step={step} />
      </View>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: space.xl, gap: space.xl }} keyboardShouldPersistTaps="handled">
        <Animated.View key={step} entering={FadeInRight.duration(360)} exiting={FadeOutLeft.duration(200)} style={{ flex: 1, gap: space.xl }}>
          {step === 0 && (
            <View style={{ flex: 1, justifyContent: 'center', gap: space.xl }}>
              <Image source={require('../assets/onboarding/welcome.png')} style={{ width: '100%', height: 300 }} contentFit="contain" />
              <T variant="display">Uma memória que acompanha você.</T>
              <T variant="body" color={colors.textSecondary}>Conheça a MAINDY, sua assistente pessoal inteligente.</T>
            </View>
          )}
          {step === 1 && (
            <View style={{ flex: 1, justifyContent: 'center', gap: space.xl }}>
              <Image source={require('../assets/onboarding/memory.png')} style={{ width: '100%', height: 260 }} contentFit="contain" />
              <T variant="title">Fale ou escreva. Ela guarda.</T>
              <Surface style={{ gap: space.sm }}>
                <T variant="caption" color={colors.textSecondary}>Você diz</T>
                <T variant="bodyStrong">“{DEMO}”</T>
                <T variant="caption" color={colors.purpleLight}>→ Mãe · prefere ligação depois das 18h · confirmado por você</T>
              </Surface>
              <T variant="body" color={colors.textSecondary}>Dias depois, é só perguntar. A MAINDY responde com o que você disse e quando disse.</T>
            </View>
          )}
          {step === 2 && (
            <View style={{ flex: 1, justifyContent: 'center', gap: space.xl }}>
              <Image source={require('../assets/onboarding/organization.png')} style={{ width: '100%', height: 260 }} contentFit="contain" />
              <T variant="title">Tarefas, lembretes e agenda no mesmo lugar.</T>
              <T variant="body" color={colors.textSecondary}>“Me lembra de tomar o remédio às 21h.” “O que eu tenho pra fazer hoje?” Ela organiza e te avisa na hora certa.</T>
            </View>
          )}
          {step === 3 && (
            <View style={{ gap: space.lg }}>
              <T variant="title">Do seu jeito</T>
              <Field label="Nome da assistente" value={agentName} onChangeText={setAgentName} maxLength={40} />
              <T variant="caption" color={colors.textSecondary}>Personalidade (pode escolher mais de uma)</T>
              <TraitPicker options={PERSONALITIES} value={personality} onChange={setPersonality} />
              <T variant="caption" color={colors.textSecondary}>Tom</T>
              <TraitPicker options={TONES} value={tone} onChange={setTone} max={2} />
              <T variant="caption" color={colors.textSecondary}>Respostas</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{STYLES.map((p) => <Chip key={p.id} label={p.label} active={style === p.id} onPress={() => setStyle(p.id)} />)}</View>
              <T variant="caption" color={colors.textSecondary}>Dica: comece a frase com o nome dela — “{agentName.trim() || 'MAINDY'}, guarda isso…”, “{agentName.trim() || 'MAINDY'}, me lembra às 18h”. Idioma: Português (Brasil). A voz pode ser trocada em Ajustes › Voice Studio.</T>
            </View>
          )}
          {step === 4 && (
            <View style={{ gap: space.lg }}>
              <T variant="title">Sobre você</T>
              <T variant="body" color={colors.textSecondary}>Conte um pouco da sua vida para {agentName.trim() || 'a assistente'} entender seu contexto. Pode pular e preencher depois em Ajustes › Sobre você.</T>
              <AboutForm value={about} onChange={setAbout} />
            </View>
          )}
          {step === 5 && (
            <View style={{ gap: space.lg }}>
              <T variant="title">Permissões, uma de cada vez</T>
              <T variant="body" color={colors.textSecondary}>Você pode pular qualquer uma e mudar depois.</T>
              {(
                [
                  { k: 'mic', title: 'Microfone', why: 'Só enquanto você segura o botão de voz. O áudio não é guardado.', required: false },
                  { k: 'notifications', title: 'Notificações', why: 'Para os lembretes chegarem na hora certa.', required: false },
                  { k: 'location', title: 'Localização', why: 'Para o clima do dia. Só com o app aberto.', required: false },
                ] as const
              ).map((p) => (
                <Surface key={p.k} style={{ gap: space.sm }}>
                  <T variant="bodyStrong">{p.title}</T>
                  <T variant="caption" color={colors.textSecondary}>{p.why}</T>
                  <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xs }}>
                    {perms[p.k] ? (
                      <T variant="caption" color={perms[p.k] === 'granted' ? colors.success : colors.textSecondary}>{perms[p.k] === 'granted' ? 'Permitido' : perms[p.k] === 'skipped' ? 'Pulado' : 'Não permitido'}</T>
                    ) : (
                      <>
                        <Chip label="Permitir" active onPress={() => ask(p.k)} />
                        <Chip label="Agora não" onPress={() => setPerms((x) => ({ ...x, [p.k]: 'skipped' }))} />
                      </>
                    )}
                  </View>
                </Surface>
              ))}
              <Tap onPress={() => setConsent(!consent)} accessibilityRole="checkbox" accessibilityState={{ checked: consent }} style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start', paddingVertical: space.sm }}>
                <View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: consent ? colors.purple : colors.surfaceLight, alignItems: 'center', justifyContent: 'center' }}>{consent ? <T variant="caption">✓</T> : null}</View>
                <T variant="caption" color={colors.textSecondary} style={{ flex: 1 }}>
                  Li e aceito os Termos e a Política de Privacidade. Autorizo o processamento das minhas mensagens por IA para que a MAINDY funcione. Meus dados não são usados para treinar modelos.
                </T>
              </Tap>
            </View>
          )}
          {step === 6 && (
            <View style={{ flex: 1, gap: space.xl, alignItems: 'center' }}>
              <Orb state={demo.busy ? 'thinking' : demo.answer ? 'speaking' : 'idle'} size={170} />
              <T variant="title" style={{ textAlign: 'center' }}>Sua primeira conversa</T>
              {!demo.saved && !demo.busy ? (
                <T variant="body" color={colors.textSecondary} style={{ textAlign: 'center' }}>Vamos guardar uma memória de exemplo e perguntar sobre ela, de verdade.</T>
              ) : null}
              {demo.saved ? (
                <Animated.View entering={FadeInDown} style={{ alignSelf: 'stretch', gap: space.md }}>
                  <View style={{ alignSelf: 'flex-end', backgroundColor: colors.purple, borderRadius: radius.lg, padding: space.md, maxWidth: '85%' }}><T>{DEMO}</T></View>
                  <View style={{ alignSelf: 'flex-start', backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, maxWidth: '85%' }}><T>{demo.saved}</T></View>
                  <View style={{ alignSelf: 'flex-end', backgroundColor: colors.purple, borderRadius: radius.lg, padding: space.md, maxWidth: '85%' }}><T>{DEMO_Q}</T></View>
                  {demo.answer ? (
                    <Animated.View entering={FadeIn.delay(200)} style={{ alignSelf: 'flex-start', backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, maxWidth: '85%' }}><T>{demo.answer}</T></Animated.View>
                  ) : null}
                </Animated.View>
              ) : null}
              {demo.error ? <T variant="caption" color={colors.danger}>{demo.error}</T> : null}
            </View>
          )}
        </Animated.View>
      </ScrollView>
      <View style={{ padding: space.xl, gap: space.sm }}>
        {step < 3 && <Button label="Continuar" onPress={next} />}
        {step === 3 && <Button label="Salvar e continuar" onPress={savePersona} />}
        {step === 4 && <Button label={about.work || about.activities || about.routine ? 'Salvar e continuar' : 'Pular por enquanto'} onPress={saveAbout} />}
        {step === 5 && <Button label="Continuar" onPress={next} disabled={!consent} />}
        {step === 6 && (demo.answer ? <Button label="Começar a usar" onPress={finish} /> : <Button label="Testar agora" onPress={runDemo} loading={demo.busy} />)}
        {step === 6 && !demo.answer ? <Button kind="ghost" label="Pular demonstração" onPress={finish} /> : null}
      </View>
    </Screen>
  );
}

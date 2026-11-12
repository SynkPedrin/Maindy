import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Button, Field, Screen, T, Tap } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { DEFAULT_API_URL, apiUrl, setServerOverride } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/theme';

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showServer, setShowServer] = useState(false);
  const [server, setServer] = useState(apiUrl());

  const saveServer = async () => {
    const url = server.trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s]+$/.test(url)) return setMsg('Endereço inválido. Use http(s)://…');
    await setServerOverride(url === DEFAULT_API_URL ? null : url);
    try {
      const r = await fetch(`${url}/v1/health`);
      setMsg(r.ok ? 'Servidor conectado.' : `Servidor respondeu ${r.status}.`);
    } catch {
      setMsg('Não consegui falar com esse servidor.');
    }
    setShowServer(false);
  };

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    const res =
      mode === 'in'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim() || undefined } } });
    setBusy(false);
    if (res.error) {
      haptic('error');
      setMsg(res.error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : res.error.message);
      return;
    }
    if (!res.data.session) {
      setMsg('Conta criada. Confirme seu e-mail para entrar.');
      return;
    }
    haptic('success');
    router.replace('/');
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: space.xl, gap: space.xl }} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInDown.duration(500)} style={{ alignItems: 'center', gap: space.lg }}>
            <Image source={require('../../assets/brand/maindy-symbol.png')} style={{ width: 112, height: 112 }} contentFit="contain" />
            <Image source={require('../../assets/brand/maindy-wordmark.png')} style={{ width: 150, height: 48 }} contentFit="contain" accessibilityLabel="maindy" />
            <T variant="body" color={colors.textSecondary} style={{ textAlign: 'center' }}>
              {mode === 'in' ? 'Que bom te ver de novo.' : 'Crie sua conta para começar.'}
            </T>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(120).duration(500)} style={{ gap: space.md }}>
            {mode === 'up' ? <Field label="Como quer ser chamado(a)?" value={name} onChangeText={setName} autoComplete="name" textContentType="name" /> : null}
            <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
            <Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'in' ? 'current-password' : 'new-password'} textContentType={mode === 'in' ? 'password' : 'newPassword'} onSubmitEditing={submit} />
            {msg ? <T variant="caption" color={msg.startsWith('Conta criada') || msg.startsWith('Servidor conectado') ? colors.success : colors.danger} accessibilityLiveRegion="polite">{msg}</T> : null}
            <View style={{ height: space.sm }} />
            <Button label={mode === 'in' ? 'Entrar' : 'Criar conta'} onPress={submit} loading={busy} disabled={!email || password.length < 8} />
            <Tap onPress={() => setMode(mode === 'in' ? 'up' : 'in')} accessibilityRole="button" style={{ alignItems: 'center', padding: space.md }}>
              <T variant="caption" color={colors.purpleLight}>{mode === 'in' ? 'Ainda não tem conta? Criar conta' : 'Já tenho conta. Entrar'}</T>
            </Tap>
            {showServer ? (
              <View style={{ gap: space.sm }}>
                <Field label="Servidor da MAINDY" value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
                <Button kind="secondary" label="Usar este servidor" onPress={saveServer} />
              </View>
            ) : (
              <Tap onPress={() => setShowServer(true)} accessibilityRole="button" style={{ alignItems: 'center', padding: space.sm }}>
                <T variant="caption" color="#6E7199">Servidor: {apiUrl().replace(/^https?:\/\//, '')}</T>
              </Tap>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

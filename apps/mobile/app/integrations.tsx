import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { Header } from '@/components/Header';
import { Chip, Screen, Section, Surface, T } from '@/components/ui';
import { api } from '@/lib/api';
import { colors, space } from '@/theme';

export default function Integrations() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['integrations'], queryFn: api.integrations });
  const [weather, setWeather] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const connect = async (provider: string) => {
    setErr(null);
    try {
      const { authorizationUrl } = await api.connectIntegration(provider);
      await WebBrowser.openAuthSessionAsync(authorizationUrl);
      void qc.invalidateQueries({ queryKey: ['integrations'] });
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const checkWeather = async () => {
    setErr(null);
    try {
      if (Platform.OS === 'web') throw new Error('Clima por localização está disponível no app do celular.');
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) throw new Error('Permissão de localização negada.');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const w = await api.weather(pos.coords.latitude, pos.coords.longitude);
      setWeather(`${Math.round(w.temperatureC)}° · ${w.description} · mín ${Math.round(w.todayMinC)}° máx ${Math.round(w.todayMaxC)}°${w.precipitationProbability != null ? ` · chuva ${w.precipitationProbability}%` : ''}`);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <Screen>
      <Header title="Integrações" />
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl, paddingBottom: 80 }}>
        <Section title="Conexões">
          {(list.data ?? []).map((i) => (
            <Surface key={i.provider} style={{ gap: space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <T variant="bodyStrong" style={{ flex: 1 }}>{i.label}</T>
                <T variant="caption" color={i.status === 'connected' ? colors.success : colors.textSecondary}>{i.status === 'connected' ? 'Conectado' : i.status === 'pending' ? 'Aguardando' : 'Desconectado'}</T>
              </View>
              {i.note ? <T variant="caption" color={colors.textSecondary}>{i.note}</T> : null}
              {i.provider === 'google' ? (
                i.available ? (
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    {i.status === 'connected' ? <Chip label="Desconectar" onPress={async () => { await api.disconnectIntegration('google'); void qc.invalidateQueries({ queryKey: ['integrations'] }); }} /> : <Chip label="Conectar Google" active onPress={() => connect('google')} />}
                  </View>
                ) : (
                  <T variant="caption" color={colors.yellow}>Ainda não configurado no servidor (faltam as credenciais OAuth do Google).</T>
                )
              ) : null}
              {i.provider === 'weather' ? <Chip label="Ver clima agora" onPress={checkWeather} /> : null}
            </Surface>
          ))}
          {weather ? <T variant="body">{weather}</T> : null}
          {err ? <T variant="caption" color={colors.danger}>{err}</T> : null}
        </Section>
        <T variant="caption" color={colors.textSecondary}>E-mails só são enviados depois da sua confirmação. Tokens ficam criptografados no servidor e nunca no aparelho.</T>
      </ScrollView>
    </Screen>
  );
}

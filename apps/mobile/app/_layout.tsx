import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Entrance } from '@/components/Entrance';
import { AppIntents } from '@/lib/native';
import { loadServerOverride } from '@/lib/config';
import { startSessionListener } from '@/lib/session';
import { colors } from '@/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: true } },
});

// On wide browser windows the app is shown as a centered phone-width column.
const WEB_COLUMN = Platform.OS === 'web' ? ({ flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center', overflow: 'hidden' } as const) : { flex: 1 };

export default function RootLayout() {
  const [entranceDone, setEntranceDone] = useState(false);
  const [serverReady, setServerReady] = useState(false);
  useEffect(() => {
    void loadServerOverride().finally(() => {
      setServerReady(true);
      startSessionListener();
    });
    void SplashScreen.hideAsync().catch(() => undefined);
    // iOS App Intents ("Falar com a MAINDY", "Salvar memória") hand their deep link to JS
    const route = (url: string) => router.push(url.replace(/^maindy:\/\//, '/') as never);
    const pending = AppIntents.consumePendingUrl();
    if (pending) setTimeout(() => route(pending), 600);
    const sub = AppIntents.addListener('onIntentUrl', ({ url }) => route(url));
    return () => sub.remove();
  }, []);
  const done = useCallback(() => setEntranceDone(true), []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.navy }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <View style={WEB_COLUMN}>
            {serverReady ? <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.navy }, animation: 'fade_from_bottom' }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="memory/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            </Stack> : null}
            {!entranceDone ? <Entrance onDone={done} /> : null}
          </View>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

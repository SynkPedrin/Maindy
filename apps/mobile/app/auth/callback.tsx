import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { Button, Screen, T } from '@/components/ui';
import { setSessionFromFragment } from '@/lib/supabase';
import { colors, space } from '@/theme';

/**
 * Session hand-off from the landing page / OAuth:
 *   <app>/auth/callback#access_token=…&refresh_token=…&expires_in=…&token_type=bearer&type=…
 * The tokens are stored with supabase.auth.setSession; we never call signOut here.
 */
export default function AuthCallback() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    (async () => {
      let fragment = '';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        fragment = window.location.hash;
        window.history.replaceState(null, '', window.location.pathname); // drop tokens from the URL bar
      } else {
        const url = await Linking.getInitialURL();
        fragment = url?.includes('#') ? url.slice(url.indexOf('#')) : '';
      }
      const ok = await setSessionFromFragment(fragment);
      if (ok) router.replace('/');
      else setFailed(true);
    })();
  }, []);

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl }}>
        {failed ? (
          <>
            <T variant="heading">Não consegui concluir o login.</T>
            <T variant="body" color={colors.textSecondary} style={{ textAlign: 'center' }}>O link pode ter expirado. Entre novamente.</T>
            <Button label="Ir para o login" onPress={() => router.replace('/auth/login')} />
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.purpleLight} />
            <T variant="body" color={colors.textSecondary}>Entrando…</T>
          </>
        )}
      </View>
    </Screen>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors } from '@/theme';

/** Routing gate: no session → login; onboarding not done → onboarding; else home. */
export default function Gate() {
  const { ready, session } = useSession();
  const me = useQuery({ queryKey: ['me', session?.user.id], queryFn: api.me, enabled: Boolean(session) });

  if (!ready || (session && me.isLoading)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.purpleLight} />
      </View>
    );
  }
  if (!session) return <Redirect href="/auth/login" />;
  if (me.data && !me.data.profile?.onboardingCompletedAt) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}

import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'MAINDY',
  slug: 'maindy',
  scheme: 'maindy',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  icon: './assets/app-icons/app-icon.png',
  backgroundColor: '#05082B',
  ios: {
    bundleIdentifier: 'com.maindy.app',
    supportsTablet: false,
    infoPlist: {
      NSSpeechRecognitionUsageDescription: 'A MAINDY transcreve sua fala no próprio aparelho para entender o que você pede.',
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
      NSMicrophoneUsageDescription: 'A MAINDY usa o microfone só enquanto você segura o botão de voz, para entender o que você diz.',
      NSLocationWhenInUseUsageDescription: 'A MAINDY usa sua localização para mostrar o clima e, se você quiser, lembretes por lugar.',
      NSCalendarsUsageDescription: 'A MAINDY lê sua agenda para te ajudar a organizar o dia.',
      UIBackgroundModes: ['remote-notification'],
      NSSupportsLiveActivities: true,
    },
    // Needed to sign the widget extension (Apple Developer team). Set APPLE_TEAM_ID in your shell/EAS.
    ...(process.env.APPLE_TEAM_ID ? { appleTeamId: process.env.APPLE_TEAM_ID } : {}),
    entitlements: { 'com.apple.security.application-groups': ['group.com.maindy.app'] },
  },
  android: {
    package: 'com.maindy.app',
    adaptiveIcon: { foregroundImage: './assets/app-icons/adaptive-icon.png', backgroundColor: '#05082B' },
    permissions: ['RECORD_AUDIO', 'POST_NOTIFICATIONS', 'ACCESS_COARSE_LOCATION', 'VIBRATE', 'SYSTEM_ALERT_WINDOW', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_SPECIAL_USE'],
    blockedPermissions: ['android.permission.ACCESS_BACKGROUND_LOCATION'],
  },
  web: { bundler: 'metro', output: 'single', favicon: './assets/app-icons/splash-icon.png' },
  plugins: [
    'expo-router',
    'expo-secure-store',
    ['expo-splash-screen', { image: './assets/app-icons/splash-icon.png', imageWidth: 180, backgroundColor: '#05082B' }],
    ['expo-audio', { microphonePermission: 'A MAINDY usa o microfone só enquanto você segura o botão de voz.' }],
    ['expo-notifications', { color: '#7600FF', defaultChannel: 'reminders' }],
    ['expo-location', { locationWhenInUsePermission: 'A MAINDY usa sua localização para mostrar o clima.' }],
    ['expo-speech-recognition', {
      microphonePermission: 'A MAINDY usa o microfone só enquanto você segura o botão de voz.',
      speechRecognitionPermission: 'A MAINDY transcreve sua fala no próprio aparelho para entender o que você pede.',
      androidSpeechServicePackages: ['com.google.android.googlequicksearchbox'],
    }],
    '@bacons/apple-targets',
    './plugins/withOrbDrawables',
    './plugins/withLocalNetworkHttp',
  ],
  experiments: { typedRoutes: false },
  extra: {
    // Public values only. Never put secrets here: everything in `extra` ships inside the app.
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? null,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? null,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? null,
  },
};

export default config;

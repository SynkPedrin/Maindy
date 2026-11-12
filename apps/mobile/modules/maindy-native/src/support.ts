import { Platform } from 'react-native';

import type { Availability, Subscription, UnsupportedResult } from './MaindyNative.types';
import { NativeMaindy, type MaindyNativeModule } from './NativeMaindy';

export const SUPPORTED = { supported: true } as const;

export const REASONS = {
  iosOverlay: 'iOS does not allow global overlays',
  iosNotifications:
    "iOS does not let apps read or intercept other apps' notifications",
  iosUsage:
    'iOS does not expose per-app usage stats; Screen Time data requires the FamilyControls entitlement from Apple',
  androidWidgets: 'Home-screen widgets are only implemented for iOS (WidgetKit) for now',
  androidLiveActivity: 'Live Activities are an iOS-only feature (ActivityKit)',
  androidIntents: 'App Intents are an iOS-only feature',
  web: 'Not available on web',
  notLinked:
    'The MaindyNative native module is not linked in this build (Expo Go or missing prebuild). Run `npx expo prebuild` and a dev build.',
} as const;

export function unsupported(reason: string): UnsupportedResult {
  return { supported: false, reason };
}

/** Error thrown by Promise APIs whose result type cannot carry an UnsupportedResult. */
export class UnsupportedPlatformError extends Error {
  readonly code = 'ERR_MAINDY_UNSUPPORTED';
  readonly supported = false as const;
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = 'UnsupportedPlatformError';
    this.reason = reason;
  }
}

/**
 * Availability for a feature implemented natively on `platform`. Returns the native module when
 * usable, otherwise an UnsupportedResult explaining why.
 */
export function resolveNative(
  platform: 'android' | 'ios',
  otherPlatformReason: string
): { native: MaindyNativeModule; availability: Availability } | { native: null; availability: UnsupportedResult } {
  if (Platform.OS === 'web') return { native: null, availability: unsupported(REASONS.web) };
  if (Platform.OS !== platform) return { native: null, availability: unsupported(otherPlatformReason) };
  if (!NativeMaindy) return { native: null, availability: unsupported(REASONS.notLinked) };
  return { native: NativeMaindy, availability: SUPPORTED };
}

export const NOOP_SUBSCRIPTION: Subscription = { remove() {} };

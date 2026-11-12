import { NativeModule, requireOptionalNativeModule } from 'expo';

import type {
  AppIntentsEvents,
  FloatingAgentEvents,
  NotificationsEvents,
} from './MaindyNative.types';

type MaindyNativeEvents = FloatingAgentEvents & NotificationsEvents & AppIntentsEvents;

/**
 * Raw native surface. Android and iOS implement different subsets; always go through the
 * platform-gated wrappers (FloatingAgent, Notifications, Usage, Widgets, LiveActivity, AppIntents).
 */
export declare class MaindyNativeModule extends NativeModule<MaindyNativeEvents> {
  // Android
  floatingHasOverlayPermission(): boolean;
  floatingRequestOverlayPermission(): boolean;
  floatingShow(sizeDp: number | null, x: number | null, y: number | null): Promise<void>;
  floatingHide(): void;
  floatingIsShowing(): boolean;
  floatingSetListening(listening: boolean): boolean;
  notificationsHasListenerAccess(): boolean;
  notificationsOpenListenerSettings(): boolean;
  notificationsSetFilterRules(focusMode: string, allowPackages: string[], muteContents: boolean): void;
  notificationsGetFilterRules(): { focusMode: string; allowPackages: string[]; muteContents: boolean };
  usageHasAccess(): boolean;
  usageOpenSettings(): boolean;
  usageGetSummary(sinceMs: number): Promise<
    { packageName: string; totalTimeForegroundMs: number; lastTimeUsed: number }[]
  >;

  // iOS
  widgetsIsAppGroupAvailable(): boolean;
  widgetsSetSnapshot(json: string): void;
  widgetsClearSnapshot(): void;
  widgetsReload(): void;
  liveActivityAreEnabled(): boolean;
  liveActivityStartFocus(mode: string, endsAtMs: number): Promise<string>;
  liveActivityEnd(): Promise<number>;
  intentsConsumePendingUrl(): string | null;
}

/** `null` on web, in Expo Go, or when the app was built without this module (no prebuild). */
export const NativeMaindy = requireOptionalNativeModule<MaindyNativeModule>('MaindyNative');

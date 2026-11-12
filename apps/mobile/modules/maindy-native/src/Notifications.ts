import type {
  Availability,
  FocusMode,
  NativeResult,
  NotificationFilterRules,
  NotificationsEvents,
  Subscription,
} from './MaindyNative.types';
import { NOOP_SUBSCRIPTION, REASONS, SUPPORTED, resolveNative } from './support';

const resolved = () => resolveNative('android', REASONS.iosNotifications);

const FOCUS_MODES: readonly FocusMode[] = ['off', 'work', 'study', 'rest', 'sleep', 'driving'];

/**
 * Android NotificationListenerService for focus modes. Only active after the user enables
 * "Notification access" for MAINDY. Contents are never forwarded unless `muteContents === false`.
 *
 * Limitation: filtering calls `cancelNotification`, which only removes the notification from the
 * shade (sound/vibration may already have played). Calls, alarms, ongoing and foreground-service
 * notifications are never dismissed. iOS has no equivalent API.
 */
export const Notifications = {
  get availability(): Availability {
    return resolved().availability;
  },

  hasListenerAccess(): boolean {
    const { native } = resolved();
    return native ? native.notificationsHasListenerAccess() : false;
  },

  openListenerSettings(): NativeResult {
    const { native, availability } = resolved();
    if (!native) return availability;
    return native.notificationsOpenListenerSettings()
      ? SUPPORTED
      : { supported: false, reason: 'Could not open the notification access settings screen' };
  },

  /** Persists the rules natively (survives app restarts; read by the listener service). */
  setFilterRules(rules: NotificationFilterRules): NativeResult {
    const { native, availability } = resolved();
    if (!native) return availability;
    if (!FOCUS_MODES.includes(rules.focusMode)) {
      throw new Error(`Invalid focusMode '${rules.focusMode}'`);
    }
    native.notificationsSetFilterRules(
      rules.focusMode,
      Array.from(new Set(rules.allowPackages)),
      rules.muteContents !== false
    );
    return SUPPORTED;
  },

  /** Current persisted rules, or null where unsupported. Defaults: off / [] / muteContents true. */
  getFilterRules(): NotificationFilterRules | null {
    const { native } = resolved();
    if (!native) return null;
    const raw = native.notificationsGetFilterRules();
    return {
      focusMode: (FOCUS_MODES as readonly string[]).includes(raw.focusMode)
        ? (raw.focusMode as FocusMode)
        : 'off',
      allowPackages: raw.allowPackages,
      muteContents: raw.muteContents,
    };
  },

  addListener<E extends keyof NotificationsEvents>(
    eventName: E,
    listener: NotificationsEvents[E]
  ): Subscription {
    const { native } = resolved();
    return native ? native.addListener(eventName, listener as never) : NOOP_SUBSCRIPTION;
  },
};

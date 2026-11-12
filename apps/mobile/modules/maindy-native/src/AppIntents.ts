import type { AppIntentsEvents, Availability, Subscription } from './MaindyNative.types';
import { NOOP_SUBSCRIPTION, REASONS, resolveNative } from './support';

const resolved = () => resolveNative('ios', REASONS.androidIntents);

/**
 * Hand-off from iOS App Intents (Siri / Shortcuts / Control Center) to the JS router.
 *
 * `TalkToMaindyIntent` and `SaveMemoryIntent` open MAINDY and store a deep link
 * (`maindy://assistant?voice=1`, `maindy://capture?text=...`) in the App Group. Call
 * `consumePendingUrl()` on startup and subscribe to `onIntentUrl` for warm starts, then route it
 * (e.g. `router.push(...)` / `Linking.openURL(url)`). Links older than 2 minutes are dropped.
 */
export const AppIntents = {
  get availability(): Availability {
    return resolved().availability;
  },

  /** Returns and clears the pending intent URL, or null. Always null outside iOS. */
  consumePendingUrl(): string | null {
    const { native } = resolved();
    return native ? native.intentsConsumePendingUrl() : null;
  },

  addListener<E extends keyof AppIntentsEvents>(
    eventName: E,
    listener: AppIntentsEvents[E]
  ): Subscription {
    const { native } = resolved();
    return native ? native.addListener(eventName, listener as never) : NOOP_SUBSCRIPTION;
  },
};

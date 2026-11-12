import type {
  Availability,
  FloatingAgentEvents,
  FloatingAgentShowOptions,
  NativeResult,
  Subscription,
} from './MaindyNative.types';
import { NOOP_SUBSCRIPTION, REASONS, SUPPORTED, resolveNative } from './support';

const resolved = () => resolveNative('android', REASONS.iosOverlay);

/**
 * Android floating "bubble" agent drawn over other apps (SYSTEM_ALERT_WINDOW + foreground service).
 *
 * iOS: there is no API for global overlays, so every call returns
 * `{ supported: false, reason: 'iOS does not allow global overlays' }` (boolean queries return
 * `false`). Never treated as success.
 */
export const FloatingAgent = {
  get availability(): Availability {
    return resolved().availability;
  },

  /** True only on Android when the user granted "Display over other apps". */
  hasOverlayPermission(): boolean {
    const { native } = resolved();
    return native ? native.floatingHasOverlayPermission() : false;
  },

  /** Opens the system "Display over other apps" screen for MAINDY. */
  requestOverlayPermission(): NativeResult {
    const { native, availability } = resolved();
    if (!native) return availability;
    return native.floatingRequestOverlayPermission()
      ? SUPPORTED
      : { supported: false, reason: 'Could not open the overlay permission settings screen' };
  },

  /**
   * Shows the orb (starts the foreground service). Rejects with `ERR_OVERLAY_PERMISSION` when the
   * permission is missing, or `ERR_FLOATING_AGENT_START` if Android refuses to start the service
   * (e.g. called while the app is in background). Resolves `UnsupportedResult` on iOS/web.
   */
  async show(opts: FloatingAgentShowOptions = {}): Promise<NativeResult> {
    const { native, availability } = resolved();
    if (!native) return availability;
    await native.floatingShow(opts.sizeDp ?? null, opts.x ?? null, opts.y ?? null);
    return SUPPORTED;
  },

  hide(): NativeResult {
    const { native, availability } = resolved();
    if (!native) return availability;
    native.floatingHide();
    return SUPPORTED;
  },

  /** Whether the orb is currently on screen (may lag `show()` by a frame or two). */
  isShowing(): boolean {
    const { native } = resolved();
    return native ? native.floatingIsShowing() : false;
  },

  /**
   * Reflects the app's voice state on the orb (strong glow while listening).
   * Returns unsupported when the orb is not showing.
   */
  setListening(listening: boolean): NativeResult {
    const { native, availability } = resolved();
    if (!native) return availability;
    return native.floatingSetListening(listening)
      ? SUPPORTED
      : { supported: false, reason: 'The floating agent is not showing' };
  },

  addListener<E extends keyof FloatingAgentEvents>(
    eventName: E,
    listener: FloatingAgentEvents[E]
  ): Subscription {
    const { native } = resolved();
    return native ? native.addListener(eventName, listener as never) : NOOP_SUBSCRIPTION;
  },
};

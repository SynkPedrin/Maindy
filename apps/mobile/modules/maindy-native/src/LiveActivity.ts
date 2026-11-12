import type {
  Availability,
  FocusLiveActivityOptions,
  NativeResult,
  StartFocusResult,
} from './MaindyNative.types';
import { REASONS, SUPPORTED, resolveNative, unsupported } from './support';

const resolved = () => resolveNative('ios', REASONS.androidLiveActivity);

function toEpochMs(value: Date | number | string): number {
  const ms = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error('LiveActivity.startFocus: invalid endsAt');
  return ms;
}

/** iOS focus-session Live Activity (Lock Screen + Dynamic Island). Requires iOS 16.2+. */
export const LiveActivity = {
  get availability(): Availability {
    const { native, availability } = resolved();
    if (!native) return availability;
    return native.liveActivityAreEnabled()
      ? SUPPORTED
      : unsupported('Live Activities are disabled for MAINDY or require iOS 16.2+');
  },

  /**
   * Starts a focus Live Activity (replacing any running one). Rejects with
   * `ERR_MAINDY_LIVE_ACTIVITY` if Live Activities are disabled or endsAt is in the past.
   */
  async startFocus(opts: FocusLiveActivityOptions): Promise<StartFocusResult> {
    const { native, availability } = resolved();
    if (!native) return availability.supported ? unsupported(REASONS.notLinked) : availability;
    const activityId = await native.liveActivityStartFocus(String(opts.mode), toEpochMs(opts.endsAt));
    return { supported: true, activityId };
  },

  /** Ends all focus Live Activities. */
  async end(): Promise<NativeResult> {
    const { native, availability } = resolved();
    if (!native) return availability;
    await native.liveActivityEnd();
    return SUPPORTED;
  },
};

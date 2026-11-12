import type { Availability, NativeResult, UsageEntry } from './MaindyNative.types';
import { REASONS, SUPPORTED, UnsupportedPlatformError, resolveNative } from './support';

const resolved = () => resolveNative('android', REASONS.iosUsage);

/** Android UsageStatsManager access (user must enable "Usage access" for MAINDY). */
export const Usage = {
  get availability(): Availability {
    return resolved().availability;
  },

  hasUsageAccess(): boolean {
    const { native } = resolved();
    return native ? native.usageHasAccess() : false;
  },

  openUsageAccessSettings(): NativeResult {
    const { native, availability } = resolved();
    if (!native) return availability;
    return native.usageOpenSettings()
      ? SUPPORTED
      : { supported: false, reason: 'Could not open the usage access settings screen' };
  },

  /**
   * Foreground time per package since `sinceMs` (epoch ms), sorted by time desc.
   * Rejects with `ERR_USAGE_ACCESS` without access, and with `UnsupportedPlatformError`
   * (`code: 'ERR_MAINDY_UNSUPPORTED'`, `supported: false`) on iOS/web — an empty array would
   * be a fake "no usage" answer.
   *
   * Totals come from Android's aggregated usage buckets, so they can include some time from the
   * bucket that straddles `sinceMs`.
   */
  async getUsageSummary(sinceMs: number): Promise<UsageEntry[]> {
    const { native, availability } = resolved();
    if (!native) {
      throw new UnsupportedPlatformError(availability.supported ? '' : availability.reason);
    }
    return native.usageGetSummary(sinceMs);
  },
};

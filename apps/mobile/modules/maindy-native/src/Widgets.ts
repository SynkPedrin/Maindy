import type { Availability, NativeResult, WidgetSnapshot } from './MaindyNative.types';
import { REASONS, SUPPORTED, resolveNative, unsupported } from './support';

const resolved = () => resolveNative('ios', REASONS.androidWidgets);

/**
 * iOS WidgetKit data bridge. Writes the snapshot JSON to the App Group `group.com.maindy.app`
 * (UserDefaults key `maindy.widget.snapshot`) and reloads all widget timelines.
 */
export const Widgets = {
  get availability(): Availability {
    const { native, availability } = resolved();
    if (!native) return availability;
    return native.widgetsIsAppGroupAvailable()
      ? SUPPORTED
      : unsupported("App Group 'group.com.maindy.app' is not in this build's entitlements");
  },

  /**
   * Throws (`ERR_MAINDY_WIDGET`) if the App Group entitlement is missing or the snapshot is
   * malformed — it never pretends the widget was updated.
   */
  setSnapshot(snapshot: WidgetSnapshot): NativeResult {
    const { native, availability } = resolved();
    if (!native) return availability;
    if (!snapshot.updatedAt) throw new Error('WidgetSnapshot.updatedAt is required');
    native.widgetsSetSnapshot(JSON.stringify(snapshot));
    return SUPPORTED;
  },

  /** Removes the snapshot (e.g. on sign-out) and reloads widgets. */
  clearSnapshot(): NativeResult {
    const { native, availability } = resolved();
    if (!native) return availability;
    native.widgetsClearSnapshot();
    return SUPPORTED;
  },

  reload(): NativeResult {
    const { native, availability } = resolved();
    if (!native) return availability;
    native.widgetsReload();
    return SUPPORTED;
  },
};

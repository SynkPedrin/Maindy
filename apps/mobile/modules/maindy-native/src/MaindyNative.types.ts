// Public types of the MAINDY native module.

/** Returned (never thrown) by functions that cannot work on the current platform/build. */
export type UnsupportedResult = {
  supported: false;
  reason: string;
};

export type SupportedResult = {
  supported: true;
};

/** Result of fire-and-forget native calls: success, or an explicit "unsupported". */
export type NativeResult = SupportedResult | UnsupportedResult;

/** Static availability of a feature on the running platform/build. */
export type Availability = NativeResult;

// ---------------------------------------------------------------------------------------------
// Floating agent (Android only)

export type FloatingAgentShowOptions = {
  /** Orb window size in dp (40–120). Default 64, or the last used size. */
  sizeDp?: number;
  /** Left edge of the orb window in dp (screen coordinates). Default: last position / right edge. */
  x?: number;
  /** Top edge of the orb window in dp (screen coordinates). Default: last position / 1/3 down. */
  y?: number;
};

export type FloatingAgentMovedEvent = {
  /** New left edge in dp, after snapping to the nearest screen edge. */
  x: number;
  /** New top edge in dp. */
  y: number;
};

export type FloatingAgentDismissReason =
  | 'user' // dragged onto the dismiss target
  | 'notification' // "Remover" action in the persistent notification
  | 'app' // FloatingAgent.hide()
  | 'permission_missing' // overlay permission revoked
  | 'error'
  | 'system';

export type FloatingAgentDismissedEvent = {
  reason: FloatingAgentDismissReason;
};

export type FloatingAgentEvents = {
  /** Tap. Native already opened `maindy://assistant`. */
  onFloatingAgentPress: () => void;
  /** Long-press (voice activation). Native already opened `maindy://assistant?voice=1`. */
  onFloatingAgentLongPress: () => void;
  /** Finger lifted after a long-press (push-to-talk release). */
  onFloatingAgentLongPressEnd: () => void;
  onFloatingAgentMoved: (event: FloatingAgentMovedEvent) => void;
  onFloatingAgentDismissed: (event: FloatingAgentDismissedEvent) => void;
};

// ---------------------------------------------------------------------------------------------
// Notifications (Android only)

export type FocusMode = 'off' | 'work' | 'study' | 'rest' | 'sleep' | 'driving';

export type NotificationFilterRules = {
  focusMode: FocusMode;
  /** Packages that are never dismissed while a focus mode is on. */
  allowPackages: string[];
  /**
   * When true (default), titles/texts of other apps' notifications are NEVER forwarded to JS.
   * Only set to false after the user explicitly opted in.
   */
  muteContents: boolean;
};

export type NotificationPostedEvent = {
  packageName: string;
  category: string | null;
  /** Legacy Notification.priority (-2..2). */
  priority: number;
  /** Channel importance (NotificationManager.IMPORTANCE_*, 0..5), or -1000 when unknown. */
  importance: number;
  /** Epoch ms. */
  postedAt: number;
  isOngoing: boolean;
  /** True when MAINDY removed it from the shade because of the active focus mode. */
  dismissedByFocus: boolean;
  focusMode: FocusMode;
  /** Present only when muteContents === false. */
  title?: string | null;
  /** Present only when muteContents === false. */
  text?: string | null;
};

export type NotificationsEvents = {
  onNotificationPosted: (event: NotificationPostedEvent) => void;
};

// ---------------------------------------------------------------------------------------------
// Usage stats (Android only)

export type UsageEntry = {
  packageName: string;
  totalTimeForegroundMs: number;
  /** Epoch ms. */
  lastTimeUsed: number;
};

// ---------------------------------------------------------------------------------------------
// Widgets (iOS only)

export type WidgetSnapshot = {
  greeting?: string;
  nextReminder?: { title: string; /** ISO-8601 */ dueAt: string } | null;
  focusMode?: string;
  pendingTasks?: number;
  /** ISO-8601 */
  updatedAt: string;
};

// ---------------------------------------------------------------------------------------------
// Live Activity (iOS 16.2+ only)

export type FocusLiveActivityOptions = {
  mode: FocusMode | string;
  /** When the focus session ends: Date, epoch ms, or ISO-8601 string. Must be in the future. */
  endsAt: Date | number | string;
};

export type StartFocusResult = (SupportedResult & { activityId: string }) | UnsupportedResult;

// ---------------------------------------------------------------------------------------------
// App Intents hand-off (iOS only)

export type IntentUrlEvent = {
  /** e.g. `maindy://assistant?voice=1` or `maindy://capture?text=...` */
  url: string;
};

export type AppIntentsEvents = {
  onIntentUrl: (event: IntentUrlEvent) => void;
};

/** Minimal subscription shape (compatible with expo's EventSubscription). */
export type Subscription = { remove(): void };

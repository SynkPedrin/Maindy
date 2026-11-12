# MAINDY – native integrations

This document covers the native code that ships with the mobile app:

- `apps/mobile/modules/maindy-native/`: a local Expo module (autolinked from `modules/`), with Kotlin on Android and Swift on iOS.
- `apps/mobile/targets/widget/`: an iOS WidgetKit extension built with `@bacons/apple-targets` (widgets, Lock Screen accessories, Live Activity, Control, App Intents).

Everything is imported from a single entry point:

```ts
import {
  FloatingAgent, Notifications, Usage, Widgets, LiveActivity, AppIntents,
  UnsupportedPlatformError,
} from '@/../modules/maindy-native'; // or a relative path / tsconfig alias of your choice
```

## 1. Platform capability matrix

| Capability | Android | iOS | Notes |
|---|---|---|---|
| Floating orb over other apps | ✅ `FloatingAgent` (overlay + foreground service) | ❌ **Not possible.** iOS has no API for global overlays. | On iOS every call returns `{ supported: false, reason: 'iOS does not allow global overlays' }` |
| Read/filter other apps' notifications | ✅ `Notifications` (NotificationListenerService, after the user grants access) | ❌ **Not possible.** No third-party app can intercept or read other apps' notifications. | iOS Focus modes belong to the system. Apps can only read the Focus *status* (INFocusStatusCenter), which is not implemented here |
| Per-app usage time | ✅ `Usage` (UsageStatsManager, after the user grants access) | ❌ Without the **FamilyControls** entitlement it is not possible, and that entitlement must be approved by Apple | Even with FamilyControls, raw data stays inside the DeviceActivity report extension |
| Blocking apps | ❌ Not implemented (would need AccessibilityService or Device Admin, which Play restricts heavily) | ❌ Needs the **FamilyControls / ManagedSettings** entitlement from Apple | Not implemented on either platform |
| Home Screen widget | ❌ Not implemented yet (`Widgets` returns unsupported) | ✅ small + medium | |
| Lock Screen widgets | — | ✅ `accessoryCircular` (voice) + `accessoryRectangular` (next reminder) | |
| Siri / Shortcuts / Spotlight | — | ✅ `TalkToMaindyIntent`, `SaveMemoryIntent`, `AppShortcutsProvider` (pt-BR) | |
| Control Center / Action button control | — | ✅ iOS 18+ (`ControlWidgetButton`) | |
| Live Activity (focus session) | ❌ (`LiveActivity` returns unsupported) | ✅ iOS 16.2+ (Lock Screen + Dynamic Island) | |

The rules for unsupported platforms (web, Expo Go, the "other" OS, or a build that is missing the module):

- Boolean queries (`hasOverlayPermission`, `isShowing`, `hasListenerAccess`, `hasUsageAccess`) return `false`. They never return `true`.
- Actions return `NativeResult` = `{ supported: true }` or `{ supported: false, reason }`.
- `Usage.getUsageSummary` rejects with `UnsupportedPlatformError` (`code: 'ERR_MAINDY_UNSUPPORTED'`). An empty array would be a fake "no usage" answer.
- Every namespace exposes `availability`.
- `addListener` returns a no-op subscription.

## 2. Android

### 2.1 Floating agent (`FloatingAgent`)

```ts
if (!FloatingAgent.hasOverlayPermission()) {
  FloatingAgent.requestOverlayPermission(); // opens ACTION_MANAGE_OVERLAY_PERMISSION for com.maindy.app
} else {
  await FloatingAgent.show({ sizeDp: 64 }); // rejects ERR_OVERLAY_PERMISSION / ERR_FLOATING_AGENT_START
}
FloatingAgent.addListener('onFloatingAgentLongPress', () => startRecording());
FloatingAgent.addListener('onFloatingAgentLongPressEnd', () => stopRecording());
FloatingAgent.addListener('onFloatingAgentMoved', ({ x, y }) => {});      // dp, after snap
FloatingAgent.addListener('onFloatingAgentDismissed', ({ reason }) => {}); // user|notification|app|...
FloatingAgent.setListening(true);  // optional: strong glow while the app is listening
FloatingAgent.hide();
```

How it works (`android/.../floating/`):

- `FloatingAgentService` is a **foreground service** of type `specialUse`, which Android 14+ requires. It declares a `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` justification. It posts a low-importance persistent notification ("MAINDY está flutuando") with a **"Remover"** action. It returns `START_NOT_STICKY`, so it never restarts by itself.
- The orb is a `View` added through `WindowManager` with `TYPE_APPLICATION_OVERLAY` and `FLAG_NOT_FOCUSABLE`. It re-checks `Settings.canDrawOverlays()` on every start and stops if the permission was revoked.
- Touch handling is native:
  - **Tap**: haptic feedback, the `onFloatingAgentPress` event, and the app opens `maindy://assistant`.
  - **Long-press**: `performHapticFeedback(LONG_PRESS)`, the listening glow, the `onFloatingAgentLongPress` event, and the app opens `maindy://assistant?voice=1`. Releasing the finger sends `onFloatingAgentLongPressEnd` (push-to-talk semantics).
  - **Drag**: shows a bottom "×" dismiss target. Dropping the orb on it removes the orb (`reason: 'user'`). Dropping it anywhere else animates it to the nearest horizontal screen edge and sends `onFloatingAgentMoved`. The last position and size are remembered.
- The deep links are opened **natively**, so they work even when the JS runtime is not running. JS events are informational. **Do not open the same URL again from JS.** Deep-link intents are restricted to our own package (`setPackage`). Background activity starts are allowed because the app holds `SYSTEM_ALERT_WINDOW` and has a visible overlay window. This is Android's documented exemption, not a bypass.
- Rendering (`FloatingOrbView`):
  - A breathing `ValueAnimator` (scale and glow) runs continuously, with a pressed state and a listening state.
  - If the app has drawables named `orb_idle` / `orb_listening` (looked up by name at runtime), they are drawn. Otherwise the module draws a fallback orb with Canvas gradients in the brand colors: navy `#05082B`, purple `#7600FF`, magenta `#D000E8` and yellow `#FFC400`.
  - To use the real PNGs, a config plugin must copy `apps/mobile/assets/assistant/orb-idle.png` to `android/app/src/main/res/drawable-nodpi/orb_idle.png`, and `orb-listening.png` to `orb_listening.png`. Android resource names cannot contain `-`.

### 2.2 Notification listener (`Notifications`)

```ts
if (!Notifications.hasListenerAccess()) Notifications.openListenerSettings();
Notifications.setFilterRules({ focusMode: 'work', allowPackages: ['com.whatsapp'], muteContents: true });
Notifications.addListener('onNotificationPosted', (n) => {
  // n: { packageName, category, priority, importance, postedAt, isOngoing, dismissedByFocus, focusMode, title?, text? }
});
```

- `MaindyNotificationListenerService` is protected by `BIND_NOTIFICATION_LISTENER_SERVICE`. The system binds it **only after the user enables Notification access** for MAINDY. Nothing runs before that.
- **Privacy:** `title` and `text` are included **only when `muteContents === false`**. The default is `true`, and the rules default to `off / [] / true`. Rules are persisted natively in SharedPreferences, so they survive restarts.
- **Filtering:** when `focusMode !== 'off'` and the package is not in `allowPackages`, the service calls `cancelNotification(key)`. It never cancels calls, alarms, system notifications, ongoing or non-clearable notifications, foreground-service notifications, or notifications from system packages. Its own notifications are ignored.
- **Limitation:** `cancelNotification` **only removes the notification from the shade**. The sound, vibration or heads-up may already have played, and the other app is not otherwise affected. This is Android-only and works only after the user grants access.
  - Android 15+ may redact sensitive content, such as OTPs, for listeners.
  - On Android 13+, sideloaded builds may need "Allow restricted settings" (App info ⋮) before the user can enable notification access.
- Events are emitted only while the JS runtime is alive. Nothing is queued.

### 2.3 Usage stats (`Usage`)

```ts
if (!Usage.hasUsageAccess()) Usage.openUsageAccessSettings();
const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
const rows = await Usage.getUsageSummary(todayStart.getTime()); // [{ packageName, totalTimeForegroundMs, lastTimeUsed }]
```

- The access check uses `AppOpsManager` (`OPSTR_GET_USAGE_STATS`, through `unsafeCheckOpNoThrow` on API 29+).
- `PACKAGE_USAGE_STATS` is declared with `tools:ignore="ProtectedPermissions"`. It only works after the user enables Usage access.
- Totals come from `queryAndAggregateUsageStats`. Android aggregates usage into buckets (daily, weekly, …), so a total can include some time from the bucket that straddles `sinceMs`.

### 2.4 Android permissions (merged from the module manifest)

| Permission | Why | How it is granted |
|---|---|---|
| `SYSTEM_ALERT_WINDOW` | floating orb | The user enables it in Settings ("Display over other apps") |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE` | the service that owns the overlay | Install time. **Play Console requires a declaration and justification for `specialUse`** |
| `POST_NOTIFICATIONS` | makes the persistent notification and its "Remover" action visible (Android 13+) | Runtime. Request it, for example with `expo-notifications`, **before** `FloatingAgent.show()` |
| `BIND_NOTIFICATION_LISTENER_SERVICE` (service permission) | notification listener | The user enables Notification access in Settings |
| `PACKAGE_USAGE_STATS` | usage summary | The user enables Usage access in Settings |

## 3. iOS

### 3.1 Module APIs

```ts
Widgets.setSnapshot({
  greeting: 'Bom dia, Ana!',
  nextReminder: { title: 'Dentista', dueAt: new Date(...).toISOString() }, // or null
  focusMode: 'work',
  pendingTasks: 3,
  updatedAt: new Date().toISOString(),
}); // throws ERR_MAINDY_WIDGET if the App Group entitlement is missing or the JSON is invalid

await LiveActivity.startFocus({ mode: 'study', endsAt: Date.now() + 25 * 60_000 }); // { supported: true, activityId }
await LiveActivity.end();
```

- `Widgets.setSnapshot` validates the JSON with `Codable`. It then writes the JSON string to `UserDefaults(suiteName: "group.com.maindy.app")` under the key `maindy.widget.snapshot` and calls `WidgetCenter.shared.reloadAllTimelines()`. It refuses to "succeed" when the App Group container is not available.
- `LiveActivity` uses ActivityKit and needs iOS 16.2+ for `Activity.request(attributes:content:pushType:)`.
  - Starting a new session ends any running one. There is no push token, so updates are local.
  - The `MaindyFocusAttributes` struct is **duplicated**, with the same name and the same Codable shape, in `modules/maindy-native/ios/MaindyNativeCore.swift` and in `targets/widget/MaindyFocusLiveActivity.swift`. ActivityKit matches them that way, so keep both copies in sync.
- `FloatingAgent`, `Notifications` and `Usage` return unsupported on iOS (see §1).

### 3.2 Widget extension (`targets/widget`, `@bacons/apple-targets` v5)

| File | What |
|---|---|
| `expo-target.config.js` | `type: 'widget'`, product `MaindyWidget`, bundle id `com.maindy.app.widget`, deployment target **iOS 17.0**, App Group `group.com.maindy.app`, colors `$widgetBackground` and `$accent` |
| `MaindyWidgetBundle.swift` | `@main` bundle: home widget, 2 Lock Screen widgets, Live Activity, and the Control (`if #available(iOS 18)`) |
| `MaindyHomeWidget.swift` | **MAINDY** widget (`systemSmall`, `systemMedium`): navy background, purple glow, an orb drawn in SwiftUI, the next reminder (relative time) and the pending task count. A tap opens `maindy://assistant`. The medium size has a "Falar" link to `maindy://assistant?voice=1`. Also `accessoryCircular` (orb/voice button opening `maindy://assistant?voice=1`) and `accessoryRectangular` (next reminder) |
| `MaindyFocusLiveActivity.swift` | Focus Live Activity: Lock Screen banner plus Dynamic Island (compact, minimal and expanded), with a countdown timer |
| `MaindyTalkControl.swift` | iOS 18 `ControlWidgetButton` that runs `TalkToMaindyIntent` |
| `MaindySnapshot.swift`, `MaindyOrbView.swift` | snapshot model and loader (App Group), brand colors, orb and background views |
| `_shared/MaindyAppIntents.swift` | **Compiled into both the app and the widget** (the `_shared` convention). Contains `TalkToMaindyIntent`, `SaveMemoryIntent` and `MaindyAppShortcuts` (pt-BR phrases such as "Falar com a \(.applicationName)") |

No image assets are required. Everything is drawn in SwiftUI.

### 3.3 App Intents → JS hand-off (needs app code)

`openAppWhenRun` brings MAINDY to the foreground, but `perform()` can run in the app process or in the widget extension process, and extensions cannot call `UIApplication.open`. The hand-off works like this:

1. The intent stores the deep link (`maindy://assistant?voice=1` or `maindy://capture?text=<percent-encoded>`) in the App Group.
2. It posts a Darwin notification.
3. The Expo module delivers the link to JS. Links older than 2 minutes are dropped.

The app must route these links. Add something like this once, in the root layout:

```tsx
import { useEffect } from 'react';
import { router } from 'expo-router';
import { AppIntents } from '<path>/modules/maindy-native';

function routeIntentUrl(url: string) {
  // maindy://assistant?voice=1 -> /assistant?voice=1 ; maindy://capture?text=... -> /capture?text=...
  router.push(url.replace(/^maindy:\/\//, '/') as never);
}

useEffect(() => {
  const pending = AppIntents.consumePendingUrl();  // cold start
  if (pending) routeIntentUrl(pending);
  const sub = AppIntents.addListener('onIntentUrl', ({ url }) => routeIntentUrl(url)); // warm start
  return () => sub.remove();
}, []);
```

Widget and Lock Screen taps do **not** use this path. They use `widgetURL` / `Link`, which open the `maindy://` URL directly through normal deep linking.

## 4. Configuration the app needs

> **Status (applied):** `@bacons/apple-targets` is in `apps/mobile/package.json`, `app.config.ts` has the plugin, `NSSupportsLiveActivities` and `appleTeamId` (read from the `APPLE_TEAM_ID` env var). `plugins/withOrbDrawables.js` copies the orb PNGs to `drawable-nodpi/orb_idle.png` / `orb_listening.png`. The app wires the APIs in `app/_layout.tsx` (App Intents routing), `app/(tabs)/index.tsx` (widget snapshot), `src/components/FloatingOrbSetting.tsx` (Android orb toggle) and `app/focus.tsx` (Android notification filter + iOS Live Activity). `expo prebuild --clean` was verified: the widget target is added to the Xcode project and the module is autolinked on both platforms.

**Dependency:** add `"@bacons/apple-targets": "^5.0.0"` to `apps/mobile/package.json`. That is the only one: the local module uses `expo` / `expo-modules-core`, which are already present, and is autolinked from `apps/mobile/modules`.

**`app.config.ts`:**

```ts
ios: {
  appleTeamId: 'XXXXXXXXXX',                 // needed to sign the widget target
  infoPlist: { /* existing keys */ NSSupportsLiveActivities: true },
  entitlements: { 'com.apple.security.application-groups': ['group.com.maindy.app'] }, // already present
},
android: {
  // already present: SYSTEM_ALERT_WINDOW, FOREGROUND_SERVICE, FOREGROUND_SERVICE_SPECIAL_USE, POST_NOTIFICATIONS
  // PACKAGE_USAGE_STATS and the services come from the module manifest. Do not add PACKAGE_USAGE_STATS here
  // (it would be added without tools:ignore).
},
plugins: [
  // ...existing
  '@bacons/apple-targets',
  // later: your own plugin copying orb PNGs to android res as orb_idle / orb_listening
],
```

In the Apple Developer portal, the App Group `group.com.maindy.app` must be enabled for **both** `com.maindy.app` and `com.maindy.app.widget`. EAS credentials can do this.

## 5. Build

```sh
cd apps/mobile
npx expo prebuild --clean        # generates ios/ (with the MaindyWidget target) and android/
npx expo run:android             # needs a device/emulator; then grant overlay / notification / usage access in Settings
npx expo run:ios                 # dev build on a device (Live Activities and widgets also work in the simulator)
```

Expo Go cannot load this module. All APIs then report `supported: false` with a "not linked" reason.

## 6. What was verified, and what was not

Verified on 2026-11-12, without full Gradle or Xcode builds:

- **Android Kotlin:** every module source was compiled with `kotlinc` 2.3.10 (bundled with Android Studio, using its JBR) against `android-36/android.jar` and `androidx.core:core:1.17.0`. The Expo Kotlin DSL was replaced by **stubs that copy the exact signatures** from `expo-modules-core@58.1.0` (`Module`, `ModuleDefinitionBuilder.Function/AsyncFunction/Events/OnCreate/OnDestroy`, `CodedException`, `Exceptions.ReactContextLost`). Result: 0 errors.
- **Android resources and manifest:** `aapt2 compile` and `aapt2 link` (build-tools 37, android-36, minSdk 24) succeeded. This covers the `<property>` FGS subtype, the vector drawable and the strings.
- **iOS widget + intents:** `xcrun --sdk iphoneos swiftc -typecheck -parse-as-library` on all files in `targets/widget` plus `_shared` succeeded with 0 errors and 0 warnings. It was run with Xcode 27.2 for `arm64-apple-ios17.0`, `ios18.0` and `ios26.0`, in Swift 5 and Swift 6 language modes. `_shared/MaindyAppIntents.swift` was also type-checked alone at `ios16.4`, the main app's deployment target.
- **iOS module:** `MaindyNativeCore.swift` (pure Swift) and `MaindyNativeModule.swift` type-check at `ios16.4` in Swift 5 and 6 modes. The second file was checked against a **stub ExpoModulesCore** that copies the 58.1.0 DSL signatures.
- **TypeScript:** `tsc --noEmit` on the whole `apps/mobile` project (strict) returned 0 errors, with the module files included.
- `expo-target.config.js` was evaluated with Node.

**Update (later the same day, after integration):** a real `./gradlew :app:assembleDebug` (arm64-v8a) **succeeded**, so the Android module now compiles against the real `expo-modules-core`. The APK ran on an Android 37 emulator. There, the floating orb started its foreground service (type `specialUse`, with an ongoing "Remover" notification), drew over the launcher using the brand PNG `orb_idle`, and opened `maindy://assistant` when tapped. iOS is still unbuilt.

**Not verified:**

- No Gradle build, no `pod install` and no `xcodebuild` were run (disk constraints). Real linking against `expo-modules-core` and React Native was never exercised.
- The Expo stubs could hide a mismatch in argument conversion, such as nullable `Double` arguments or `List<String>` arguments.
- Nothing has run on a device yet: overlay touch, snapping and haptics, the notification listener, usage stats, widgets rendering, Live Activity, Siri phrases and the Control.
- **Known risks and gaps:**
  - **`AppShortcutsProvider` is compiled into the widget extension as well as the app**, because `_shared` links to both. Apple only reads App Shortcuts from the app or an App Intents extension. If Xcode or Siri complains, move the `MaindyAppShortcuts` struct to a file that only the main target includes.
  - **Siri phrases are written in Portuguese, but the Xcode project's development region is `en`.** Test them with a device set to pt-BR. If they are not recognized, add an `AppShortcuts.xcstrings` file with a pt-BR localization to the main target, or change the development region.
  - **`openAppWhenRun` is deprecated in newer SDKs** in favour of `supportedModes`. There is no warning yet with the Xcode 27.2 SDK, and it is still needed for iOS 17 and 18.
  - **The orb's breathing animation redraws continuously while the orb is visible**, which costs a little battery. It could be paused when the screen is off.
  - **`FloatingAgent.show()` resolves once the service start is requested**, so `isShowing()` can lag by a moment.
  - **There is no Android home-screen widget and no Android equivalent of Live Activities.**
  - **Store policies:**
    - **Google Play:** `specialUse` FGS declaration, prominent disclosure for notification access and usage access.
    - **Apple:** FamilyControls entitlement if app blocking is ever wanted.

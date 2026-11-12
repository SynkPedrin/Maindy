// Pure Swift (no ExpoModulesCore) so it can be type-checked on its own with
// `xcrun --sdk iphoneos swiftc -typecheck`.
//
// IMPORTANT: the constants and the `MaindyFocusAttributes` shape below are duplicated in
// apps/mobile/targets/widget/ (widget extension) and targets/widget/_shared/ (App Intents).
// ActivityKit matches attributes by type name + Codable shape, and the App Group keys must match,
// so keep all copies identical.

import Foundation
import WidgetKit
#if canImport(ActivityKit)
import ActivityKit
#endif

enum MaindyShared {
  static let appGroup = "group.com.maindy.app"
  static let widgetSnapshotKey = "maindy.widget.snapshot"
  static let pendingIntentURLKey = "maindy.intent.pendingURL"
  static let pendingIntentURLDateKey = "maindy.intent.pendingURLAt"
  /// Darwin (cross-process) notification posted by the App Intents after storing a pending URL.
  static let pendingIntentURLNotification = "com.maindy.app.intent.pendingURL"
}

enum MaindyCoreError: Error, CustomStringConvertible {
  case appGroupUnavailable
  case invalidSnapshot(String)
  case invalidDate
  case liveActivitiesDisabled
  case liveActivitiesUnsupported

  var description: String {
    switch self {
    case .appGroupUnavailable:
      return "App Group '\(MaindyShared.appGroup)' is not available. Add it to ios.entitlements['com.apple.security.application-groups'] and to the widget target, then rebuild."
    case .invalidSnapshot(let reason):
      return "Invalid widget snapshot: \(reason)"
    case .invalidDate:
      return "endsAt must be a valid date in the future."
    case .liveActivitiesDisabled:
      return "Live Activities are disabled for MAINDY (Settings > MAINDY > Live Activities) or NSSupportsLiveActivities is missing from Info.plist."
    case .liveActivitiesUnsupported:
      return "Live Activities require iOS 16.2 or later."
    }
  }
}

// MARK: - Widget snapshot

struct MaindyWidgetSnapshot: Codable {
  struct Reminder: Codable {
    var title: String
    var dueAt: String
  }

  var greeting: String?
  var nextReminder: Reminder?
  var focusMode: String?
  var pendingTasks: Int?
  var updatedAt: String
}

enum MaindyWidgetStore {
  static func isAppGroupAvailable() -> Bool {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: MaindyShared.appGroup) != nil
  }

  /// Validates and writes the snapshot JSON to the App Group, then asks WidgetKit to reload.
  static func write(json: String) throws {
    guard isAppGroupAvailable(), let defaults = UserDefaults(suiteName: MaindyShared.appGroup) else {
      throw MaindyCoreError.appGroupUnavailable
    }
    guard let data = json.data(using: .utf8) else {
      throw MaindyCoreError.invalidSnapshot("not UTF-8")
    }
    let snapshot: MaindyWidgetSnapshot
    do {
      snapshot = try JSONDecoder().decode(MaindyWidgetSnapshot.self, from: data)
    } catch {
      throw MaindyCoreError.invalidSnapshot(String(describing: error))
    }
    if snapshot.updatedAt.isEmpty {
      throw MaindyCoreError.invalidSnapshot("updatedAt is required")
    }
    defaults.set(json, forKey: MaindyShared.widgetSnapshotKey)
    WidgetCenter.shared.reloadAllTimelines()
  }

  static func clear() {
    UserDefaults(suiteName: MaindyShared.appGroup)?.removeObject(forKey: MaindyShared.widgetSnapshotKey)
    WidgetCenter.shared.reloadAllTimelines()
  }

  static func reload() {
    WidgetCenter.shared.reloadAllTimelines()
  }
}

// MARK: - App Intents -> JS hand-off

enum MaindyPendingIntentURL {
  /// Returns (and clears) the URL stored by an App Intent, if it is recent enough.
  static func consume(maxAge: TimeInterval = 120) -> String? {
    guard let defaults = UserDefaults(suiteName: MaindyShared.appGroup) else { return nil }
    let url = defaults.string(forKey: MaindyShared.pendingIntentURLKey)
    let storedAt = defaults.double(forKey: MaindyShared.pendingIntentURLDateKey)
    defaults.removeObject(forKey: MaindyShared.pendingIntentURLKey)
    defaults.removeObject(forKey: MaindyShared.pendingIntentURLDateKey)
    guard let url, Date().timeIntervalSince1970 - storedAt <= maxAge else { return nil }
    return url
  }
}

/// Observes the Darwin notification posted by the intents (which may run in the widget extension
/// process) and calls `handler` on the main queue.
final class MaindyIntentURLObserver: @unchecked Sendable {
  static let shared = MaindyIntentURLObserver()

  var handler: (() -> Void)?
  private var isObserving = false

  func start() {
    guard !isObserving else { return }
    isObserving = true
    let center = CFNotificationCenterGetDarwinNotifyCenter()
    let observer = Unmanaged.passUnretained(self).toOpaque()
    CFNotificationCenterAddObserver(
      center,
      observer,
      { _, observer, _, _, _ in
        guard let observer else { return }
        let me = Unmanaged<MaindyIntentURLObserver>.fromOpaque(observer).takeUnretainedValue()
        DispatchQueue.main.async { me.handler?() }
      },
      MaindyShared.pendingIntentURLNotification as CFString,
      nil,
      .deliverImmediately
    )
  }

  func stop() {
    guard isObserving else { return }
    isObserving = false
    CFNotificationCenterRemoveObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque(),
      CFNotificationName(MaindyShared.pendingIntentURLNotification as CFString),
      nil
    )
  }
}

// MARK: - Live Activity (focus session)

#if canImport(ActivityKit)
struct MaindyFocusAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var mode: String
    var endsAt: Date
  }

  var startedAt: Date
}

@available(iOS 16.2, *)
enum MaindyFocusActivities {
  static func areEnabled() -> Bool {
    ActivityAuthorizationInfo().areActivitiesEnabled
  }

  /// Starts (replacing any running one) a focus Live Activity. Returns the activity id.
  static func start(mode: String, endsAt: Date) async throws -> String {
    guard endsAt > Date() else { throw MaindyCoreError.invalidDate }
    guard areEnabled() else { throw MaindyCoreError.liveActivitiesDisabled }
    for activity in Activity<MaindyFocusAttributes>.activities {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
    let attributes = MaindyFocusAttributes(startedAt: Date())
    let state = MaindyFocusAttributes.ContentState(mode: mode, endsAt: endsAt)
    let activity = try Activity.request(
      attributes: attributes,
      content: ActivityContent(state: state, staleDate: endsAt),
      pushType: nil
    )
    return activity.id
  }

  /// Ends every running focus Live Activity. Returns how many were ended.
  static func endAll() async -> Int {
    let running = Activity<MaindyFocusAttributes>.activities
    for activity in running {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
    return running.count
  }
}
#endif

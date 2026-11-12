import ExpoModulesCore
import Foundation

/**
 iOS side of the MAINDY native module.

 What iOS does NOT get (by platform design, not by omission):
 - no global floating overlay over other apps (the JS layer returns `unsupported`);
 - no reading/intercepting other apps' notifications;
 - no app usage stats / app blocking without Apple's FamilyControls entitlement.
 */
public class MaindyNativeModule: Module {
  private var hasIntentUrlListeners = false

  public func definition() -> ModuleDefinition {
    Name("MaindyNative")

    Events("onIntentUrl")

    OnCreate { [weak self] in
      MaindyIntentURLObserver.shared.handler = { [weak self] in
        self?.deliverPendingIntentUrl()
      }
      MaindyIntentURLObserver.shared.start()
    }

    OnDestroy {
      MaindyIntentURLObserver.shared.stop()
      MaindyIntentURLObserver.shared.handler = nil
    }

    OnStartObserving("onIntentUrl") {
      self.hasIntentUrlListeners = true
      self.deliverPendingIntentUrl()
    }

    OnStopObserving("onIntentUrl") {
      self.hasIntentUrlListeners = false
    }

    OnAppBecomesActive {
      self.deliverPendingIntentUrl()
    }

    // MARK: Widgets

    Function("widgetsIsAppGroupAvailable") { () -> Bool in
      MaindyWidgetStore.isAppGroupAvailable()
    }

    Function("widgetsSetSnapshot") { (json: String) throws in
      do {
        try MaindyWidgetStore.write(json: json)
      } catch let error as MaindyCoreError {
        throw Exception(name: "MaindyWidgetError", description: error.description, code: "ERR_MAINDY_WIDGET")
      }
    }

    Function("widgetsClearSnapshot") {
      MaindyWidgetStore.clear()
    }

    Function("widgetsReload") {
      MaindyWidgetStore.reload()
    }

    // MARK: Live Activity

    Function("liveActivityAreEnabled") { () -> Bool in
      if #available(iOS 16.2, *) {
        return MaindyFocusActivities.areEnabled()
      }
      return false
    }

    AsyncFunction("liveActivityStartFocus") { (mode: String, endsAtMs: Double) async throws -> String in
      guard #available(iOS 16.2, *) else {
        throw Exception(name: "MaindyLiveActivityError", description: MaindyCoreError.liveActivitiesUnsupported.description, code: "ERR_MAINDY_LIVE_ACTIVITY")
      }
      do {
        return try await MaindyFocusActivities.start(mode: mode, endsAt: Date(timeIntervalSince1970: endsAtMs / 1000))
      } catch let error as MaindyCoreError {
        throw Exception(name: "MaindyLiveActivityError", description: error.description, code: "ERR_MAINDY_LIVE_ACTIVITY")
      }
    }

    AsyncFunction("liveActivityEnd") { () async -> Int in
      if #available(iOS 16.2, *) {
        return await MaindyFocusActivities.endAll()
      }
      return 0
    }

    // MARK: App Intents hand-off

    Function("intentsConsumePendingUrl") { () -> String? in
      MaindyPendingIntentURL.consume()
    }
  }

  /// Emits the pending intent URL to JS, but only when JS is listening (otherwise it stays stored
  /// until `intentsConsumePendingUrl()` is called on startup).
  private func deliverPendingIntentUrl() {
    guard hasIntentUrlListeners, let url = MaindyPendingIntentURL.consume() else { return }
    sendEvent("onIntentUrl", ["url": url])
  }
}

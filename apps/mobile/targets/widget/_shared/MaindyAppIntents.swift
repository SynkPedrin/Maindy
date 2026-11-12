// Compiled into BOTH the main app target and the widget extension (via @bacons/apple-targets'
// `_shared` folder). Keep it free of Expo/React Native imports.
//
// How the deep link reaches the app: an intent with `openAppWhenRun` brings MAINDY to the
// foreground, but `perform()` may run in either process (app or widget extension), and
// UIApplication.open is not available to extensions. So the intent stores the URL in the shared
// App Group and posts a Darwin notification; the MaindyNative Expo module hands it to JS via the
// `onIntentUrl` event / `AppIntents.consumePendingUrl()`, and JS routes it with expo-router.
//
// The constants below MUST match modules/maindy-native/ios/MaindyNativeCore.swift.

import AppIntents
import Foundation

enum MaindyIntentShared {
  static let appGroup = "group.com.maindy.app"
  static let pendingIntentURLKey = "maindy.intent.pendingURL"
  static let pendingIntentURLDateKey = "maindy.intent.pendingURLAt"
  static let pendingIntentURLNotification = "com.maindy.app.intent.pendingURL"

  static let assistantURL = "maindy://assistant"
  static let assistantVoiceURL = "maindy://assistant?voice=1"

  static func captureURL(text: String) -> String {
    var allowed = CharacterSet.alphanumerics
    allowed.insert(charactersIn: "-._~")
    let encoded = text.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
    return "maindy://capture?text=\(encoded)"
  }

  enum HandOffError: Error, CustomLocalizedStringResourceConvertible {
    case appGroupUnavailable

    var localizedStringResource: LocalizedStringResource {
      "Não foi possível abrir a MAINDY. Abra o app e tente de novo."
    }
  }

  /// Stores the URL for the app to pick up and notifies it (cross-process).
  static func handOff(_ url: String) throws {
    guard let defaults = UserDefaults(suiteName: appGroup) else {
      throw HandOffError.appGroupUnavailable
    }
    defaults.set(url, forKey: pendingIntentURLKey)
    defaults.set(Date().timeIntervalSince1970, forKey: pendingIntentURLDateKey)
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(pendingIntentURLNotification as CFString),
      nil,
      nil,
      true
    )
  }
}

struct TalkToMaindyIntent: AppIntent {
  static let title: LocalizedStringResource = "Falar com a MAINDY"
  static let description = IntentDescription("Abre a MAINDY pronta para ouvir você.")
  static let openAppWhenRun: Bool = true

  init() {}

  func perform() async throws -> some IntentResult {
    try MaindyIntentShared.handOff(MaindyIntentShared.assistantVoiceURL)
    return .result()
  }
}

struct SaveMemoryIntent: AppIntent {
  static let title: LocalizedStringResource = "Salvar memória na MAINDY"
  static let description = IntentDescription("Envia um texto para a MAINDY guardar como memória.")
  static let openAppWhenRun: Bool = true

  @Parameter(title: "Texto", requestValueDialog: "O que você quer que a MAINDY lembre?")
  var text: String

  static var parameterSummary: some ParameterSummary {
    Summary("Salvar \(\.$text) na MAINDY")
  }

  init() {}

  func perform() async throws -> some IntentResult {
    try MaindyIntentShared.handOff(MaindyIntentShared.captureURL(text: text))
    return .result()
  }
}

struct MaindyAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: TalkToMaindyIntent(),
      phrases: [
        "Falar com a \(.applicationName)",
        "Conversar com a \(.applicationName)",
        "Chamar a \(.applicationName)",
      ],
      shortTitle: "Falar com a MAINDY",
      systemImageName: "waveform.circle.fill"
    )
    AppShortcut(
      intent: SaveMemoryIntent(),
      phrases: [
        "Salvar memória na \(.applicationName)",
        "Guardar uma memória na \(.applicationName)",
      ],
      shortTitle: "Salvar memória",
      systemImageName: "brain.head.profile"
    )
  }

  static var shortcutTileColor: ShortcutTileColor { .purple }
}

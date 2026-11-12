import AppIntents
import SwiftUI
import WidgetKit

/// Control Center / Lock Screen / Action button control (iOS 18+) that runs TalkToMaindyIntent.
/// TalkToMaindyIntent lives in _shared/ so it is compiled into both the app and this extension,
/// which is required for `openAppWhenRun` intents launched from a control.
@available(iOS 18.0, *)
struct MaindyTalkControl: ControlWidget {
  static let kind = "com.maindy.app.control.talk"

  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: Self.kind) {
      ControlWidgetButton(action: TalkToMaindyIntent()) {
        Label("Falar com a MAINDY", systemImage: "waveform.circle.fill")
      }
    }
    .displayName("Falar com a MAINDY")
    .description("Abre a MAINDY pronta para ouvir.")
  }
}

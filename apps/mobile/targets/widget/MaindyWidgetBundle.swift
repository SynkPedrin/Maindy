import SwiftUI
import WidgetKit

@main
struct MaindyWidgetBundle: WidgetBundle {
  var body: some Widget {
    MaindyHomeWidget()
    MaindyVoiceAccessoryWidget()
    MaindyReminderAccessoryWidget()
    MaindyFocusLiveActivity()
    if #available(iOS 18.0, *) {
      MaindyTalkControl()
    }
  }
}

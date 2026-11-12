import Foundation
import SwiftUI

// Must match modules/maindy-native/ios/MaindyNativeCore.swift (App Group + key + JSON shape).
enum MaindyWidgetShared {
  static let appGroup = "group.com.maindy.app"
  static let snapshotKey = "maindy.widget.snapshot"
}

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

  static func load() -> MaindyWidgetSnapshot? {
    guard
      let defaults = UserDefaults(suiteName: MaindyWidgetShared.appGroup),
      let json = defaults.string(forKey: MaindyWidgetShared.snapshotKey),
      let data = json.data(using: .utf8)
    else { return nil }
    return try? JSONDecoder().decode(MaindyWidgetSnapshot.self, from: data)
  }

  var reminderDate: Date? {
    guard let dueAt = nextReminder?.dueAt else { return nil }
    return MaindyDates.parse(dueAt)
  }

  var focusLabel: String? {
    guard let mode = focusMode, mode != "off" else { return nil }
    return MaindyFocusLabels.label(for: mode)
  }
}

enum MaindyDates {
  /// Parses ISO-8601 with or without fractional seconds (JS `toISOString()` has milliseconds).
  static func parse(_ value: String) -> Date? {
    let withFraction = ISO8601DateFormatter()
    withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = withFraction.date(from: value) { return date }
    let plain = ISO8601DateFormatter()
    plain.formatOptions = [.withInternetDateTime]
    return plain.date(from: value)
  }
}

enum MaindyFocusLabels {
  static func label(for mode: String) -> String {
    switch mode {
    case "work": return "Trabalho"
    case "study": return "Estudo"
    case "rest": return "Descanso"
    case "sleep": return "Sono"
    case "driving": return "Direção"
    default: return mode.capitalized
    }
  }
}

enum MaindyLinks {
  static let assistant = URL(string: "maindy://assistant")!
  static let assistantVoice = URL(string: "maindy://assistant?voice=1")!
}

enum MaindyColors {
  static let navy = Color(red: 5 / 255, green: 8 / 255, blue: 43 / 255)       // #05082B
  static let purple = Color(red: 118 / 255, green: 0, blue: 1)               // #7600FF
  static let magenta = Color(red: 208 / 255, green: 0, blue: 232 / 255)      // #D000E8
  static let yellow = Color(red: 1, green: 196 / 255, blue: 0)               // #FFC400
}

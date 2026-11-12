import ActivityKit
import SwiftUI
import WidgetKit

// MUST stay identical (name + Codable shape) to the copy in
// modules/maindy-native/ios/MaindyNativeCore.swift, which starts/ends the activity.
struct MaindyFocusAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var mode: String
    var endsAt: Date
  }

  var startedAt: Date
}

struct MaindyFocusLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: MaindyFocusAttributes.self) { context in
      MaindyFocusLockScreenView(context: context)
        .activityBackgroundTint(MaindyColors.navy)
        .activitySystemActionForegroundColor(.white)
        .widgetURL(MaindyLinks.assistant)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          MaindyOrbView(size: 36, showsGlow: false)
        }
        DynamicIslandExpandedRegion(.trailing) {
          FocusTimerText(context: context)
            .font(.title3.monospacedDigit().weight(.semibold))
            .foregroundStyle(MaindyColors.yellow)
        }
        DynamicIslandExpandedRegion(.bottom) {
          Text("Foco: \(MaindyFocusLabels.label(for: context.state.mode))")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
        }
      } compactLeading: {
        MaindyOrbView(size: 18, showsGlow: false)
      } compactTrailing: {
        FocusTimerText(context: context)
          .monospacedDigit()
          .frame(maxWidth: 52)
          .foregroundStyle(MaindyColors.yellow)
      } minimal: {
        MaindyOrbView(size: 18, showsGlow: false)
      }
      .widgetURL(MaindyLinks.assistant)
      .keylineTint(MaindyColors.purple)
    }
  }
}

private struct FocusTimerText: View {
  let context: ActivityViewContext<MaindyFocusAttributes>

  var body: some View {
    // ClosedRange requires lower <= upper; guard against clock skew / past end dates.
    let start = min(context.attributes.startedAt, context.state.endsAt)
    Text(timerInterval: start...context.state.endsAt, countsDown: true)
      .multilineTextAlignment(.trailing)
  }
}

private struct MaindyFocusLockScreenView: View {
  let context: ActivityViewContext<MaindyFocusAttributes>

  var body: some View {
    HStack(spacing: 14) {
      MaindyOrbView(size: 44)
      VStack(alignment: .leading, spacing: 2) {
        Text("Modo foco")
          .font(.caption.weight(.semibold))
          .foregroundStyle(MaindyColors.yellow)
        Text(MaindyFocusLabels.label(for: context.state.mode))
          .font(.headline)
          .foregroundStyle(.white)
      }
      Spacer(minLength: 0)
      FocusTimerText(context: context)
        .font(.title2.monospacedDigit().weight(.bold))
        .foregroundStyle(.white)
    }
    .padding(16)
  }
}

import SwiftUI
import WidgetKit

// MARK: - Timeline

struct MaindyEntry: TimelineEntry {
  let date: Date
  let snapshot: MaindyWidgetSnapshot?
}

struct MaindyProvider: TimelineProvider {
  func placeholder(in context: Context) -> MaindyEntry {
    MaindyEntry(date: Date(), snapshot: .preview)
  }

  func getSnapshot(in context: Context, completion: @escaping (MaindyEntry) -> Void) {
    let stored = MaindyWidgetSnapshot.load()
    completion(MaindyEntry(date: Date(), snapshot: stored ?? (context.isPreview ? .preview : nil)))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<MaindyEntry>) -> Void) {
    let now = Date()
    let snapshot = MaindyWidgetSnapshot.load()
    var refresh = now.addingTimeInterval(30 * 60)
    // Refresh right after the next reminder is due so it doesn't linger.
    if let due = snapshot?.reminderDate, due > now, due < refresh {
      refresh = due.addingTimeInterval(60)
    }
    completion(Timeline(entries: [MaindyEntry(date: now, snapshot: snapshot)], policy: .after(refresh)))
  }
}

extension MaindyWidgetSnapshot {
  static let preview = MaindyWidgetSnapshot(
    greeting: "Bom dia!",
    nextReminder: .init(title: "Reunião com o time", dueAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(3600))),
    focusMode: "work",
    pendingTasks: 3,
    updatedAt: ISO8601DateFormatter().string(from: Date())
  )
}

// MARK: - Home screen widget (small + medium)

struct MaindyHomeWidget: Widget {
  let kind = "MaindyHomeWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: MaindyProvider()) { entry in
      MaindyHomeWidgetView(entry: entry)
        .containerBackground(for: .widget) { MaindyWidgetBackground() }
        .widgetURL(MaindyLinks.assistant)
    }
    .configurationDisplayName("MAINDY")
    .description("Seu próximo lembrete e tarefas pendentes. Toque para falar com a MAINDY.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

struct MaindyHomeWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: MaindyEntry

  var body: some View {
    switch family {
    case .systemMedium:
      medium
    default:
      small
    }
  }

  private var small: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .center) {
        MaindyOrbView(size: 34)
        Spacer(minLength: 0)
        TasksBadge(count: entry.snapshot?.pendingTasks)
      }
      Spacer(minLength: 0)
      ReminderBlock(snapshot: entry.snapshot, lineLimit: 2)
    }
    .foregroundStyle(.white)
  }

  private var medium: some View {
    HStack(spacing: 14) {
      VStack(spacing: 8) {
        MaindyOrbView(size: 64)
        Link(destination: MaindyLinks.assistantVoice) {
          Label("Falar", systemImage: "waveform")
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Capsule().fill(MaindyColors.purple))
        }
      }
      VStack(alignment: .leading, spacing: 6) {
        Text(entry.snapshot?.greeting ?? "Olá! Eu sou a MAINDY.")
          .font(.headline)
          .lineLimit(1)
        ReminderBlock(snapshot: entry.snapshot, lineLimit: 1)
        HStack(spacing: 8) {
          TasksBadge(count: entry.snapshot?.pendingTasks)
          if let focus = entry.snapshot?.focusLabel {
            Label(focus, systemImage: "moon.fill")
              .font(.caption2.weight(.semibold))
              .foregroundStyle(MaindyColors.yellow)
              .lineLimit(1)
          }
        }
      }
      Spacer(minLength: 0)
    }
    .foregroundStyle(.white)
  }
}

private struct ReminderBlock: View {
  let snapshot: MaindyWidgetSnapshot?
  let lineLimit: Int

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text("Próximo lembrete")
        .font(.caption2.weight(.semibold))
        .foregroundStyle(MaindyColors.yellow)
      if let reminder = snapshot?.nextReminder {
        Text(reminder.title)
          .font(.subheadline.weight(.semibold))
          .lineLimit(lineLimit)
        if let due = snapshot?.reminderDate {
          Text(due, style: .relative)
            .font(.caption2)
            .foregroundStyle(.white.opacity(0.7))
        }
      } else {
        Text(snapshot == nil ? "Abra a MAINDY para sincronizar" : "Nada por agora")
          .font(.caption)
          .foregroundStyle(.white.opacity(0.75))
          .lineLimit(2)
      }
    }
  }
}

private struct TasksBadge: View {
  let count: Int?

  var body: some View {
    if let count {
      Text(count == 1 ? "1 tarefa" : "\(count) tarefas")
        .font(.caption2.weight(.bold))
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(Capsule().fill(MaindyColors.magenta.opacity(0.85)))
        .foregroundStyle(.white)
    }
  }
}

// MARK: - Lock Screen: circular orb button (voice)

struct MaindyVoiceAccessoryWidget: Widget {
  let kind = "MaindyVoiceAccessoryWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: MaindyProvider()) { _ in
      ZStack {
        AccessoryWidgetBackground()
        Image(systemName: "waveform")
          .font(.system(size: 22, weight: .semibold))
          .widgetAccentable()
      }
      .containerBackground(for: .widget) { Color.clear }
      .widgetURL(MaindyLinks.assistantVoice)
      .accessibilityLabel("Falar com a MAINDY")
    }
    .configurationDisplayName("Falar com a MAINDY")
    .description("Toque para abrir a MAINDY pronta para ouvir.")
    .supportedFamilies([.accessoryCircular])
  }
}

// MARK: - Lock Screen: next reminder

struct MaindyReminderAccessoryWidget: Widget {
  let kind = "MaindyReminderAccessoryWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: MaindyProvider()) { entry in
      VStack(alignment: .leading, spacing: 1) {
        Label("MAINDY", systemImage: "sparkles")
          .font(.caption2.weight(.semibold))
          .widgetAccentable()
        if let reminder = entry.snapshot?.nextReminder {
          Text(reminder.title)
            .font(.headline)
            .lineLimit(1)
          if let due = entry.snapshot?.reminderDate {
            Text(due, style: .relative)
              .font(.caption)
          }
        } else {
          Text("Sem lembretes")
            .font(.headline)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .containerBackground(for: .widget) { Color.clear }
      .widgetURL(MaindyLinks.assistant)
    }
    .configurationDisplayName("Próximo lembrete")
    .description("Mostra o próximo lembrete da MAINDY.")
    .supportedFamilies([.accessoryRectangular])
  }
}

import SwiftUI

/// MAINDY's orb drawn entirely in SwiftUI (no image assets needed).
struct MaindyOrbView: View {
  var size: CGFloat
  var showsGlow: Bool = true

  var body: some View {
    ZStack {
      if showsGlow {
        Circle()
          .fill(
            RadialGradient(
              colors: [MaindyColors.purple.opacity(0.65), MaindyColors.purple.opacity(0)],
              center: .center,
              startRadius: size * 0.3,
              endRadius: size * 0.8
            )
          )
          .frame(width: size * 1.6, height: size * 1.6)
      }

      Circle()
        .fill(
          RadialGradient(
            colors: [MaindyColors.magenta, MaindyColors.purple, MaindyColors.navy],
            center: UnitPoint(x: 0.32, y: 0.28),
            startRadius: 0,
            endRadius: size * 0.8
          )
        )
        .frame(width: size, height: size)

      Circle()
        .strokeBorder(
          AngularGradient(
            colors: [MaindyColors.purple, MaindyColors.magenta, MaindyColors.yellow, MaindyColors.magenta, MaindyColors.purple],
            center: .center
          ),
          lineWidth: max(1, size * 0.06)
        )
        .frame(width: size, height: size)

      Circle()
        .fill(
          RadialGradient(
            colors: [Color.white.opacity(0.55), Color.white.opacity(0)],
            center: UnitPoint(x: 0.3, y: 0.26),
            startRadius: 0,
            endRadius: size * 0.32
          )
        )
        .frame(width: size, height: size)

      Circle()
        .fill(MaindyColors.yellow)
        .frame(width: size * 0.12, height: size * 0.12)
        .offset(x: size * 0.2, y: size * 0.18)
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }
}

/// Navy background with a soft purple glow, used as the widget container background.
struct MaindyWidgetBackground: View {
  var body: some View {
    ZStack {
      MaindyColors.navy
      RadialGradient(
        colors: [MaindyColors.purple.opacity(0.55), MaindyColors.purple.opacity(0)],
        center: UnitPoint(x: 0.15, y: 0.1),
        startRadius: 0,
        endRadius: 180
      )
      RadialGradient(
        colors: [MaindyColors.magenta.opacity(0.25), MaindyColors.magenta.opacity(0)],
        center: UnitPoint(x: 1, y: 1),
        startRadius: 0,
        endRadius: 140
      )
    }
  }
}

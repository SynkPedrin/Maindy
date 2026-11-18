//! Pure geometry used by the launchers. No AppKit / Win32 types here so it is unit-testable on any OS.
//!
//! macOS coordinates (notch): Cocoa global space — origin at the bottom-left of the primary screen,
//! y grows upwards, units are points. Windows coordinates (pill / tray panel): top-left origin, y grows
//! downwards, units are whatever the caller passes consistently (we use physical pixels).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Default)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Rect {
    pub const fn new(x: f64, y: f64, w: f64, h: f64) -> Self {
        Self { x, y, w, h }
    }
    pub fn max_x(&self) -> f64 {
        self.x + self.w
    }
    pub fn max_y(&self) -> f64 {
        self.y + self.h
    }
    pub fn mid_x(&self) -> f64 {
        self.x + self.w / 2.0
    }
    pub fn contains(&self, px: f64, py: f64) -> bool {
        px >= self.x && px <= self.max_x() && py >= self.y && py <= self.max_y()
    }
    pub fn inset(&self, d: f64) -> Rect {
        Rect::new(self.x + d, self.y + d, (self.w - 2.0 * d).max(0.0), (self.h - 2.0 * d).max(0.0))
    }
}

/* ------------------------------------------------------------------------------------------- */
/* macOS notch                                                                                  */
/* ------------------------------------------------------------------------------------------- */

/// What we read from an `NSScreen` (all in Cocoa points).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ScreenInfo {
    /// `NSScreen.frame` in global Cocoa coordinates.
    pub frame: Rect,
    /// `NSScreen.safeAreaInsets.top` (macOS 12+). > 0 only on displays with a camera housing.
    pub safe_top: f64,
    /// `NSScreen.auxiliaryTopLeftArea` — unobscured area left of the notch (None/zero when absent).
    pub aux_left: Option<Rect>,
    /// `NSScreen.auxiliaryTopRightArea` — unobscured area right of the notch.
    pub aux_right: Option<Rect>,
    /// `NSScreen.backingScaleFactor` (1.0, 2.0…). Used to snap frames to device pixels.
    pub scale: f64,
}

/// Real notch rectangle in global Cocoa coordinates, or `None` when the screen has no notch.
///
/// A notch exists iff `safeAreaInsets.top > 0` AND both auxiliary top areas exist with a positive
/// width. The notch spans the gap between the two auxiliary areas; its height is the top inset.
/// We use the auxiliary *widths* (not their origins) so the result is independent of whether AppKit
/// reports them in screen-local or global coordinates.
pub fn notch_rect(s: &ScreenInfo) -> Option<Rect> {
    if s.safe_top <= 0.0 {
        return None;
    }
    let left = s.aux_left.filter(|r| r.w > 0.0 && r.h > 0.0)?;
    let right = s.aux_right.filter(|r| r.w > 0.0 && r.h > 0.0)?;
    let w = s.frame.w - left.w - right.w;
    if w <= 0.0 || w >= s.frame.w {
        return None;
    }
    let scale = if s.scale > 0.0 { s.scale } else { 1.0 };
    let snap = |v: f64| (v * scale).round() / scale;
    Some(Rect::new(
        snap(s.frame.x + left.w),
        snap(s.frame.max_y() - s.safe_top),
        snap(w),
        snap(s.safe_top),
    ))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NotchState {
    /// Black pill merged with the notch; only a few points wider than the camera housing.
    Collapsed,
    /// Pointer over the pill — slight expansion.
    Hover,
    /// Quick Panel dropped below the notch.
    Expanded,
    /// Something needs attention (gateway down, session revoked…).
    Alert,
    /// ORBIT optimizing right now (orb breathes softly).
    Active,
    /// Silent mode: minimal footprint, no motion, no alerts.
    Silent,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LauncherLayout {
    /// Extra width on each side of the notch in the collapsed state (points).
    pub wing: f64,
    pub hover_wing: f64,
    pub hover_extra_h: f64,
    pub silent_wing: f64,
    pub alert_wing: f64,
    pub expanded_w: f64,
    /// Panel height *below* the notch.
    pub expanded_panel_h: f64,
}

impl Default for LauncherLayout {
    fn default() -> Self {
        Self {
            wing: 30.0,
            hover_wing: 40.0,
            hover_extra_h: 4.0,
            silent_wing: 16.0,
            alert_wing: 36.0,
            expanded_w: 384.0,
            expanded_panel_h: 568.0,
        }
    }
}

/// Window frame (global Cocoa coordinates) of the launcher window for a given state.
/// The top edge is always flush with the top of the screen and the frame is centered on the notch,
/// then clamped inside the screen so it never spills onto a neighbouring display.
pub fn launcher_frame(notch: Rect, screen: Rect, state: NotchState, l: &LauncherLayout, scale: f64) -> Rect {
    let (w, h) = match state {
        NotchState::Collapsed | NotchState::Active => (notch.w + 2.0 * l.wing, notch.h),
        NotchState::Alert => (notch.w + 2.0 * l.alert_wing, notch.h),
        NotchState::Silent => (notch.w + 2.0 * l.silent_wing, notch.h),
        NotchState::Hover => (notch.w + 2.0 * l.hover_wing, notch.h + l.hover_extra_h),
        NotchState::Expanded => ((notch.w + 2.0 * l.hover_wing).max(l.expanded_w), notch.h + l.expanded_panel_h),
    };
    let w = w.min(screen.w);
    let h = h.min(screen.h);
    let mut x = notch.mid_x() - w / 2.0;
    x = x.clamp(screen.x, screen.max_x() - w);
    let y = screen.max_y() - h;
    let scale = if scale > 0.0 { scale } else { 1.0 };
    let snap = |v: f64| (v * scale).round() / scale;
    Rect::new(snap(x), snap(y), snap(w), snap(h))
}

/// Hit area used to detect hover over the collapsed pill (slightly larger than the pill so the
/// pointer sliding along the menu bar edge still registers).
pub fn hover_hit_rect(frame: Rect, slop: f64) -> Rect {
    Rect::new(frame.x - slop, frame.y - slop, frame.w + 2.0 * slop, frame.h + slop)
}

/// Picks the screen that should host the notch launcher: the first one with a real notch.
pub fn pick_notch_screen(screens: &[ScreenInfo]) -> Option<(usize, Rect)> {
    screens.iter().enumerate().find_map(|(i, s)| notch_rect(s).map(|n| (i, n)))
}

/* ------------------------------------------------------------------------------------------- */
/* Windows pill + tray panel (top-left origin)                                                 */
/* ------------------------------------------------------------------------------------------- */

/// Snaps a pill to the nearest work-area edge(s) when within `threshold`, and always clamps it
/// inside the work area (the work area already excludes the taskbar, wherever it is docked).
/// `margin` keeps a small gap between the pill and the edge.
pub fn snap_to_edges(pos: (f64, f64), size: (f64, f64), work: Rect, threshold: f64, margin: f64) -> (f64, f64) {
    let (mut x, mut y) = pos;
    let (w, h) = size;
    let min_x = work.x + margin;
    let max_x = (work.max_x() - w - margin).max(min_x);
    let min_y = work.y + margin;
    let max_y = (work.max_y() - h - margin).max(min_y);
    if (x - min_x).abs() <= threshold || x < min_x {
        x = min_x;
    } else if (max_x - x).abs() <= threshold || x > max_x {
        x = max_x;
    }
    if (y - min_y).abs() <= threshold || y < min_y {
        y = min_y;
    } else if (max_y - y).abs() <= threshold || y > max_y {
        y = max_y;
    }
    (x.round(), y.round())
}

/// Picks which work area a window belongs to (the one containing its center; else the nearest).
pub fn work_area_for(center: (f64, f64), areas: &[Rect]) -> Option<usize> {
    if let Some(i) = areas.iter().position(|a| a.contains(center.0, center.1)) {
        return Some(i);
    }
    areas
        .iter()
        .enumerate()
        .map(|(i, a)| {
            let dx = (a.x - center.0).max(0.0).max(center.0 - a.max_x());
            let dy = (a.y - center.1).max(0.0).max(center.1 - a.max_y());
            (i, dx * dx + dy * dy)
        })
        .min_by(|a, b| a.1.total_cmp(&b.1))
        .map(|(i, _)| i)
}

/// Frame of the expanded Quick Panel anchored at a collapsed pill. The panel keeps the pill's
/// horizontal center and grows downwards, or upwards when there is no room below (pill docked at the
/// bottom / above a bottom taskbar). Always inside the work area.
pub fn expand_from_pill(pill: Rect, panel: (f64, f64), work: Rect, margin: f64) -> Rect {
    let (pw, ph) = (panel.0.min(work.w - 2.0 * margin), panel.1.min(work.h - 2.0 * margin));
    let mut x = pill.mid_x() - pw / 2.0;
    x = x.clamp(work.x + margin, work.max_x() - pw - margin);
    let below = pill.y;
    let y = if below + ph <= work.max_y() - margin {
        below
    } else {
        (pill.max_y() - ph).max(work.y + margin)
    };
    Rect::new(x.round(), y.round(), pw.round(), ph.round())
}

/// Floating Quick Panel anchored under (or above, for a bottom taskbar) a tray / menu-bar icon.
pub fn panel_under_tray(icon: Rect, panel: (f64, f64), work: Rect, gap: f64) -> Rect {
    let (pw, ph) = panel;
    let mut x = icon.mid_x() - pw / 2.0;
    x = x.clamp(work.x + gap, (work.max_x() - pw - gap).max(work.x + gap));
    // Icon in the top half of the screen (macOS menu bar / top taskbar) → open below it.
    let screen_mid = work.y + work.h / 2.0;
    let y = if icon.y < screen_mid {
        (icon.max_y() + gap).max(work.y + gap)
    } else {
        (icon.y - ph - gap).max(work.y + gap)
    };
    Rect::new(x.round(), y.round(), pw, ph)
}

/// Stable key for persisting the pill position per monitor.
pub fn monitor_key(name: Option<&str>, size: (u32, u32), pos: (i32, i32)) -> String {
    format!("{}@{}x{}+{}+{}", name.unwrap_or("monitor"), size.0, size.1, pos.0, pos.1)
}

/* ------------------------------------------------------------------------------------------- */
/* Tests                                                                                        */
/* ------------------------------------------------------------------------------------------- */

#[cfg(test)]
mod tests {
    use super::*;

    fn approx(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-6
    }

    /// 14" MacBook Pro default resolution (1512×982 pt, 2x), notch 185×32 pt.
    fn mbp14() -> ScreenInfo {
        ScreenInfo {
            frame: Rect::new(0.0, 0.0, 1512.0, 982.0),
            safe_top: 32.0,
            aux_left: Some(Rect::new(0.0, 950.0, 663.5, 32.0)),
            aux_right: Some(Rect::new(848.5, 950.0, 663.5, 32.0)),
            scale: 2.0,
        }
    }

    #[test]
    fn notch_macbook_detected() {
        let n = notch_rect(&mbp14()).expect("notch");
        assert!(approx(n.x, 663.5));
        assert!(approx(n.w, 185.0));
        assert!(approx(n.h, 32.0));
        assert!(approx(n.y, 950.0));
        assert!(approx(n.mid_x(), 756.0));
    }

    #[test]
    fn non_notch_mac_has_no_notch() {
        let s = ScreenInfo {
            frame: Rect::new(0.0, 0.0, 1440.0, 900.0),
            safe_top: 0.0,
            aux_left: None,
            aux_right: None,
            scale: 2.0,
        };
        assert_eq!(notch_rect(&s), None);
        // Insets without auxiliary areas (e.g. a sidecar/iPad display) is still not a notch.
        let s2 = ScreenInfo { safe_top: 24.0, ..s };
        assert_eq!(notch_rect(&s2), None);
        // Zero-width aux areas → no notch.
        let s3 = ScreenInfo {
            safe_top: 24.0,
            aux_left: Some(Rect::default()),
            aux_right: Some(Rect::default()),
            ..s
        };
        assert_eq!(notch_rect(&s3), None);
    }

    #[test]
    fn external_monitor_and_offset_builtin() {
        // External 1080p is the primary (origin 0,0); the notched built-in sits to its left and lower.
        let external = ScreenInfo {
            frame: Rect::new(0.0, 0.0, 1920.0, 1080.0),
            safe_top: 0.0,
            aux_left: None,
            aux_right: None,
            scale: 1.0,
        };
        let builtin = ScreenInfo {
            frame: Rect::new(-1470.0, -120.0, 1470.0, 956.0),
            safe_top: 33.0,
            aux_left: Some(Rect::new(-1470.0, 803.0, 642.0, 33.0)),
            aux_right: Some(Rect::new(-642.0, 803.0, 642.0, 33.0)),
            scale: 2.0,
        };
        assert_eq!(notch_rect(&external), None);
        let (idx, n) = pick_notch_screen(&[external, builtin]).expect("builtin has notch");
        assert_eq!(idx, 1);
        assert!(approx(n.x, -1470.0 + 642.0));
        assert!(approx(n.w, 186.0));
        assert!(approx(n.max_y(), 836.0)); // top of the built-in display
        let f = launcher_frame(n, builtin.frame, NotchState::Collapsed, &LauncherLayout::default(), 2.0);
        assert!(approx(f.max_y(), builtin.frame.max_y()));
        assert!(f.x >= builtin.frame.x && f.max_x() <= builtin.frame.max_x());
        // External only → nothing to host the launcher (tray fallback).
        assert_eq!(pick_notch_screen(&[external]), None);
    }

    /// Values read from this dev machine (MacBook M5 13", external 1080p as primary) via NSScreen.
    #[test]
    fn real_values_from_dev_machine() {
        let external = ScreenInfo { frame: Rect::new(0.0, 0.0, 1920.0, 1080.0), safe_top: 0.0, aux_left: None, aux_right: None, scale: 1.0 };
        let builtin = ScreenInfo {
            frame: Rect::new(1920.0, 0.0, 1470.0, 956.0),
            safe_top: 32.0,
            aux_left: Some(Rect::new(1920.0, 924.0, 646.0, 32.0)),
            aux_right: Some(Rect::new(2745.0, 924.0, 645.0, 32.0)),
            scale: 2.0,
        };
        let (i, n) = pick_notch_screen(&[external, builtin]).unwrap();
        assert_eq!(i, 1);
        assert_eq!(n, Rect::new(2566.0, 924.0, 179.0, 32.0));
        // aux right starts exactly where the notch ends
        assert!(approx(n.max_x(), 2745.0));
        let c = launcher_frame(n, builtin.frame, NotchState::Collapsed, &LauncherLayout::default(), 2.0);
        assert_eq!((c.w, c.h, c.max_y()), (239.0, 32.0, 956.0));
    }

    #[test]
    fn scaled_resolution_more_space() {
        // "More Space" on a 13" Air: 1710×1112 pt, insets and aux areas scale accordingly.
        let s = ScreenInfo {
            frame: Rect::new(0.0, 0.0, 1710.0, 1112.0),
            safe_top: 37.0,
            aux_left: Some(Rect::new(0.0, 1075.0, 755.0, 37.0)),
            aux_right: Some(Rect::new(955.0, 1075.0, 755.0, 37.0)),
            scale: 2.0,
        };
        let n = notch_rect(&s).unwrap();
        assert!(approx(n.w, 200.0));
        assert!(approx(n.mid_x(), 855.0));
        // Frames are snapped to device pixels (multiples of 0.5 pt at 2x).
        let f = launcher_frame(n, s.frame, NotchState::Collapsed, &LauncherLayout::default(), 2.0);
        assert!(approx((f.x * 2.0).fract(), 0.0));
        assert!(approx((f.w * 2.0).fract(), 0.0));
        // centered within one device pixel (an odd pixel width cannot be centered exactly)
        assert!((f.mid_x() - 855.0).abs() <= 0.5);
    }

    #[test]
    fn launcher_states_grow_around_notch_without_covering_menus() {
        let s = mbp14();
        let n = notch_rect(&s).unwrap();
        let l = LauncherLayout::default();
        let c = launcher_frame(n, s.frame, NotchState::Collapsed, &l, 2.0);
        let h = launcher_frame(n, s.frame, NotchState::Hover, &l, 2.0);
        let e = launcher_frame(n, s.frame, NotchState::Expanded, &l, 2.0);
        let q = launcher_frame(n, s.frame, NotchState::Silent, &l, 2.0);
        // collapsed: same height as notch, only a few points wider on each side
        assert!(approx(c.h, n.h));
        assert!(approx(c.w, n.w + 60.0));
        assert!(c.x < n.x && c.max_x() > n.max_x());
        assert!(n.x - c.x <= 40.0);
        // hover: slightly bigger than collapsed
        assert!(h.w > c.w && h.h > c.h && h.h - c.h <= 8.0);
        // expanded: drops below the notch, flush with the top of the screen
        assert!(approx(e.max_y(), s.frame.max_y()));
        assert!(e.h > 400.0 && e.w >= 360.0);
        // silent: smallest
        assert!(q.w < c.w);
        // every state stays centered on the notch
        for f in [c, h, e, q] {
            assert!(approx(f.mid_x(), n.mid_x()));
        }
    }

    #[test]
    fn launcher_clamped_inside_small_screen() {
        let screen = Rect::new(0.0, 0.0, 300.0, 300.0);
        let notch = Rect::new(10.0, 270.0, 100.0, 30.0);
        let e = launcher_frame(notch, screen, NotchState::Expanded, &LauncherLayout::default(), 1.0);
        assert!(e.x >= 0.0 && e.max_x() <= 300.0 && e.y >= 0.0);
    }

    #[test]
    fn hover_hit_rect_extends() {
        let f = Rect::new(100.0, 900.0, 200.0, 32.0);
        let hit = hover_hit_rect(f, 4.0);
        assert!(hit.contains(98.0, 899.0));
        assert!(!hit.contains(90.0, 900.0));
    }

    #[test]
    fn pill_snaps_to_left_and_top_edges() {
        let work = Rect::new(0.0, 0.0, 1920.0, 1040.0); // bottom taskbar 40px
        let p = snap_to_edges((14.0, 9.0), (180.0, 44.0), work, 24.0, 8.0);
        assert_eq!(p, (8.0, 8.0));
    }

    #[test]
    fn pill_snaps_right_and_respects_bottom_taskbar() {
        let work = Rect::new(0.0, 0.0, 1920.0, 1040.0);
        let p = snap_to_edges((1720.0, 990.0), (180.0, 44.0), work, 24.0, 8.0);
        assert_eq!(p, (1920.0 - 180.0 - 8.0, 1040.0 - 44.0 - 8.0));
    }

    #[test]
    fn pill_left_taskbar_and_secondary_monitor() {
        // Taskbar docked left (work area starts at x=48) on a monitor placed right of the primary.
        let work = Rect::new(1920.0 + 48.0, 0.0, 2560.0 - 48.0, 1440.0);
        let p = snap_to_edges((1930.0, 600.0), (180.0, 44.0), work, 24.0, 8.0);
        assert_eq!(p, (1920.0 + 48.0 + 8.0, 600.0));
    }

    #[test]
    fn pill_far_from_edges_is_untouched_but_offscreen_is_clamped() {
        let work = Rect::new(0.0, 0.0, 1920.0, 1040.0);
        assert_eq!(snap_to_edges((800.0, 500.0), (180.0, 44.0), work, 24.0, 8.0), (800.0, 500.0));
        assert_eq!(snap_to_edges((-500.0, 5000.0), (180.0, 44.0), work, 24.0, 8.0), (8.0, 1040.0 - 52.0));
    }

    #[test]
    fn pill_snap_at_150_percent_dpi() {
        // 1920×1080 physical at 150% → the caller passes physical pixels consistently.
        let scale = 1.5;
        let work = Rect::new(0.0, 0.0, 1920.0, 1080.0 - 48.0 * scale);
        let size = (180.0 * scale, 44.0 * scale);
        let p = snap_to_edges((1920.0 - 270.0 - 20.0, 30.0), size, work, 24.0 * scale, 8.0 * scale);
        assert_eq!(p, (1920.0 - 270.0 - 12.0, 12.0));
    }

    #[test]
    fn work_area_selection() {
        let areas = [Rect::new(0.0, 0.0, 1920.0, 1040.0), Rect::new(1920.0, 0.0, 2560.0, 1400.0)];
        assert_eq!(work_area_for((2000.0, 100.0), &areas), Some(1));
        assert_eq!(work_area_for((100.0, 100.0), &areas), Some(0));
        assert_eq!(work_area_for((5000.0, 100.0), &areas), Some(1)); // nearest
        assert_eq!(work_area_for((0.0, 0.0), &[]), None);
    }

    #[test]
    fn expanded_panel_flips_above_bottom_pill() {
        let work = Rect::new(0.0, 0.0, 1920.0, 1040.0);
        let top_pill = Rect::new(870.0, 8.0, 180.0, 44.0);
        let e = expand_from_pill(top_pill, (360.0, 470.0), work, 8.0);
        assert_eq!(e.y, 8.0);
        assert!(approx(e.mid_x(), top_pill.mid_x()));
        let bottom_pill = Rect::new(1732.0, 988.0, 180.0, 44.0);
        let e2 = expand_from_pill(bottom_pill, (360.0, 470.0), work, 8.0);
        assert!(approx(e2.max_y(), bottom_pill.max_y()));
        assert!(e2.max_x() <= 1920.0 - 8.0);
    }

    #[test]
    fn tray_panel_below_menu_bar_or_above_taskbar() {
        let mac_work = Rect::new(0.0, 25.0, 1512.0, 957.0);
        let icon = Rect::new(1300.0, 0.0, 24.0, 24.0);
        let p = panel_under_tray(icon, (360.0, 460.0), mac_work, 6.0);
        assert_eq!(p.y, 31.0); // below the menu bar (work area starts at y=25)
        assert!(p.max_x() <= 1512.0 - 6.0);
        let win_work = Rect::new(0.0, 0.0, 1920.0, 1032.0);
        let tray = Rect::new(1800.0, 1040.0, 24.0, 24.0);
        let p2 = panel_under_tray(tray, (360.0, 460.0), win_work, 6.0);
        assert_eq!(p2.y, 1040.0 - 460.0 - 6.0);
        assert!(p2.max_x() <= 1920.0 - 6.0);
    }

    #[test]
    fn monitor_key_is_stable() {
        assert_eq!(monitor_key(Some("DELL"), (2560, 1440), (1920, 0)), "DELL@2560x1440+1920+0");
        assert_eq!(monitor_key(None, (1920, 1080), (0, 0)), "monitor@1920x1080+0+0");
    }
}

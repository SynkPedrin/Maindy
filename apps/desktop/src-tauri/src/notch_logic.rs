//! Pure logic behind the notch launcher's interactions and wing sizing. No AppKit types here, so all
//! of it is unit-tested on any OS:
//!
//! * hover dwell → peek → expand state machine, scroll-to-expand, leave-to-collapse timing and the
//!   "pinned" (opened by click) vs "transient" (opened by hover/scroll) distinction;
//! * how much menu-bar space is actually free to the right of the notch (from the menu bar extras'
//!   window bounds, which macOS exposes without any permission);
//! * which content the wings show (metrics / music / dot) and how wide they may grow, clamped so
//!   they never cover menu bar extras.

use crate::geometry::Rect;
use serde::{Deserialize, Serialize};

/* ------------------------------------------------------------------------------------------- */
/* Hover / scroll / click state machine                                                         */
/* ------------------------------------------------------------------------------------------- */

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OpenedBy {
    /// Dwell over the notch. Transient: collapses when the pointer leaves.
    Hover,
    /// Two-finger swipe / wheel over the notch. Transient.
    Scroll,
    /// Explicit click. Pinned: stays until blur or Esc.
    Click,
}

impl OpenedBy {
    pub fn transient(self) -> bool {
        !matches!(self, OpenedBy::Click)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    Idle,
    /// Pointer over the collapsed notch since `since` (ms); the peek is shown.
    Peek { since: u64 },
    /// Panel open. `left_at` = when the pointer left the panel + notch area (transient panels only).
    Open { by: OpenedBy, left_at: Option<u64> },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HoverCfg {
    /// "Abrir ao passar o mouse".
    pub open_on_hover: bool,
    /// Dwell before a hover opens the panel (ms).
    pub dwell_ms: u64,
    /// Grace after the pointer leaves a transient panel before it collapses (ms).
    pub leave_ms: u64,
}

pub const DEFAULT_DWELL_MS: u64 = 250;
pub const MIN_DWELL_MS: u64 = 100;
pub const MAX_DWELL_MS: u64 = 1500;
pub const LEAVE_MS: u64 = 400;

pub fn clamp_dwell(ms: u64) -> u64 {
    ms.clamp(MIN_DWELL_MS, MAX_DWELL_MS)
}

impl Default for HoverCfg {
    fn default() -> Self {
        Self { open_on_hover: true, dwell_ms: DEFAULT_DWELL_MS, leave_ms: LEAVE_MS }
    }
}

/// One pointer sample (taken every ~90 ms from `NSEvent.mouseLocation`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Sample {
    pub now: u64,
    /// Pointer inside the current launcher frame (collapsed pill / peek / open panel) + slop.
    pub inside: bool,
    /// The panel window is key (the user clicked into it or is typing).
    pub focused: bool,
    /// A mouse button is held (drag in progress). Never open on hover while dragging.
    pub buttons_down: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    None,
    /// Show the peek (pointer arrived over the collapsed notch).
    Peek,
    /// Back to the resting state (pointer left before the dwell elapsed).
    Unpeek,
    Expand(OpenedBy),
    /// A transient panel became pinned (click inside it): make it key so Esc/Tab work.
    Pin,
    Collapse,
}

impl Phase {
    pub fn is_open(self) -> bool {
        matches!(self, Phase::Open { .. })
    }

    pub fn opened_by(self) -> Option<OpenedBy> {
        match self {
            Phase::Open { by, .. } => Some(by),
            _ => None,
        }
    }

    /// Periodic pointer sample.
    pub fn sample(self, s: Sample, cfg: &HoverCfg) -> (Phase, Action) {
        match self {
            Phase::Idle if s.inside => (Phase::Peek { since: s.now }, Action::Peek),
            Phase::Idle => (self, Action::None),
            Phase::Peek { .. } if !s.inside => (Phase::Idle, Action::Unpeek),
            Phase::Peek { since } => {
                if cfg.open_on_hover && !s.buttons_down && s.now.saturating_sub(since) >= cfg.dwell_ms {
                    (Phase::Open { by: OpenedBy::Hover, left_at: None }, Action::Expand(OpenedBy::Hover))
                } else if s.buttons_down {
                    // a drag passing over the notch restarts the dwell once the button is released
                    (Phase::Peek { since: s.now }, Action::None)
                } else {
                    (self, Action::None)
                }
            }
            Phase::Open { by: OpenedBy::Click, .. } => (self, Action::None),
            Phase::Open { by, left_at } => {
                if s.inside || s.focused || s.buttons_down {
                    (Phase::Open { by, left_at: None }, Action::None)
                } else {
                    match left_at {
                        None => (Phase::Open { by, left_at: Some(s.now) }, Action::None),
                        Some(t) if s.now.saturating_sub(t) >= cfg.leave_ms => (Phase::Idle, Action::Collapse),
                        Some(_) => (self, Action::None),
                    }
                }
            }
        }
    }

    /// Scroll-wheel / two-finger swipe event at the pointer location.
    pub fn scroll(self, inside: bool, dx: f64, dy: f64) -> (Phase, Action) {
        if !inside || !scroll_is_gesture(dx, dy) {
            return (self, Action::None);
        }
        match self {
            Phase::Idle | Phase::Peek { .. } => {
                (Phase::Open { by: OpenedBy::Scroll, left_at: None }, Action::Expand(OpenedBy::Scroll))
            }
            Phase::Open { .. } => (self, Action::None),
        }
    }

    /// Left mouse-down anywhere (global + local monitors).
    pub fn click(self, inside: bool) -> (Phase, Action) {
        match (self, inside) {
            (Phase::Idle | Phase::Peek { .. }, true) => {
                (Phase::Open { by: OpenedBy::Click, left_at: None }, Action::Expand(OpenedBy::Click))
            }
            (Phase::Open { by, .. }, true) if by.transient() => (Phase::Open { by: OpenedBy::Click, left_at: None }, Action::Pin),
            (Phase::Open { by, .. }, false) if by.transient() => (Phase::Idle, Action::Collapse),
            _ => (self, Action::None),
        }
    }

    /// Blur / Esc / the UI finished collapsing.
    pub fn closed(self) -> Phase {
        Phase::Idle
    }
}

/// Tiny deltas (trackpad noise, the tail of a momentum scroll) never open the panel.
pub fn scroll_is_gesture(dx: f64, dy: f64) -> bool {
    dx.abs().max(dy.abs()) >= 1.0
}

/* ------------------------------------------------------------------------------------------- */
/* Menu bar free space                                                                          */
/* ------------------------------------------------------------------------------------------- */

/// Converts a Cocoa global rect (origin bottom-left of the primary display, y up) into CoreGraphics
/// global coordinates (origin top-left of the primary display, y down).
pub fn cocoa_to_cg(r: Rect, primary_h: f64) -> Rect {
    Rect::new(r.x, primary_h - r.max_y(), r.w, r.h)
}

/// Free menu-bar width between the right edge of the notch and the leftmost menu bar extra
/// (status item) on the same display. `items_cg` are the bounds of `kCGStatusWindowLevel` windows
/// (CoreGraphics coordinates); `notch`/`screen` are Cocoa coordinates.
///
/// Returns `None` when no extra is visible on that display (menu bar hidden in full screen, or no
/// extras at all) — then the whole auxiliary area is free.
pub fn free_right_of_notch(notch: Rect, screen: Rect, primary_h: f64, items_cg: &[Rect]) -> Option<f64> {
    let n = cocoa_to_cg(notch, primary_h);
    let s = cocoa_to_cg(screen, primary_h);
    items_cg
        .iter()
        .filter(|r| r.w > 0.0 && r.h > 0.0)
        // on the notch display's menu bar band
        .filter(|r| r.mid_x() >= s.x && r.mid_x() <= s.max_x() && r.y < s.y + n.h + 4.0 && r.max_y() > s.y - 1.0)
        // right of the notch's center (extras hidden *behind* the notch report x inside it)
        .filter(|r| r.mid_x() > n.mid_x())
        .map(|r| (r.x - n.max_x()).max(0.0))
        .min_by(|a, b| a.total_cmp(b))
}

/* ------------------------------------------------------------------------------------------- */
/* Wing content and width                                                                       */
/* ------------------------------------------------------------------------------------------- */

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WingContent {
    /// Orb + status dot (the original compact look).
    Dot,
    /// Savings % on the left, spend + usage bar on the right.
    Metrics,
    /// Artwork (or orb) on the left, equalizer on the right.
    Music,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum WingPriority {
    /// While something is playing the wings show music; otherwise metrics.
    #[default]
    Music,
    /// Metrics whenever there are metrics; music only when there are none.
    Metrics,
}

/// What the wings would like to show, before width constraints.
pub fn pick_content(priority: WingPriority, has_metrics: bool, playing: bool) -> WingContent {
    match (priority, has_metrics, playing) {
        (WingPriority::Music, _, true) => WingContent::Music,
        (_, true, _) => WingContent::Metrics,
        (WingPriority::Metrics, false, true) => WingContent::Music,
        _ => WingContent::Dot,
    }
}

/// Typography tier of the metric wings. The UI uses the same numbers (styles.css `.nw-full` /
/// `.nw-compact`), so the estimate below matches what is drawn.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Tier {
    Full,
    Compact,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TierMetrics {
    pub font_px: f64,
    pub orb: f64,
    /// padding next to the wing's outer (rounded) edge
    pub edge: f64,
    pub gap: f64,
    /// padding next to the camera housing
    pub inner: f64,
    pub bar_min: f64,
}

pub fn tier_metrics(t: Tier) -> TierMetrics {
    match t {
        Tier::Full => TierMetrics { font_px: 11.0, orb: 14.0, edge: 7.0, gap: 5.0, inner: 3.0, bar_min: 30.0 },
        Tier::Compact => TierMetrics { font_px: 10.0, orb: 11.0, edge: 5.0, gap: 3.0, inner: 2.0, bar_min: 24.0 },
    }
}

/// Approximate advance width (em) of SF Pro semibold with tabular figures.
fn em(c: char) -> f64 {
    match c {
        '0'..='9' => 0.61,
        '%' => 0.86,
        '≈' | '<' | '~' => 0.66,
        '$' => 0.61,
        'U' => 0.72,
        'S' => 0.63,
        ' ' => 0.28,
        ',' | '.' => 0.29,
        'm' => 0.86,
        'i' | 'l' => 0.26,
        _ => 0.6,
    }
}

pub fn text_width(s: &str, font_px: f64) -> f64 {
    s.chars().map(em).sum::<f64>() * font_px
}

/// Labels the metric wings can show (formatted by `metrics::format_*`).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct WingLabels {
    /// Full-tier savings label, e.g. "≈38%".
    pub savings: Option<String>,
    /// Compact savings label without the "≈" (the estimate is marked with a dotted underline).
    pub savings_compact: Option<String>,
    pub spend: Option<String>,
    pub spend_compact: Option<String>,
    pub has_bar: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WingPlan {
    pub content: WingContent,
    /// Width added on each side of the notch (points).
    pub wing: f64,
    pub tier: Tier,
    /// Right wing shows the spend text (else only the usage bar).
    pub show_spend: bool,
    /// Maximum wing allowed by the measured free menu-bar space.
    pub cap: f64,
}

pub const DOT_WING: f64 = 30.0;
pub const MUSIC_WING: f64 = 34.0;
pub const WING_MAX: f64 = 72.0;
/// Kept clear between the wing and the first menu bar extra.
pub const MENU_MARGIN: f64 = 4.0;
pub const WING_MIN: f64 = 14.0;

/// Maximum wing for a measured free width (None = nothing to avoid).
pub fn wing_cap(free_right: Option<f64>) -> f64 {
    match free_right {
        Some(f) => (f - MENU_MARGIN).clamp(0.0, WING_MAX),
        None => WING_MAX,
    }
}

fn snap(v: f64) -> f64 {
    (v * 2.0).ceil() / 2.0
}

/// Decides the wing content/width. Never exceeds `cap`; metrics that don't fit fall back to a
/// smaller tier, then to the right wing without text, then to dot-only.
pub fn plan_wings(wanted: WingContent, labels: &WingLabels, cap: f64) -> WingPlan {
    let dot = |cap: f64| WingPlan { content: WingContent::Dot, wing: DOT_WING.min(cap).max(WING_MIN.min(cap)), tier: Tier::Compact, show_spend: false, cap };
    match wanted {
        WingContent::Dot => dot(cap),
        WingContent::Music => {
            if MUSIC_WING <= cap {
                WingPlan { content: WingContent::Music, wing: MUSIC_WING, tier: Tier::Full, show_spend: false, cap }
            } else {
                dot(cap)
            }
        }
        WingContent::Metrics => {
            for tier in [Tier::Full, Tier::Compact] {
                let m = tier_metrics(tier);
                let left_label = match tier {
                    Tier::Full => labels.savings.as_deref(),
                    Tier::Compact => labels.savings_compact.as_deref().or(labels.savings.as_deref()),
                };
                let right_label = match tier {
                    Tier::Full => labels.spend.as_deref(),
                    Tier::Compact => labels.spend_compact.as_deref().or(labels.spend.as_deref()),
                };
                let left = m.edge + m.orb + left_label.map(|l| m.gap + text_width(l, m.font_px)).unwrap_or(0.0) + m.inner;
                let bar = if labels.has_bar { m.bar_min } else { 0.0 };
                let right_with_text = m.inner + right_label.map(|l| text_width(l, m.font_px)).unwrap_or(0.0).max(bar) + m.edge;
                let right_bar_only = m.inner + bar + m.edge;
                let need_text = snap(left.max(right_with_text)).max(DOT_WING);
                if need_text <= cap {
                    return WingPlan { content: WingContent::Metrics, wing: need_text, tier, show_spend: right_label.is_some(), cap };
                }
                if tier == Tier::Compact && labels.has_bar {
                    let need = snap(left.max(right_bar_only)).max(DOT_WING.min(cap));
                    if need <= cap {
                        return WingPlan { content: WingContent::Metrics, wing: need, tier, show_spend: false, cap };
                    }
                }
            }
            dot(cap)
        }
    }
}

/* ------------------------------------------------------------------------------------------- */
/* Tests                                                                                        */
/* ------------------------------------------------------------------------------------------- */

#[cfg(test)]
mod tests {
    use super::*;

    const CFG: HoverCfg = HoverCfg { open_on_hover: true, dwell_ms: 250, leave_ms: 400 };

    fn s(now: u64, inside: bool) -> Sample {
        Sample { now, inside, ..Default::default() }
    }

    /// Feeds 90 ms samples; returns the actions in order (skipping None).
    fn run(mut p: Phase, samples: &[Sample], cfg: &HoverCfg) -> (Phase, Vec<Action>) {
        let mut out = vec![];
        for x in samples {
            let (np, a) = p.sample(*x, cfg);
            p = np;
            if a != Action::None {
                out.push(a);
            }
        }
        (p, out)
    }

    #[test]
    fn dwell_opens_after_250ms_not_before() {
        let samples: Vec<Sample> = (0..=3).map(|i| s(1000 + i * 90, true)).collect(); // 0, 90, 180, 270 ms
        let (p, acts) = run(Phase::Idle, &samples, &CFG);
        assert_eq!(acts, vec![Action::Peek, Action::Expand(OpenedBy::Hover)]);
        assert_eq!(p, Phase::Open { by: OpenedBy::Hover, left_at: None });
        // 180 ms of hover is only a peek
        let (p2, acts2) = run(Phase::Idle, &samples[..3], &CFG);
        assert_eq!(acts2, vec![Action::Peek]);
        assert!(matches!(p2, Phase::Peek { .. }));
    }

    #[test]
    fn passing_through_on_the_way_to_the_menu_bar_never_opens() {
        let (p, acts) = run(Phase::Idle, &[s(0, true), s(90, true), s(180, false), s(270, false)], &CFG);
        assert_eq!(acts, vec![Action::Peek, Action::Unpeek]);
        assert_eq!(p, Phase::Idle);
    }

    #[test]
    fn hover_open_disabled_only_peeks() {
        let cfg = HoverCfg { open_on_hover: false, ..CFG };
        let samples: Vec<Sample> = (0..20).map(|i| s(i * 90, true)).collect();
        let (p, acts) = run(Phase::Idle, &samples, &cfg);
        assert_eq!(acts, vec![Action::Peek]);
        assert!(matches!(p, Phase::Peek { .. }));
    }

    #[test]
    fn dragging_over_the_notch_does_not_open() {
        let drag = |now| Sample { now, inside: true, buttons_down: true, ..Default::default() };
        let (p, acts) = run(Phase::Idle, &[drag(0), drag(300), drag(600)], &CFG);
        assert_eq!(acts, vec![Action::Peek]);
        // released: the dwell restarts from the release
        let (p, a) = p.sample(s(690, true), &CFG);
        assert_eq!(a, Action::None);
        let (_, a) = p.sample(s(900, true), &CFG);
        assert_eq!(a, Action::Expand(OpenedBy::Hover));
    }

    #[test]
    fn custom_dwell_is_respected_and_clamped() {
        let cfg = HoverCfg { dwell_ms: 600, ..CFG };
        let (_, acts) = run(Phase::Idle, &[s(0, true), s(450, true), s(590, true)], &cfg);
        assert_eq!(acts, vec![Action::Peek]);
        let (_, acts) = run(Phase::Idle, &[s(0, true), s(600, true)], &cfg);
        assert_eq!(acts, vec![Action::Peek, Action::Expand(OpenedBy::Hover)]);
        assert_eq!(clamp_dwell(0), MIN_DWELL_MS);
        assert_eq!(clamp_dwell(10_000), MAX_DWELL_MS);
        assert_eq!(clamp_dwell(250), 250);
    }

    #[test]
    fn hover_panel_collapses_400ms_after_leaving() {
        let open = Phase::Open { by: OpenedBy::Hover, left_at: None };
        let (p, acts) = run(open, &[s(0, false), s(90, false), s(390, false)], &CFG);
        assert!(acts.is_empty(), "still within the grace period");
        assert_eq!(p, Phase::Open { by: OpenedBy::Hover, left_at: Some(0) });
        let (p, a) = p.sample(s(400, false), &CFG);
        assert_eq!((p, a), (Phase::Idle, Action::Collapse));
    }

    #[test]
    fn coming_back_cancels_the_leave_timer() {
        let open = Phase::Open { by: OpenedBy::Hover, left_at: None };
        let (p, acts) = run(open, &[s(0, false), s(300, true), s(390, false), s(700, false)], &CFG);
        assert!(acts.is_empty());
        assert_eq!(p, Phase::Open { by: OpenedBy::Hover, left_at: Some(390) });
        assert_eq!(p.sample(s(790, false), &CFG).1, Action::Collapse);
    }

    #[test]
    fn focus_or_pressed_button_keeps_a_hover_panel_open() {
        let open = Phase::Open { by: OpenedBy::Scroll, left_at: Some(0) };
        let focused = Sample { now: 5_000, inside: false, focused: true, buttons_down: false };
        assert_eq!(open.sample(focused, &CFG), (Phase::Open { by: OpenedBy::Scroll, left_at: None }, Action::None));
        let pressing = Sample { now: 5_000, inside: false, focused: false, buttons_down: true };
        assert_eq!(open.sample(pressing, &CFG).1, Action::None);
    }

    #[test]
    fn click_panel_ignores_pointer_leaving() {
        let open = Phase::Open { by: OpenedBy::Click, left_at: None };
        let (p, acts) = run(open, &[s(0, false), s(10_000, false)], &CFG);
        assert!(acts.is_empty());
        assert_eq!(p, open);
    }

    #[test]
    fn scroll_over_notch_opens_immediately() {
        assert_eq!(Phase::Idle.scroll(true, 0.0, -3.0), (Phase::Open { by: OpenedBy::Scroll, left_at: None }, Action::Expand(OpenedBy::Scroll)));
        assert_eq!(Phase::Peek { since: 0 }.scroll(true, 2.0, 0.0).1, Action::Expand(OpenedBy::Scroll));
        // outside the notch / noise / already open → nothing
        assert_eq!(Phase::Idle.scroll(false, 0.0, -30.0).1, Action::None);
        assert_eq!(Phase::Idle.scroll(true, 0.2, 0.4).1, Action::None);
        let open = Phase::Open { by: OpenedBy::Click, left_at: None };
        assert_eq!(open.scroll(true, 0.0, 10.0), (open, Action::None));
        assert!(!scroll_is_gesture(0.0, 0.0));
    }

    #[test]
    fn clicks_open_pin_and_dismiss() {
        assert_eq!(Phase::Idle.click(true).1, Action::Expand(OpenedBy::Click));
        assert_eq!(Phase::Peek { since: 3 }.click(true).1, Action::Expand(OpenedBy::Click));
        assert_eq!(Phase::Idle.click(false), (Phase::Idle, Action::None));
        let hover = Phase::Open { by: OpenedBy::Hover, left_at: Some(10) };
        assert_eq!(hover.click(true), (Phase::Open { by: OpenedBy::Click, left_at: None }, Action::Pin));
        assert_eq!(hover.click(false), (Phase::Idle, Action::Collapse));
        let pinned = Phase::Open { by: OpenedBy::Click, left_at: None };
        assert_eq!(pinned.click(false), (pinned, Action::None)); // blur handles it
        assert_eq!(pinned.click(true), (pinned, Action::None));
        assert_eq!(pinned.closed(), Phase::Idle);
        assert!(pinned.is_open() && pinned.opened_by() == Some(OpenedBy::Click));
    }

    /// Bounds read on the dev MacBook (macOS 26, built-in display primary at 1470×956, notch 179 pt):
    /// the leftmost menu bar extra starts at x=874 → 49 pt free right of the notch (825).
    #[test]
    fn free_space_from_real_menu_bar_extras() {
        let screen = Rect::new(0.0, 0.0, 1470.0, 956.0);
        let notch = Rect::new(646.0, 924.0, 179.0, 32.0);
        let items = [
            Rect::new(874.0, 0.0, 38.0, 33.0),
            Rect::new(912.0, 0.0, 36.0, 33.0),
            Rect::new(1307.0, 0.0, 165.0, 33.0),
            // extras of the two external displays (left of the built-in, CG y = -124)
            Rect::new(-715.0, -124.0, 34.0, 30.0),
            Rect::new(-2635.0, -124.0, 34.0, 30.0),
        ];
        assert_eq!(free_right_of_notch(notch, screen, 956.0, &items), Some(49.0));
        assert_eq!(wing_cap(Some(49.0)), 45.0);
        // menu bar hidden (full-screen app) → nothing to avoid
        assert_eq!(free_right_of_notch(notch, screen, 956.0, &items[3..]), None);
        assert_eq!(wing_cap(None), WING_MAX);
        // an extra hidden behind the notch's right half counts as zero free space
        let crowded = [Rect::new(800.0, 0.0, 30.0, 33.0)];
        assert_eq!(free_right_of_notch(notch, screen, 956.0, &crowded), Some(0.0));
    }

    #[test]
    fn free_space_when_builtin_is_not_primary() {
        // External 1080p primary at origin; built-in to its right, bottoms aligned.
        let screen = Rect::new(1920.0, 0.0, 1470.0, 956.0);
        let notch = Rect::new(2566.0, 924.0, 179.0, 32.0);
        // CG: primary height 1080 → built-in top is at y = 1080 - 956 = 124
        let items = [Rect::new(2830.0, 124.0, 40.0, 33.0), Rect::new(1700.0, 0.0, 40.0, 25.0)];
        assert_eq!(cocoa_to_cg(screen, 1080.0).y, 124.0);
        assert_eq!(free_right_of_notch(notch, screen, 1080.0, &items), Some(2830.0 - 2745.0));
    }

    #[test]
    fn content_priority() {
        use WingContent::*;
        use WingPriority as P;
        assert_eq!(pick_content(P::Music, true, true), Music);
        assert_eq!(pick_content(P::Music, true, false), Metrics);
        assert_eq!(pick_content(P::Metrics, true, true), Metrics);
        assert_eq!(pick_content(P::Metrics, false, true), Music);
        assert_eq!(pick_content(P::Music, false, false), Dot);
        assert_eq!(pick_content(P::Metrics, false, false), Dot);
    }

    fn labels() -> WingLabels {
        WingLabels {
            savings: Some("≈38%".into()),
            savings_compact: Some("38%".into()),
            spend: Some("US$ 1,24".into()),
            spend_compact: Some("US$1,2".into()),
            has_bar: true,
        }
    }

    #[test]
    fn wings_full_tier_when_there_is_room() {
        let p = plan_wings(WingContent::Metrics, &labels(), WING_MAX);
        assert_eq!(p.content, WingContent::Metrics);
        assert_eq!(p.tier, Tier::Full);
        assert!(p.show_spend);
        assert!(p.wing > DOT_WING && p.wing <= WING_MAX, "{p:?}");
        // half-point snapped
        assert_eq!((p.wing * 2.0).fract(), 0.0);
    }

    #[test]
    fn wings_compact_on_the_dev_macbook() {
        // 49 pt free → cap 45
        let p = plan_wings(WingContent::Metrics, &labels(), wing_cap(Some(49.0)));
        assert_eq!(p.content, WingContent::Metrics, "{p:?}");
        assert_eq!(p.tier, Tier::Compact);
        assert!(p.wing <= 45.0);
    }

    #[test]
    fn wings_drop_spend_text_then_fall_back_to_dot() {
        let mut l = labels();
        l.spend_compact = Some("US$1.234".into());
        l.spend = Some("US$ 1.234,56".into());
        let p = plan_wings(WingContent::Metrics, &l, 45.0);
        assert_eq!((p.content, p.show_spend), (WingContent::Metrics, false));
        assert!(p.wing <= 45.0);
        // extras right next to the notch → dot only, and never wider than the space
        let p = plan_wings(WingContent::Metrics, &labels(), wing_cap(Some(22.0)));
        assert_eq!(p.content, WingContent::Dot);
        assert!(p.wing <= 18.0);
        let p = plan_wings(WingContent::Metrics, &labels(), wing_cap(Some(30.0)));
        assert_eq!(p.content, WingContent::Dot);
    }

    #[test]
    fn wings_never_exceed_cap_or_72() {
        for cap in [0.0, 10.0, 20.0, 31.0, 40.0, 45.0, 50.0, 60.0, 72.0] {
            for c in [WingContent::Dot, WingContent::Music, WingContent::Metrics] {
                let p = plan_wings(c, &labels(), cap);
                assert!(p.wing <= cap + 1e-9 && p.wing <= WING_MAX, "{c:?} cap={cap} → {p:?}");
            }
        }
    }

    #[test]
    fn music_and_dot_widths() {
        assert_eq!(plan_wings(WingContent::Music, &WingLabels::default(), 45.0).wing, MUSIC_WING);
        assert_eq!(plan_wings(WingContent::Music, &WingLabels::default(), 30.0).content, WingContent::Dot);
        assert_eq!(plan_wings(WingContent::Dot, &WingLabels::default(), 72.0).wing, DOT_WING);
    }

    #[test]
    fn text_width_estimate_is_monotonic() {
        assert!(text_width("≈38%", 11.0) > text_width("38%", 11.0));
        assert!(text_width("38%", 11.0) > text_width("38%", 10.0));
        assert_eq!(text_width("", 11.0), 0.0);
    }
}

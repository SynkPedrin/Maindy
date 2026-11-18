/**
 * Mutable, non-React film state. The scroll controller writes it; the WebGL render loop and a few
 * imperative DOM effects read it every frame. Nothing here triggers React renders — that is the point.
 */
export type Quality = "high" | "medium" | "low";

type Listener = () => void;

export const film = {
  /** global scene coordinate from scroll (index + local progress), the authoritative target */
  sTarget: 0,
  /** damped copy of sTarget used for rendering (equals sTarget under reduced motion) */
  s: 0,
  /** per-scene local progress 0..1 (from sTarget) */
  local: [] as number[],
  /** pointer in -1..1 (x right, y up), raw and damped */
  pointer: { x: 0, y: 0, sx: 0, sy: 0, active: false },
  /** monotonically increasing pulse id; orb reacts when it changes */
  pulse: 0,
  pulseAt: -10,
  /** extra glow when a CTA is hovered (0..1) */
  ctaHover: 0,
  /** awakening intro progress 0..1 (time-based, once per session) */
  intro: 1,
  viewport: { w: 1440, h: 900, mobile: false },
  quality: "high" as Quality,
  reducedMotion: false,
  /** true while the final scene's video plate fully covers the canvas, so the canvas can idle */
  covered: false,
  /** damped scroll velocity in scenes/second (drives motion blur-ish FX: chromatic shift, FOV kick) */
  velocity: 0,
  /** free-look orbit around the subject while dragging (radians), springs back to the directed path */
  look: { yaw: 0, pitch: 0, vy: 0, vp: 0, dragging: false },
  /** user-selected render quality ("auto" follows detection) */
  preferred: "auto" as "auto" | Quality,
};

const listeners = new Set<Listener>();
/** Subscribe to coarse changes (quality / mode). Returns unsubscribe. */
export function onFilmChange(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emitFilmChange() {
  for (const l of listeners) l();
}

export function firePulse() {
  film.pulse += 1;
  film.pulseAt = performance.now() / 1000;
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** maps v from [a,b] to [0,1], clamped */
export const range = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
/** 0→1→0 window: rises over [a,b], holds, falls over [c,d] */
export const windowed = (v: number, a: number, b: number, c: number, d: number) => smooth(range(v, a, b)) * (1 - smooth(range(v, c, d)));

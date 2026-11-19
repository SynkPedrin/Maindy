/**
 * Camera director: deterministic poses as a function of the global coordinate `s`.
 * Positions are interpolated with Catmull-Rom (smooth curved camera path, no kinks at keys);
 * scalar channels use smoothstep between keys. Same `s` ⇒ same frame, scrolling up or down.
 */
import { Vector3 } from "three";

/** where the orb lives once the camera has crossed through it */
export const C2 = new Vector3(0, 0, -44);

type V = [number, number, number];
export type Key = {
  s: number;
  cam: V;
  look: V;
  /** orb world position and scale */
  orb: V;
  scale: number;
  /** overall scene light 0..1 */
  light: number;
  /** gold rim amount */
  gold: number;
  /** optional portrait overrides */
  m?: Partial<Pick<Key, "cam" | "look" | "orb" | "scale">>;
};

const c2 = (x: number, y: number, z: number): V => [C2.x + x, C2.y + y, C2.z + z];

export const KEYS: Key[] = [
  // Composition rule: the 3D subject and the copy never share screen space.
  // Landscape: subject on the right half, copy on the left (except centred beats). Portrait: subject top, copy bottom.
  // 01 hero — orb on the right, headline column on the left
  { s: 0.0, cam: [-1.45, 0.05, 7.6], look: [-1.45, 0, 0], orb: [0, 0, 0], scale: 1, light: 1, gold: 1, m: { cam: [0, -2.55, 7.8], look: [0, -2.55, 0], scale: 0.85 } },
  { s: 0.45, cam: [-0.7, 0.1, 4.8], look: [-0.45, 0, 0], orb: [0, 0, 0], scale: 1, light: 1, gold: 0.9, m: { cam: [0, -0.7, 4.8], look: [0, -0.5, 0], scale: 0.85 } },
  { s: 0.9, cam: [0.02, 0.0, 1.55], look: [0, 0, 0], orb: [0, 0, 0], scale: 1, light: 1, gold: 0.7, m: { cam: [0, 0, 1.6], look: [0, 0, 0] } },
  // 02 overload — through the membrane, down a corridor of waste (cards live on the right, copy on the left)
  { s: 1.0, cam: [0, 0, -1.5], look: [0.4, 0, -12], orb: c2(0, 0, 0), scale: 0, light: 0.8, gold: 0.4 },
  { s: 1.45, cam: [0.3, -0.15, -13], look: [0.9, 0.05, -26], orb: c2(0, 0, 0), scale: 0, light: 0.7, gold: 0.3 },
  { s: 1.95, cam: [-0.2, 0.2, -24.5], look: [0.6, 0, -40], orb: c2(0, 0, 0), scale: 0, light: 0.45, gold: 0.2 },
  // 03 shift — a point appears and pulls everything into orbit; camera pulls back to reveal (centred beat)
  { s: 2.15, cam: [-0.2, 0.2, -27.5], look: c2(0, -0.2, 0), orb: c2(0, 0, 0), scale: 0.035, light: 0.45, gold: 0.3 },
  { s: 2.55, cam: [0.2, 0.4, -31.5], look: c2(0, -0.25, 0), orb: c2(0, 0, 0), scale: 0.5, light: 0.7, gold: 0.6 },
  { s: 2.9, cam: c2(0.1, 0.8, 10.5), look: c2(0, -0.2, 0), orb: c2(0, 0, 0), scale: 0.9, light: 0.95, gold: 1 },
  // 04 meet — orbital move, subject right
  { s: 3.35, cam: c2(-3.2, 0.5, 6.4), look: c2(-1.5, 0, 0), orb: c2(0, 0, 0), scale: 1, light: 1, gold: 1, m: { cam: c2(-1.2, -1.3, 7.4), look: c2(0, -1.3, 0) } },
  { s: 3.85, cam: c2(-1.6, 0.15, 7.2), look: c2(-1.5, 0, 0), orb: c2(0, 0, 0), scale: 1, light: 1, gold: 1, m: { cam: c2(0, -1.3, 7.4), look: c2(0, -1.3, 0) } },
  // 05 demo — orb steps to the left for the product demo on the right
  { s: 4.2, cam: c2(1.9, 0.1, 7.0), look: c2(1.9, 0, 0), orb: c2(0, 0, 0), scale: 0.86, light: 0.9, gold: 0.9, m: { cam: c2(0, -4.6, 8.2), look: c2(0, -4.6, 0), scale: 0.42 } },
  { s: 4.85, cam: c2(2.0, 0.05, 6.8), look: c2(2.0, 0, 0), orb: c2(0, 0, 0), scale: 0.86, light: 0.9, gold: 0.9, m: { cam: c2(0, -4.7, 8.2), look: c2(0, -4.7, 0), scale: 0.42 } },
  // 06 ORBIT — ring of five stages on the right, from above
  { s: 5.25, cam: c2(-2.6, 3.2, 9.6), look: c2(-2.6, 0.1, 0), orb: c2(0, 0, 0), scale: 0.62, light: 1, gold: 1, m: { cam: c2(0, 3.0, 9.6), look: c2(0, -4.3, 0) } },
  { s: 5.8, cam: c2(-2.3, 3.5, 9.3), look: c2(-2.6, 0.1, 0), orb: c2(0, 0, 0), scale: 0.62, light: 1, gold: 1, m: { cam: c2(0, 3.3, 9.4), look: c2(0, -4.3, 0) } },
  // 07 quality — close and quiet, subject right
  { s: 6.25, cam: c2(-1.6, 0.35, 7.4), look: c2(-1.6, 0.05, 0), orb: c2(0, 0, 0), scale: 1, light: 0.9, gold: 0.7, m: { cam: c2(0, -2.4, 7.6), look: c2(0, -2.45, 0), scale: 0.62 } },
  { s: 6.8, cam: c2(-1.8, 0.25, 7.0), look: c2(-1.7, 0.0, 0), orb: c2(0, 0, 0), scale: 1, light: 0.9, gold: 0.7, m: { cam: c2(0, -2.45, 7.4), look: c2(0, -2.5, 0), scale: 0.62 } },
  // 08 assistant — the 3D orb bows out; the floating widget is the orb now
  { s: 7.3, cam: c2(0, 0.4, 13), look: c2(0, 0.2, 0), orb: c2(0, 0, 0), scale: 0.0, light: 0.55, gold: 0.6 },
  { s: 7.8, cam: c2(0, 0.6, 15), look: c2(0, 0.3, 0), orb: c2(0, 0, 0), scale: 0.0, light: 0.5, gold: 0.6 },
  // 09 clarity — wide, slow, calm galaxy; orb far below the copy
  { s: 8.3, cam: c2(0, 6.5, 17), look: c2(0, 1.2, 0), orb: c2(0, 0, 0), scale: 0.0, light: 0.75, gold: 0.5 },
  { s: 8.85, cam: c2(1.5, 7.4, 15.5), look: c2(0, 1.2, 0), orb: c2(0, 0, 0), scale: 0.0, light: 0.8, gold: 0.5 },
  // 10 product — orb as a backlight behind the device
  { s: 9.3, cam: c2(0, 0.2, 9.2), look: c2(0, 0.25, 0), orb: c2(0, -0.6, -3), scale: 1.7, light: 0.8, gold: 0.8, m: { scale: 0 } },
  { s: 9.85, cam: c2(0, 0.1, 8.8), look: c2(0, 0.2, 0), orb: c2(0, -0.6, -3), scale: 1.7, light: 0.8, gold: 0.8, m: { scale: 0 } },
  // 11 final — centred, matched to the official film plate (scale overridden at runtime)
  { s: 10.08, cam: c2(0, 0, 7), look: c2(0, 0, 0), orb: c2(0, 0, 0), scale: 1, light: 1, gold: 1 },
  { s: 11.0, cam: c2(0, 0, 7), look: c2(0, 0, 0), orb: c2(0, 0, 0), scale: 1, light: 1, gold: 1 },
];

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpC = new Vector3();
const tmpD = new Vector3();

function pick(k: Key, ch: "cam" | "look" | "orb", portrait: boolean): V {
  return (portrait && k.m?.[ch]) || k[ch];
}

/** centripetal-ish Catmull-Rom between p1 and p2 */
function catmull(out: Vector3, p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  out.set(0, 0, 0);
  out.addScaledVector(p0, -0.5 * t3 + t2 - 0.5 * t);
  out.addScaledVector(p1, 1.5 * t3 - 2.5 * t2 + 1);
  out.addScaledVector(p2, -1.5 * t3 + 2 * t2 + 0.5 * t);
  out.addScaledVector(p3, 0.5 * t3 - 0.5 * t2);
  return out;
}

export type Pose = { cam: Vector3; look: Vector3; orb: Vector3; scale: number; light: number; gold: number };

export function samplePose(s: number, portrait: boolean, out: Pose): Pose {
  const n = KEYS.length;
  let i = 0;
  while (i < n - 2 && s > KEYS[i + 1]!.s) i++;
  const k1 = KEYS[i]!;
  const k2 = KEYS[i + 1]!;
  const k0 = KEYS[Math.max(0, i - 1)]!;
  const k3 = KEYS[Math.min(n - 1, i + 2)]!;
  const raw = Math.min(1, Math.max(0, (s - k1.s) / (k2.s - k1.s)));
  const t = raw * raw * (3 - 2 * raw);
  // The membrane crossing (0.9 → 1.0) is a cut hidden by the flash: never interpolate across it.
  const cut = k1.s === 0.9 && k2.s === 1.0;
  for (const ch of ["cam", "look", "orb"] as const) {
    const target = out[ch];
    if (cut) {
      target.fromArray(t < 0.5 ? pick(k1, ch, portrait) : pick(k2, ch, portrait));
      continue;
    }
    const nearCut0 = k0.s === 0.9 && k1.s === 1.0;
    const nearCut3 = k2.s === 0.9 && k3.s === 1.0;
    tmpA.fromArray(pick(nearCut0 ? k1 : k0, ch, portrait));
    tmpB.fromArray(pick(k1, ch, portrait));
    tmpC.fromArray(pick(k2, ch, portrait));
    tmpD.fromArray(pick(nearCut3 ? k2 : k3, ch, portrait));
    catmull(target, tmpA, tmpB, tmpC, tmpD, t);
  }
  const sc1 = portrait && k1.m?.scale !== undefined ? k1.m.scale : k1.scale;
  const sc2 = portrait && k2.m?.scale !== undefined ? k2.m.scale : k2.scale;
  out.scale = cut ? (t < 0.5 ? sc1 : sc2) : sc1 + (sc2 - sc1) * t;
  out.light = k1.light + (k2.light - k1.light) * t;
  out.gold = k1.gold + (k2.gold - k1.gold) * t;
  return out;
}
